"""Armor and vanity sets (sets.json; REQUIREMENTS D18c).

The pieces of a set share a wiki page whose name ends in "armor" or "set" ("Hallowed armor",
"Pirate set"); such a page with at least 2 items is a set. `[sets]` in mapping.toml adds pages
(`include`) or leaves them out (`exclude`).
"""
import re
from collections import defaultdict

from .common import log, norm_name, page_url, slug

SET_PAGE = re.compile(r"\b(armor|set)$", re.I)


def find_sets(items, conf=None):
    """[{"id", "name", "url", "kind": "armor" | "vanity", "items": [item keys]}], by page name."""
    conf = conf or {}
    include = {norm_name(p) for p in conf.get("include", [])}
    exclude = {norm_name(p) for p in conf.get("exclude", [])}
    by_page = defaultdict(list)
    for item in items:
        if item.get("page") and not item.get("unobtainable"):
            by_page[item["page"]].append(item)
    sets = []
    for page, members in sorted(by_page.items()):
        n = norm_name(page)
        if n in exclude or len(members) < 2 or not (SET_PAGE.search(page) or n in include):
            continue
        armor = sum("armor" in i["categories"] for i in members)
        vanity = sum("vanity" in i["categories"] for i in members)
        if not armor and not vanity:
            continue
        sets.append({"id": slug(page), "name": page, "url": page_url(page),
                     "kind": "armor" if armor >= vanity else "vanity",
                     "items": [i["key"] for i in members]})
    log(f"  sets: {len(sets)} ({sum(s['kind'] == 'armor' for s in sets)} armor, "
        f"{sum(s['kind'] == 'vanity' for s in sets)} vanity) with "
        f"{sum(len(s['items']) for s in sets)} items")
    return sets
