#!/usr/bin/env python3
"""
Step 3 of the Terraria tracker pipeline: pack the small wiki icons the app shows into sprite
sheets, so the app does not load thousands of single images from the wiki.

  1. collect the icon links of the generated data (../web/public/data/*.json): PNG files,
     without the bestiary and the placed / equipped item images
  2. download the files not in the local cache yet (icons_cache/, not committed; --refresh
     asks the wiki again for every cached file and only downloads changed ones)
  3. pack all icons of at most 128 x 64 px into sheets of 1024 x (at most) 2048 px
     (../web/public/icons/sheet-<n>.<hash>.png) and write ../web/public/data/sprites.json:
     {"sheets": [{"file", "w", "h"}], "icons": {"<wiki file>": [sheet, x, y, w, h]}}
  4. a copy in data_readable/ (sprites.json indented, the sheets in data_readable/icons/;
     skip with --no-readable)

Larger images and animated GIFs stay links to the wiki.

Usage:  python build_icons.py
        python build_icons.py --refresh --workers 4 --contact you@example.com
Requires: pip install requests pillow
"""
import argparse
import hashlib
import io
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote

import requests
from PIL import Image

from download_cargo_tables import PROJECT_URL, contact, log

HERE = Path(__file__).resolve().parent
IMAGES = "https://terraria.wiki.gg/images/"
MAX_WIDTH, MAX_HEIGHT = 128, 64  # wide: rarity names like "Light Purple"
SHEET_WIDTH = 1024
SHEET_MAX_HEIGHT = 2048
PAD = 1
# fields whose images are not packed (large, only shown in the detail panel)
SKIP_FIELDS = {"iconPlaced", "iconEquipped"}
SKIP_FILES = {"bestiary.json", "sprites.json"}


def icon_links(data_dir):
    """Wiki file names (as in the URL after /images/) of the PNG icons in the data."""
    found = set()

    def walk(value, field=None):
        if isinstance(value, str):
            if value.startswith(IMAGES) and value.lower().endswith(".png") and field not in SKIP_FIELDS:
                found.add(value[len(IMAGES):])
        elif isinstance(value, dict):
            for k, v in value.items():
                walk(v, k)
        elif isinstance(value, list):
            for v in value:
                walk(v, field)

    for path in sorted(data_dir.glob("*.json")):
        if path.name not in SKIP_FILES:
            walk(json.loads(path.read_text(encoding="utf-8")))
    return found


class Cache:
    """icons_cache/<file> plus index.json (ETag / Last-Modified per file, for --refresh)."""

    def __init__(self, folder, user_agent, delay):
        self.folder = folder
        self.folder.mkdir(parents=True, exist_ok=True)
        self.index_path = folder / "index.json"
        self.index = json.loads(self.index_path.read_text(encoding="utf-8")) if self.index_path.exists() else {}
        self.session = requests.Session()
        self.session.headers["User-Agent"] = user_agent
        self.delay = delay

    def path(self, name):
        # file names can contain characters Windows does not allow
        return self.folder / hashlib.sha1(name.encode()).hexdigest()

    def fetch(self, name, refresh):
        """-> 'cached' | 'downloaded' | 'unchanged' | 'missing' | 'error'"""
        path = self.path(name)
        if path.exists() and not refresh:
            return "cached"
        headers = {}
        meta = self.index.get(name, {})
        if path.exists():
            if meta.get("etag"):
                headers["If-None-Match"] = meta["etag"]
            if meta.get("modified"):
                headers["If-Modified-Since"] = meta["modified"]
        for attempt in range(4):
            try:
                resp = self.session.get(IMAGES + name, headers=headers, timeout=60)
            except requests.RequestException:
                time.sleep(2 ** attempt)
                continue
            time.sleep(self.delay)
            if resp.status_code == 304:
                return "unchanged"
            if resp.status_code == 404:
                return "missing"
            if resp.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt * 2)
                continue
            if resp.status_code != 200:
                return "error"
            path.write_bytes(resp.content)
            self.index[name] = {"etag": resp.headers.get("etag"), "modified": resp.headers.get("last-modified")}
            return "downloaded"
        return "error"

    def save_index(self):
        self.index_path.write_text(json.dumps(self.index, indent=0, sort_keys=True), encoding="utf-8")


def pack(images):
    """Shelf packing, tallest first: [(name, image)] -> sheets [[(name, image, x, y)]], sizes."""
    order = sorted(images, key=lambda ni: (-ni[1].height, -ni[1].width, ni[0]))
    sheets, sizes = [], []
    placed, x, y, shelf = [], 0, 0, 0
    for name, img in order:
        w, h = img.width + PAD, img.height + PAD
        if x + w > SHEET_WIDTH:
            x, y, shelf = 0, y + shelf, 0
        if y + h > SHEET_MAX_HEIGHT:
            # sheet full: phones limit the size of decoded images
            sheets.append(placed)
            sizes.append((SHEET_WIDTH, y))
            placed, x, y, shelf = [], 0, 0, 0
        placed.append((name, img, x, y))
        x, shelf = x + w, max(shelf, h)
    sheets.append(placed)
    sizes.append((SHEET_WIDTH, y + shelf))
    return sheets, sizes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=HERE.parent / "web" / "public" / "data")
    ap.add_argument("--out", type=Path, default=HERE.parent / "web" / "public" / "icons")
    ap.add_argument("--cache", type=Path, default=HERE / "icons_cache")
    ap.add_argument("--readable", type=Path, default=HERE / "data_readable",
                    help="folder for a copy (sprites.json indented, sheets in icons/)")
    ap.add_argument("--no-readable", action="store_true", help="skip the copy")
    ap.add_argument("--refresh", action="store_true", help="revalidate cached files with the wiki")
    ap.add_argument("--workers", type=int, default=4, help="parallel downloads")
    ap.add_argument("--delay", type=float, default=0.1, help="seconds to wait after each request")
    ap.add_argument("--contact", help="contact for the wiki's User-Agent (see download_cargo_tables.py)")
    args = ap.parse_args()

    names = sorted(icon_links(args.data))
    log(f"{len(names)} PNG icons linked from {args.data}")
    cache = Cache(args.cache, f"TerrariaProgressTracker/1.0 ({PROJECT_URL}; contact: {contact(args.contact)})",
                  args.delay)
    results = {}
    with ThreadPoolExecutor(args.workers) as pool:
        for n, (name, status) in enumerate(zip(names, pool.map(lambda nm: cache.fetch(nm, args.refresh), names))):
            results[name] = status
            if (n + 1) % 500 == 0:
                log(f"  {n + 1} / {len(names)}")
                cache.save_index()
    cache.save_index()
    counts = {s: sum(1 for v in results.values() if v == s) for s in set(results.values())}
    log(f"  {counts}")
    problems = [n for n, s in results.items() if s in ("missing", "error")]
    if problems:
        log(f"  not available ({len(problems)}; run check_icons.py): {[unquote(p) for p in problems[:20]]}")

    images, too_big = [], 0
    for name in names:
        path = cache.path(name)
        if results.get(name) in ("missing", "error") or not path.exists():
            continue
        try:
            img = Image.open(io.BytesIO(path.read_bytes()))
            if getattr(img, "is_animated", False):
                continue  # APNG: stays a link
            img = img.convert("RGBA")
        except OSError:
            continue
        if img.width > MAX_WIDTH or img.height > MAX_HEIGHT:
            too_big += 1
            continue
        images.append((name, img))
    log(f"  packing {len(images)} icons ({too_big} larger than {MAX_WIDTH} x {MAX_HEIGHT} px stay links)")

    sheets, sizes = pack(images)
    readable_icons = None if args.no_readable else args.readable / "icons"
    for folder in filter(None, (args.out, readable_icons)):
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("sheet-*.png"):
            old.unlink()
    manifest = {"sheets": [], "icons": {}}
    for n, (placed, (w, h)) in enumerate(zip(sheets, sizes)):
        sheet = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        for name, img, x, y in placed:
            sheet.paste(img, (x, y))
            manifest["icons"][name] = [n, x, y, img.width, img.height]
        buf = io.BytesIO()
        sheet.save(buf, "PNG", optimize=True)
        digest = hashlib.sha1(buf.getvalue()).hexdigest()[:10]
        file = f"sheet-{n}.{digest}.png"
        (args.out / file).write_bytes(buf.getvalue())
        if readable_icons:
            (readable_icons / file).write_bytes(buf.getvalue())
        manifest["sheets"].append({"file": f"icons/{file}", "w": w, "h": h})
        log(f"  wrote {file}: {w} x {h} px, {len(buf.getvalue()) // 1024} KB, {len(placed)} icons")
    manifest["icons"] = dict(sorted(manifest["icons"].items()))
    out = args.data / "sprites.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Wrote {out} ({len(manifest['icons'])} icons)")
    if readable_icons:
        # same relative paths ("icons/sheet-...") as in the app
        (args.readable / "sprites.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                                                    encoding="utf-8")
        log(f"Wrote the copy to {args.readable} (sprites.json, icons/)")


if __name__ == "__main__":
    main()
