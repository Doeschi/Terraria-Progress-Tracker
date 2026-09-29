#!/usr/bin/env python3
"""
Step 2 of the Terraria tracker pipeline: turn the raw Cargo tables from step 1
(download_cargo_tables.py) into static JSON files for the client. No network
access - everything comes from the raw/ folder and mapping.toml.

Inputs:
  raw/items.csv, exclusive.csv, history.csv, drops.csv, npcs.csv, recipes.csv,
  page_images.json, page_wikitext.json (incl. MediaWiki:Common.css), page_html.json,
  schema.json   (from step 1)
  mapping.toml   how raw type/listcat/tag values become categories,
                 subcategories, obtain methods, vendors, events and flags

Outputs (in --out, default ../web/public/data), minified; indented copies of the
same files go to --readable (default data_readable/ next to this script):
  items.json          one entry per item, with parsed fields for filtering,
                      sorting and lookup
  categories.json     \
  subcategories.json   |  id, name, icon, count (+ parent for subcategories)
  obtain.json          |  in the order of mapping.toml
  vendors.json         |
  events.json         |
  biomes.json         |  where the enemies spawn that drop an item
  times.json         /   day / night
  platforms.json      id, name, icon (from the wiki's CSS), count
  versions.json       game updates (1.0 ... 1.4.5) with the number of items added
  rarities.json       rarity levels with name and icon (from the wiki's Rarity page)
  coins.json          coin types with value in copper and icon (from the Coins page)
  difficulties.json   world difficulties with icon (from the Difficulty page)
  drops.json          drop sources (enemies, bosses, treasure bags) and the drops per item
  bosses.json         curated bosses by stage with their drop sources (mapping.toml)
  recipes.json        crafting recipes (result, stations, ingredients), crafting
                      stations with the items that provide them, "Any ..."
                      ingredient groups, shimmer transmutations
  bestiary.json       bestiary entries in the in-game order (type, biomes, times,
                      events, version, platforms) and the entry types

Usage:  python build_tracker_data.py
        python build_tracker_data.py --raw raw --mapping mapping.toml --out ../web/public/data
        (default paths are relative to this script's folder)

Wiki content is CC BY-NC-SA 4.0 - credit the Terraria Wiki if you publish this data.
"""
import argparse
import html
import json
from collections import Counter, defaultdict
from pathlib import Path

from trackerdata.common import (
    LIST_SECTIONS,
    PLATFORM_FIELDS,
    PLATFORM_NAMES,
    log,
    norm_name,
    read_csv,
)
from trackerdata.mapping import Mapping
from trackerdata.items import (
    build_item,
    correct_versions_by_id,
    History,
    make_keys_unique,
    pick_rows,
    read_equipinfo,
    section_file,
    versions_file,
)
from trackerdata.drops import derive_events, derive_spawns, Drops
from trackerdata.recipes import recipes_file
from trackerdata.bestiary import bestiary_file
from trackerdata.icons import icon_files, platform_icons

HERE = Path(__file__).resolve().parent


def build(raw_dir, mapping_path, out_dir, readable_dir=None):
    mapping = Mapping(mapping_path)
    schema = json.loads((raw_dir / "schema.json").read_text(encoding="utf-8"))
    item_schema = schema["Items"]

    log("Reading raw tables…")
    rows = pick_rows(read_csv(raw_dir / "items.csv"))
    exclusive = {norm_name(r["_pageName"]): r for r in read_csv(raw_dir / "exclusive.csv")}
    history = History(read_csv(raw_dir / "history.csv"), {html.unescape(r["name"]) for r in rows})
    equip = read_equipinfo(raw_dir / "equipinfo.csv")
    npc_rows = read_csv(raw_dir / "npcs.csv")
    # items that are catchable critters (NPCs of type critter / gold critter)
    critters = {norm_name(r["nameraw"]) for r in npc_rows
                if {"critter", "gold critter"} & {t.strip().lower() for t in r["type"].split("^")}}

    def build_items(extra):
        """Items from the rows; `extra` adds keys per (item id, name) for mapping rules."""
        built, unmapped = [], Counter()
        for row in rows:
            keys = set(extra.get((int(row["itemid"]), norm_name(row["name"])), ()))
            if norm_name(row["name"]) in critters:
                keys.add("npc:critter")
            item, unmatched = build_item(row, mapping, item_schema, exclusive, history, equip, sorted(keys))
            built.append(item)
            unmapped.update(unmatched)
        built.sort(key=lambda i: (i["id"], i["name"]))
        make_keys_unique(built)
        correct_versions_by_id(built, list(mapping.versions))
        return built, unmapped

    # Two passes: the drops can only be matched to built items, but mapping rules
    # may use them ("drop:npc", "drop:boss"), so the items are built again.
    log("Building items…")
    items, unmapped = build_items({})
    drops = Drops(read_csv(raw_dir / "drops.csv"), npc_rows, items, mapping.drop_kinds)
    boss_sources = {norm_name(n) for b in mapping.bosses.values() for n in b.get("sources", [])}
    extra = defaultdict(set)
    for item in items:
        for d in drops.drops.get(item["key"], ()):
            source = drops.sources[d["source"]]
            if source["kind"] == "npc":
                extra[(item["id"], norm_name(item["name"]))].add("drop:npc")
            if norm_name(source["name"]) in boss_sources:
                extra[(item["id"], norm_name(item["name"]))].add("drop:boss")
    items, unmapped = build_items(extra)
    drops = Drops(read_csv(raw_dir / "drops.csv"), npc_rows, items, mapping.drop_kinds)

    for pattern, _ in mapping.manual:
        if not mapping.manual_used[pattern]:
            log(f"  warning: [manual] '{pattern}' matches no items")
    no_cat = [i["name"] for i in items if not i["categories"]]
    log(f"  {len(items)} items, {len(no_cat)} without category, "
        f"{sum(1 for i in items if i['platformsKnown'])} with platform data, "
        f"{sum(1 for i in items if 'version' in i)} with version, "
        f"{sum(1 for i in items if 'minDifficulty' in i)} Expert/Master-only")
    if no_cat:
        log(f"  without category (add them to [manual] in mapping.toml): {no_cat}")
    if unmapped:
        log(f"  unmapped raw values (add them to mapping.toml or [ignore]):")
        for key, n in unmapped.most_common():
            log(f"    {n:5}  {key}")

    log("Drops…")
    log(f"  {sum(len(v) for v in drops.drops.values())} drops of {len(drops.drops)} items "
        f"from {len(drops.sources)} sources; skipped kinds: {dict(drops.skipped)}")
    if drops.unmatched:
        log(f"  drop rows naming no known item: {dict(drops.unmatched.most_common(15))}")
    derive_events(items, drops, mapping.sections["events"], mapping.bosses)
    derive_spawns(items, drops, mapping)

    outputs = {"items.json": items}
    for section in LIST_SECTIONS:
        outputs[f"{section}.json"] = section_file(section, mapping.sections[section], items)
    wikitext = json.loads((raw_dir / "page_wikitext.json").read_text(encoding="utf-8"))
    p_icons = platform_icons(wikitext.get("MediaWiki:Common.css", ""))
    outputs["platforms.json"] = [
        {k: v for k, v in {"id": p, "name": PLATFORM_NAMES[p], "icon": p_icons.get(p),
                           "count": sum(1 for i in items if p in i["platforms"])}.items()
         if v is not None}
        for p in PLATFORM_FIELDS]
    outputs["versions.json"] = versions_file(items, mapping.versions, mapping.version_icons)
    outputs["rarities.json"], outputs["coins.json"], outputs["difficulties.json"] =         icon_files(raw_dir, items)

    outputs["drops.json"] = drops.drops_file()
    outputs["bosses.json"] = drops.bosses_file(mapping.boss_stages, mapping.bosses, mapping.boss_ignore_items)

    log("Recipes…")
    outputs["recipes.json"] = recipes_file(read_csv(raw_dir / "recipes.csv"), items, mapping,
                                           wikitext.get("Alternative crafting ingredients", ""))

    log("Bestiary…")
    page_html = json.loads((raw_dir / "page_html.json").read_text(encoding="utf-8"))
    outputs["bestiary.json"] = bestiary_file(wikitext.get("Bestiary/List", ""),
                                             page_html.get("NPC IDs", ""), npc_rows, exclusive,
                                             mapping, mapping.versions)

    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, data in outputs.items():
        path = out_dir / filename
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        log(f"Wrote {path} ({len(data)} entries)")
    if readable_dir:
        # indented copies for reading (not used by the app, not deployed)
        readable_dir.mkdir(parents=True, exist_ok=True)
        for filename, data in outputs.items():
            (readable_dir / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2),
                                                 encoding="utf-8")
        log(f"Wrote readable copies to {readable_dir}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, default=HERE / "raw", help="folder with step-1 output")
    ap.add_argument("--mapping", type=Path, default=HERE / "mapping.toml")
    ap.add_argument("--out", type=Path, default=HERE.parent / "web" / "public" / "data",
                    help="output folder")
    ap.add_argument("--readable", type=Path, default=HERE / "data_readable",
                    help="folder for indented copies of the output (default: data_readable/ "
                         "next to this script)")
    ap.add_argument("--no-readable", action="store_true", help="skip the indented copies")
    args = ap.parse_args()
    build(args.raw, args.mapping, args.out, None if args.no_readable else args.readable)


if __name__ == "__main__":
    main()
