#!/usr/bin/env python3
"""
Check that every wiki image the generated data links to exists - without
downloading the images: the file names are asked from the wiki's API in batches
of 50 (action=query, one request per 50 files).

Reports files that do not exist (broken icons) and files that are only redirects
(the direct /images/ link of a redirect is a 404). The redirects are added to
raw/image_redirects.json; run build_tracker_data.py again afterwards and it links
the targets instead.

Usage:  python check_icons.py                 (checks ../web/public/data/*.json)
        python check_icons.py --data some/folder --contact you@example.com
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote

from download_cargo_tables import Wiki, contact, log

HERE = Path(__file__).resolve().parent
IMAGES = "https://terraria.wiki.gg/images/"
BATCH = 50


def image_links(value, where, found):
    """Collect wiki image URLs in a JSON value: file name -> places that use it."""
    if isinstance(value, str):
        if value.startswith(IMAGES):
            found[unquote(value[len(IMAGES):]).replace("_", " ")].add(where)
    elif isinstance(value, dict):
        # name the place by the entry's name/id where there is one
        label = value.get("name") or value.get("id") or where
        for v in value.values():
            image_links(v, f"{where.split(':')[0]}: {label}" if label != where else where, found)
    elif isinstance(value, list):
        for v in value:
            image_links(v, where, found)


def check(wiki, names):
    """-> (missing names, {redirect name: target name})"""
    missing, redirects = [], {}
    names = sorted(names)
    for start in range(0, len(names), BATCH):
        titles = [f"File:{n}" for n in names[start:start + BATCH]]
        data = wiki.get(action="query", titles="|".join(titles), redirects="1")
        query = data.get("query", {})
        # the API normalises titles (e.g. first letter upper case) - map back
        normalized = {n["to"]: n["from"] for n in query.get("normalized", [])}
        for r in query.get("redirects", []):
            redirects[normalized.get(r["from"], r["from"]).removeprefix("File:")] = r["to"].removeprefix("File:")
        for page in query.get("pages", []):
            # a file page can be missing while the file exists (e.g. on a shared repository)
            if page.get("missing") and page.get("imagerepository", "") == "":
                title = page["title"]
                missing.append(normalized.get(title, title).removeprefix("File:"))
        log(f"  {min(start + BATCH, len(names))} / {len(names)}")
    return missing, redirects


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=HERE.parent / "web" / "public" / "data",
                    help="folder with the generated JSON files")
    ap.add_argument("--raw", type=Path, default=HERE / "raw",
                    help="folder of the raw data, where image_redirects.json is written")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    ap.add_argument("--contact", help="contact for the wiki's User-Agent (see download_cargo_tables.py)")
    args = ap.parse_args()

    found = defaultdict(set)
    for path in sorted(args.data.glob("*.json")):
        image_links(json.loads(path.read_text(encoding="utf-8")), path.stem, found)
    log(f"{len(found)} different wiki images linked from {args.data}")

    missing, redirects = check(Wiki(args.delay, contact(args.contact)), found)
    if missing:
        log(f"\n{len(missing)} images do not exist:")
        for name in sorted(missing):
            log(f"  {name}   <- {', '.join(sorted(found[name])[:3])}")
    if redirects:
        log(f"\n{len(redirects)} images are redirects (the direct link does not work):")
        for name, target in sorted(redirects.items()):
            log(f"  {name} -> {target}   <- {', '.join(sorted(found[name])[:3])}")
        path = args.raw / "image_redirects.json"
        known = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        known.update(redirects)
        path.write_text(json.dumps(dict(sorted(known.items())), ensure_ascii=False, indent=2), encoding="utf-8")
        log(f"\nSaved to {path} - run build_tracker_data.py again to link the targets.")
    if not missing and not redirects:
        log("All images exist.")


if __name__ == "__main__":
    main()
