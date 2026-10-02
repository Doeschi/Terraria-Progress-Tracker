#!/usr/bin/env python3
"""
Step 1 of the Terraria tracker pipeline: download raw Cargo tables from
terraria.wiki.gg and save each one as a semicolon-separated CSV file. No processing - values are
kept exactly as Cargo stores them (list fields stay joined with their
delimiter); only HTML entities from the API (e.g. &#039;) are decoded.

Outputs (in --out, default raw/ next to this script):
  items.csv        full Items table (all fields + Cargo's _ID, _pageName, _pageID)
  exclusive.csv    full Exclusive table
  history.csv      full History table (patch notes per page, used for "introduced in")
  drops.csv        full Drops table (what NPCs, bags and containers drop)
  npcs.csv         full NPCs table (names, types, sprites of enemies and bosses)
  equipinfo.csv    full Equipinfo table (which player values an equippable item changes)
  recipes.csv      full Recipes table (crafting recipes and shimmer transmutations)
  schema.json      field types / list delimiters per table, needed by step 2
  page_images.json images used on a few wiki pages (Rarity, Coins, Difficulty), for their icons
  page_wikitext.json  source text of a few wiki pages (Alternative crafting
                   ingredients: the items of the "Any ..." recipe groups;
                   Bestiary/List: all bestiary entries in the in-game order;
                   MediaWiki:Common.css: the platform icons of {{eicons}};
                   the vendor pages: their shops with the conditions per item;
                   Extractinator, Chlorophyte Extractinator: what they turn blocks into)
  page_html.json   rendered HTML of a few wiki pages (NPC IDs: internal names,
                   ids and images of all NPCs)
  page_categories.json  the pages in a few wiki categories (Hardmode-only NPCs: enemies
                   that only appear in Hardmode, for the milestones)
  download_info.json  date of the download (the data version, REQUIREMENTS DU3)
  drop_groups.json source text of the pages whose drop lists have groups ("one of the
                   following items"; found by the wiki search insource:"group:start")

Requires:  pip install requests
Contact:   wiki.gg asks for a contact in the User-Agent. Give it with --contact, the
           environment variable WIKI_CONTACT, or put it in contact.txt next to this
           script (not committed); otherwise the project URL is used.
Usage:     python download_cargo_tables.py
           python download_cargo_tables.py --tables Recipes --pages   (only some tables)

Wiki content is CC BY-NC-SA 4.0.
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import time
import tomllib
from pathlib import Path

import requests

API = "https://terraria.wiki.gg/api.php"
# wiki.gg asks scripts for a descriptive User-Agent with a contact. The contact is not
# stored in the code: --contact, else the environment variable WIKI_CONTACT, else the
# first line of contact.txt next to this script (git-ignored), else the project URL.
PROJECT_URL = "https://github.com/Doeschi/Terraria-Progress-Tracker"
CONTACT_FILE = Path(__file__).resolve().parent / "contact.txt"
DEFAULT_TABLES = ["Items", "Exclusive", "History", "Drops", "NPCs", "Equipinfo", "Recipes"]
# Pages whose image lists are saved (icons for rarities and coins).
DEFAULT_PAGES = ["Rarity", "Coins", "Difficulty"]
# Pages whose wikitext is saved; the vendor pages of mapping.toml are added (their shops).
DEFAULT_WIKITEXT = ["Alternative crafting ingredients", "Bestiary/List", "MediaWiki:Common.css",
                    "Extractinator", "Chlorophyte Extractinator"]
MAPPING_FILE = Path(__file__).resolve().parent / "mapping.toml"
# Pages whose rendered HTML is saved (tables filled by templates/queries).
DEFAULT_HTML = ["NPC IDs"]
# Categories whose pages are listed.
DEFAULT_CATEGORIES = ["Hardmode-only NPCs"]
# Wiki search for the pages with drop groups (their source text is saved).
DROP_GROUP_SEARCH = 'insource:"group:start"'
PAGE_SIZE = 500
# Semicolon-separated CSV; values containing ";" are quoted by the csv module.
CSV_DELIMITER = ";"
# Cargo's built-in columns that exist on every table.
INTERNAL_FIELDS = ["_ID", "_pageName", "_pageID"]


class WikiError(Exception):
    pass


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def safe_alias(field):
    """Result keys must be plain identifiers (e.g. '3ds' -> 'f_3ds')."""
    alias = re.sub(r"\W", "_", field).lstrip("_") or "f"
    return f"f_{alias}" if alias[0].isdigit() else alias


def vendor_pages():
    """Wiki pages of the vendors in mapping.toml ([vendors.*] `page`, else `name`)."""
    if not MAPPING_FILE.exists():
        return []
    vendors = tomllib.loads(MAPPING_FILE.read_text(encoding="utf-8")).get("vendors", {})
    return [v.get("page", v["name"]) for v in vendors.values()]


def contact(cli_value=None):
    """Contact for the User-Agent (see PROJECT_URL above)."""
    if cli_value:
        return cli_value
    if os.environ.get("WIKI_CONTACT"):
        return os.environ["WIKI_CONTACT"]
    if CONTACT_FILE.exists():
        line = CONTACT_FILE.read_text(encoding="utf-8").strip().splitlines()
        if line and line[0].strip():
            return line[0].strip()
    return PROJECT_URL


class Wiki:
    def __init__(self, delay, contact_info):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = f"TerrariaProgressTracker/1.0 ({PROJECT_URL}; contact: {contact_info})"
        self.delay = delay

    def get(self, **params):
        params.update(format="json", formatversion="2", maxlag="5")
        for attempt in range(6):
            try:
                resp = self.session.get(API, params=params, timeout=90)
                time.sleep(self.delay)
                if resp.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(f"HTTP {resp.status_code}")
                resp.raise_for_status()
                data = resp.json()
            except (requests.RequestException, ValueError) as exc:
                wait = 2 ** attempt * 2
                log(f"  request failed ({exc}), retrying in {wait}s")
                time.sleep(wait)
                continue
            if "error" in data:
                if data["error"].get("code") == "maxlag":
                    time.sleep(5)
                    continue
                raise WikiError(data["error"])
            return data
        raise RuntimeError(f"Giving up on request: {params}")

    def schema(self, table):
        """{field: {"type", "list", "delimiter"}} from action=cargofields."""
        data = self.get(action="cargofields", table=table)
        schema = {}
        for name, info in data.get("cargofields", {}).items():
            is_list = info.get("isList")
            schema[name] = {
                "type": info.get("type", "String"),
                "list": is_list is not None and is_list is not False,
                "delimiter": info.get("delimiter") or None,
            }
        if not schema:
            raise WikiError(f"table '{table}' has no fields (does it exist?)")
        return schema

    def query(self, table, fields, offset, limit):
        aliases = {f: safe_alias(f) for f in fields}
        data = self.get(
            action="cargoquery", tables=table, limit=limit, offset=offset,
            order_by=f"{table}._ID",
            fields=",".join(f"{table}.{f}={a}" for f, a in aliases.items()),
        )
        rows = []
        for r in data.get("cargoquery", []):
            row = r.get("title", r)
            rows.append({f: row.get(a) for f, a in aliases.items()})
        return rows

    def queryable(self, table, fields):
        """Return the fields Cargo accepts; warn about and drop the rest."""
        try:
            self.query(table, fields, 0, 1)
            return list(fields)
        except WikiError:
            pass
        ok = []
        for f in fields:
            try:
                self.query(table, [f], 0, 1)
                ok.append(f)
            except WikiError as exc:
                log(f"  warning: {table}.{f} can't be queried, column left out ({exc})")
        return ok

    def page_images(self, page):
        """File names of all images used on a page (e.g. 'Gold_Coin.png')."""
        data = self.get(action="parse", page=page, prop="images")
        return data.get("parse", {}).get("images", [])

    def wikitext(self, page):
        data = self.get(action="parse", page=page, prop="wikitext")
        return data.get("parse", {}).get("wikitext", "")

    def html(self, page):
        data = self.get(action="parse", page=page, prop="text")
        return data.get("parse", {}).get("text", "")

    def category_members(self, category):
        """Titles of the main-namespace pages in a category."""
        titles, cont = [], {}
        while True:
            data = self.get(action="query", list="categorymembers", cmtitle=f"Category:{category}",
                            cmnamespace="0", cmlimit="500", **cont)
            titles += [m["title"] for m in data["query"]["categorymembers"]]
            if "continue" not in data:
                return titles
            cont = {"cmcontinue": data["continue"]["cmcontinue"]}

    def search(self, query):
        """Titles of the main-namespace pages a wiki search finds."""
        titles, cont = [], {}
        while True:
            data = self.get(action="query", list="search", srsearch=query, srnamespace="0",
                            srlimit="500", srwhat="text", srprop="", **cont)
            titles += [r["title"] for r in data["query"]["search"]]
            if "continue" not in data:
                return titles
            cont = {"sroffset": data["continue"]["sroffset"]}

    def wikitexts(self, titles):
        """{title: source text}, 50 pages per request."""
        texts = {}
        for i in range(0, len(titles), 50):
            data = self.get(action="query", prop="revisions", rvprop="content", rvslots="main",
                            titles="|".join(titles[i:i + 50]))
            for page in data["query"]["pages"]:
                if page.get("revisions"):
                    texts[page["title"]] = page["revisions"][0]["slots"]["main"]["content"]
            log(f"  {len(texts)} of {len(titles)} pages")
        return texts

    def download(self, table, fields):
        rows, offset = [], 0
        while True:
            batch = self.query(table, fields, offset, PAGE_SIZE)
            rows.extend(batch)
            log(f"  {table}: {len(rows)} rows")
            if len(batch) < PAGE_SIZE:
                return rows
            offset += PAGE_SIZE


def clean(value):
    if value is None:
        return ""
    return html.unescape(str(value))


def write_csv(path, fields, rows):
    # utf-8-sig so Excel opens umlauts/special characters correctly
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, delimiter=CSV_DELIMITER)
        writer.writerow(fields)
        for row in rows:
            writer.writerow([clean(row.get(c)) for c in fields])


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tables", nargs="*", default=DEFAULT_TABLES,
                    help="Cargo tables to download (default: Items Exclusive History Drops NPCs "
                         "Equipinfo Recipes)")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "raw",
                    help="output folder (default: raw/ next to this script)")
    ap.add_argument("--pages", nargs="*", default=DEFAULT_PAGES,
                    help="wiki pages whose image lists are saved (default: Rarity Coins Difficulty)")
    ap.add_argument("--wikitext", nargs="*", default=DEFAULT_WIKITEXT + vendor_pages(),
                    help="wiki pages whose source text is saved (default: 'Alternative crafting "
                         "ingredients' 'Bestiary/List' 'MediaWiki:Common.css' 'Extractinator' "
                         "'Chlorophyte Extractinator' and the vendor pages of mapping.toml); added "
                         "to the pages saved before")
    ap.add_argument("--html", nargs="*", default=DEFAULT_HTML,
                    help="wiki pages whose rendered HTML is saved (default: 'NPC IDs')")
    ap.add_argument("--categories", nargs="*", default=DEFAULT_CATEGORIES,
                    help="wiki categories whose pages are listed (default: 'Hardmode-only NPCs')")
    ap.add_argument("--no-drop-groups", dest="drop_groups", action="store_false",
                    help="don't download the pages with drop groups")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    ap.add_argument("--contact", help="contact for the wiki's User-Agent (default: WIKI_CONTACT, "
                                      "contact.txt or the project URL)")
    args = ap.parse_args()

    wiki = Wiki(args.delay, contact(args.contact))
    args.out.mkdir(parents=True, exist_ok=True)
    if args.tables:
        # the data version (REQUIREMENTS DU3): the day the tables were downloaded
        info_path = args.out / "download_info.json"
        info_path.write_text(json.dumps({"date": time.strftime("%Y-%m-%d")}, indent=1), encoding="utf-8")
    schemas = {}
    for table in args.tables:
        log(f"{table}: reading schema…")
        try:
            schema = wiki.schema(table)
        except WikiError as exc:
            log(f"  error: {exc} - skipping table")
            continue
        schemas[table] = schema
        log(f"  {len(schema)} fields")
        fields = wiki.queryable(table, INTERNAL_FIELDS + list(schema))
        rows = wiki.download(table, fields)
        path = args.out / f"{table.lower()}.csv"
        write_csv(path, fields, rows)
        log(f"  wrote {path} ({len(rows)} rows, {len(fields)} columns)")

    if args.pages:
        log("Reading page images…")
        images = {page: wiki.page_images(page) for page in args.pages}
        images_path = args.out / "page_images.json"
        images_path.write_text(json.dumps(images, indent=1, ensure_ascii=False), encoding="utf-8")
        log(f"wrote {images_path}")

    if args.wikitext:
        log("Reading page wikitext…")
        texts_path = args.out / "page_wikitext.json"
        # merge, so downloading only some pages keeps the others
        texts = json.loads(texts_path.read_text(encoding="utf-8")) if texts_path.exists() else {}
        texts.update({page: wiki.wikitext(page) for page in args.wikitext})
        texts_path.write_text(json.dumps(texts, indent=1, ensure_ascii=False), encoding="utf-8")
        log(f"wrote {texts_path}")

    if args.html:
        log("Reading page HTML…")
        texts = {page: wiki.html(page) for page in args.html}
        html_path = args.out / "page_html.json"
        html_path.write_text(json.dumps(texts, indent=1, ensure_ascii=False), encoding="utf-8")
        log(f"wrote {html_path}")

    if args.categories:
        log("Reading categories…")
        cats_path = args.out / "page_categories.json"
        cats = json.loads(cats_path.read_text(encoding="utf-8")) if cats_path.exists() else {}
        cats.update({c: wiki.category_members(c) for c in args.categories})
        cats_path.write_text(json.dumps(cats, indent=1, ensure_ascii=False), encoding="utf-8")
        log(f"wrote {cats_path}")

    if args.drop_groups:
        log("Reading the pages with drop groups…")
        titles = wiki.search(DROP_GROUP_SEARCH)
        log(f"  {len(titles)} pages found")
        groups_path = args.out / "drop_groups.json"
        texts = dict(sorted(wiki.wikitexts(titles).items()))
        groups_path.write_text(json.dumps(texts, indent=1, ensure_ascii=False), encoding="utf-8")
        log(f"wrote {groups_path}")

    if schemas:
        # merge, so downloading only some tables keeps the schemas of the others
        schema_path = args.out / "schema.json"
        existing = json.loads(schema_path.read_text(encoding="utf-8")) if schema_path.exists() else {}
        schema_path.write_text(json.dumps({**existing, **schemas}, indent=1, ensure_ascii=False),
                               encoding="utf-8")
        log(f"wrote {schema_path}")


if __name__ == "__main__":
    main()