#!/usr/bin/env python3
"""
Step 3 of the Terraria tracker pipeline: pack the wiki images the app shows into sprite sheets,
so the app does not load hundreds of single images from the wiki.

  1. collect the image links of the generated data (../web/public/data/*.json): item icons,
     filter icons, enemies, bosses and critters (bestiary, drop sources)
  2. download the files not in the local cache yet (icons_cache/, not committed; --refresh
     asks the wiki again for every cached file and only downloads changed ones)
  3. pack them into sheets of 1024 x (at most) 2048 px (../web/public/icons/sheet-<n>.<hash>.png)
     and write ../web/public/data/sprites.json:
     {"sheets": [{"file", "w", "h"}], "icons": {"<wiki file>": [sheet, x, y, w, h]}}
     Animated images (GIF, APNG) become their first frame. Icons larger than 128 x 64 px, and
     enemies / bosses / critters larger than 64 x 64 px, are scaled down to fit. Enemies, bosses
     and critters get sheets of their own (only loaded where they are shown: bestiary, details).
  4. a copy in data_readable/ (sprites.json indented, the sheets in data_readable/icons/;
     skip with --no-readable)

Animated images that stay links to the wiki: the rarity names (rarities.json) and the ones the
easter eggs load themselves (bees, the rare bunny, the critter parade).

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
NPC_MAX = 64  # enemies, bosses, critters: shown at 32 px
SHEET_WIDTH = 1024
SHEET_MAX_HEIGHT = 2048
PAD = 1
# animated images that stay links to the wiki (the shimmering Expert / Master rarity names)
KEEP_ANIMATED = {"rarities.json"}


def icon_links(data_dir):
    """Wiki file names (as in the URL after /images/) -> "item" (icons) or "npc" (enemies,
    bosses, critters: own sheets, at most 64 x 64 px). An image used as both is an item icon."""
    found = {}

    def add(name, group):
        if found.get(name) != "item":
            found[name] = group

    def walk(value, group, keep_animated=False):
        if isinstance(value, str):
            if value.startswith(IMAGES):
                name = value[len(IMAGES):]
                if not (keep_animated and name.lower().endswith(".gif")):
                    add(name, group)
        elif isinstance(value, dict):
            for v in value.values():
                walk(v, group, keep_animated)
        elif isinstance(value, list):
            for v in value:
                walk(v, group, keep_animated)

    for path in sorted(data_dir.glob("*.json")):
        if path.name == "sprites.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if path.name == "bestiary.json":
            walk(data["entries"], "npc")
            walk(data["types"], "item")
        elif path.name == "drops.json":
            for source in data["sources"].values():
                walk(source, "npc" if source["kind"] == "npc" else "item")
        else:
            walk(data, "item", path.name in KEEP_ANIMATED)
    return found


def fit(img, max_w, max_h):
    """Scaled down to fit max_w x max_h (keeps the aspect ratio)."""
    ratio = min(max_w / img.width, max_h / img.height)
    return img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)


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

    groups = icon_links(args.data)
    names = sorted(groups)
    npcs = sum(1 for g in groups.values() if g == "npc")
    log(f"{len(names)} images linked from {args.data} ({npcs} enemies, bosses and critters)")
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

    images = {"item": [], "npc": []}
    scaled = 0
    for name in names:
        path = cache.path(name)
        if results.get(name) in ("missing", "error") or not path.exists():
            continue
        try:
            img = Image.open(io.BytesIO(path.read_bytes()))
            img.seek(0)  # animated GIF / APNG: the first frame
            img = img.convert("RGBA")
        except OSError:
            continue
        max_w, max_h = (NPC_MAX, NPC_MAX) if groups[name] == "npc" else (MAX_WIDTH, MAX_HEIGHT)
        if img.width > max_w or img.height > max_h:
            img = fit(img, max_w, max_h)
            scaled += 1
        images[groups[name]].append((name, img))
    log(f"  packing {len(images['item'])} icons and {len(images['npc'])} enemies, bosses and critters "
        f"({scaled} scaled down)")

    # item icons first; enemies, bosses and critters in sheets of their own
    sheets, sizes = [], []
    for group in ("item", "npc"):
        group_sheets, group_sizes = pack(images[group])
        sheets += group_sheets
        sizes += group_sizes
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
