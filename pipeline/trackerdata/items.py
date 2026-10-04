"""Items: rows of the Items table -> item records (platforms, versions from History, difficulty, sections)."""
import fnmatch
import html
import re
from collections import Counter, defaultdict

from .common import (
    DEFAULT_PLATFORMS,
    DIFFICULTY_BY_RARITY,
    OTHER_SOURCES,
    PLATFORM_FIELDS,
    coins,
    file_from_wikitext,
    flag,
    image_url,
    log,
    lower_text,
    norm_name,
    norm_value,
    number,
    page_url,
    rarity,
    seed_only,
    read_csv,
    strip_markup,
    tooltip_text,
)


def pick_rows(rows):
    """Drop rows without an item id (set pages) and duplicates.

    itemid alone is not unique (some old-gen/3DS items reuse ids), so rows are
    grouped by (itemid, name); per group the row on the item's own page wins."""
    groups = defaultdict(list)
    skipped = 0
    for row in rows:
        if not row["itemid"].strip():
            skipped += 1
            continue
        groups[(int(row["itemid"]), norm_name(row["name"]))].append(row)
    picked = []
    for group in groups.values():
        group.sort(key=lambda r: (norm_name(r["_pageName"]) != norm_name(r["name"]),
                                  int(r["_ID"])))
        picked.append(group[0])
    log(f"  {len(rows)} rows -> {len(picked)} items "
        f"({skipped} rows without item id, {len(rows) - skipped - len(picked)} duplicates)")
    return picked


def platforms_of(row, exclusive):
    """Exclusive rows are per page; try the item's name first, then its page."""
    excl = exclusive.get(norm_name(row["name"])) or exclusive.get(norm_name(row["_pageName"]))
    plats = [p for p in PLATFORM_FIELDS if excl and flag(excl.get(p))]
    return (plats, True) if plats else (list(DEFAULT_PLATFORMS), False)


def patch_version(patch):
    """'Desktop 1.4.0.1' -> (1, 4, 0, 1), 'Desktop-Release' -> (1, 0); other platforms -> None."""
    if patch.strip() == "Desktop-Release":
        return (1, 0)
    m = re.fullmatch(r"Desktop ([\d.]+)", patch.strip())
    return tuple(int(x) for x in m.group(1).strip(".").split(".")) if m else None


def version_group(v):
    """Game update an exact patch belongs to: 1.0-1.3 by minor version, 1.4.x separately."""
    return f"{v[0]}.{v[1]}" if v[:2] < (1, 4) else f"{v[0]}.{v[1]}.{v[2] if len(v) > 2 else 0}"


def format_version(v):
    return ".".join(map(str, v))


class History:
    """'Introduced in' per item from the wiki's History table (Desktop patches, English).

    History is stored per wiki page. An item on its own page gets the patch whose
    notes say "Introduced". On shared pages (e.g. "Lamps") an item may have been
    added later: then the earliest sentence naming the item together with "added" /
    "introduced" wins. Longer item names containing the name ("Ancient Iron
    Helmet" for "Iron Helmet") are masked first, file embeds are ignored.
    """

    ADDED = re.compile(r"\b(added|introduced)\b", re.I)
    INTRODUCED = re.compile(r"\bintroduced\b", re.I)

    def __init__(self, rows, all_names):
        self.pages = defaultdict(list)
        for r in rows:
            v = patch_version(r["patch"])
            if r["lang"] == "en" and v:
                lines = [self.clean(part) for line in r["changes"].split("\n")
                         for part in re.split(r"(?<=[.;])\s+|\s+with\s+", line)]
                self.pages[norm_name(r["_pageName"])].append((v, lines))
        # word suffix -> longer names ending with it, for masking
        self.longer = defaultdict(set)
        for name in all_names:
            words = name.split()
            for i in range(1, len(words)):
                self.longer[" ".join(words[i:]).lower()].add(name)

    @staticmethod
    def clean(text):
        text = html.unescape(text)
        text = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", text)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\[\[[^|\]]*\|([^\]]*)\]\]", r"\1", text)
        return re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)

    def introduced(self, name, page):
        rows = self.pages.get(norm_name(page), [])
        page_intro = min((v for v, lines in rows if any(self.INTRODUCED.search(l) for l in lines)),
                         default=None)
        if norm_name(page) == norm_name(name):
            return page_intro
        own = re.compile(r"(?<![\w'])" + re.escape(name) + r"(?![\w'])")
        longer = sorted(self.longer.get(name.lower(), ()), key=len, reverse=True)
        found = []
        for v, lines in rows:
            for line in lines:
                for other in longer:
                    line = line.replace(other, "")
                if own.search(line) and self.ADDED.search(line):
                    found.append(v)
        item_intro = min(found, default=None)
        if item_intro and (not page_intro or item_intro > page_intro):
            return item_intro
        return page_intro


def update_starts(items, order):
    """[(first item id, update)] in update order, from items with their own page."""
    starts, prev = [], -1
    for v in order:
        ids = [i["id"] for i in items if i.get("version") == v and i["page"] == i["name"] and i["id"] >= prev]
        if ids:
            prev = min(ids)
            starts.append((prev, v))
    return starts


def correct_versions_by_id(items, order):
    """Item ids grow with every update. On shared pages the notes often only say
    "Added Gothic furniture", so the page's older date is used. Derive the first
    id of each update from items with their own page and move shared-page items
    whose id is newer to that update. Only moves later: some old items were
    re-numbered (e.g. Copper Shortsword got id 3507 in 1.3)."""
    rank = {v: n for n, v in enumerate(order)}
    starts = update_starts(items, order)
    moved = 0
    for item in items:
        if "version" not in item or item["page"] == item["name"]:
            continue
        expected = max((v for start, v in starts if start <= item["id"]), key=rank.get, default=None)
        if expected and rank[expected] > rank[item["version"]]:
            item["version"] = expected
            item["introduced"] = expected
            moved += 1
    log(f"  {moved} shared-page items moved to a later update by item id")


def min_difficulty(item):
    need = DIFFICULTY_BY_RARITY.get(item.get("rarity"))
    if need and not OTHER_SOURCES & set(item["obtain"]):
        return need
    return None


def read_equipinfo(path):
    """Item id -> player fields the item changes ("equip:<field>" keys), from the
    wiki's Equipinfo table (game code names, e.g. moveSpeed, accRunSpeed)."""
    equip = defaultdict(set)
    if not path.exists():
        log("  warning: raw/equipinfo.csv missing - no equip:* keys")
        return equip
    for r in read_csv(path):
        if not r["itemid"].strip().lstrip("-").isdigit():
            continue
        for field, value in r.items():
            if value.strip() and not field.startswith("_") and field != "itemid":
                equip[int(r["itemid"])].add(field.lower())
    return equip


def build_item(row, mapping, schema, exclusive, history, equip, extra_keys=()):
    keys, _ = mapping.keys_of(row, schema)
    keys += list(extra_keys)
    # supplementary keys (not reported as unmapped): what the item changes when
    # equipped, and its wiki page (shared pages like "Chairs" group furniture)
    keys += [f"equip:{f}" for f in sorted(equip.get(int(row["itemid"]), ()))]
    keys.append(f"page:{norm_value(row['_pageName'])}")
    groups, flags, unmatched = mapping.apply(keys, row["name"])
    # Unobtainable items only belong to "Unobtainable": other labels the wiki gives them are
    # former or nominal sources (e.g. presents dropped until 1.2.2). mapping.toml can override.
    if norm_name(row["name"]) in mapping.obtainable:
        flags["unobtainable"] = False
        groups["obtain"] = [o for o in groups["obtain"] if o != "unobtainable"]
    elif norm_name(row["name"]) in mapping.unobtainable or flags.get("unobtainable"):
        flags["unobtainable"] = True
        groups["obtain"] = ["unobtainable"]
    unmatched = {k for k in unmatched if not k.startswith(("equip:", "page:", "npc:", "drop:", "bodyslot:"))}
    platforms, known = platforms_of(row, exclusive)
    page = html.unescape(row["_pageName"])
    name = html.unescape(row["name"])
    introduced = history.introduced(name, page)
    # the image field can name several files: "King Slime Relic.png / King Slime Relic (placed).png"
    images = [f.strip() for f in row["imagefile"].split(" / ") if f.strip()]
    internal = row["internalname"].strip()
    if internal.lower() in ("", "none"):  # some old-gen/3DS-only items have none
        internal = None
    item = {
        # stable id for saving progress; internal names come from the game code
        "key": internal or re.sub(r"\W", "", name.title()),
        "id": int(row["itemid"]),
        "name": name,
        "internalName": internal,
        "page": page,
        "url": page_url(page),
        "icon": image_url(images[0]) if images else None,
        **groups,
        "platforms": platforms,
        "platformsKnown": known,
        # Desktop patch that added the item, and the game update it belongs to
        "introduced": format_version(introduced) if introduced else None,
        "version": version_group(introduced) if introduced else None,
        **flags,
        "rarity": rarity(row["rare"]),
        "buy": coins(row["buy"]),
        "sell": coins(row["sell"]),
        "research": number(row["research"]),
        "stack": number(row["stack"]),
        "consumable": flag(row["consumable"]),
        "placeable": flag(row["placeable"]),
        "autoswing": flag(row["autoswing"]),
        "damage": number(row["damage"]),
        "damageType": lower_text(row["damagetype"]),
        "critical": number(row["critical"]),
        "knockback": number(row["knockback"], as_int=False),
        "velocity": number(row["velocity"], as_int=False),
        "useTime": number(row["usetime"]),
        "mana": number(row["mana"]),
        "defense": number(row["defense"]),
        "bodySlot": lower_text(row["bodyslot"]),
        "pickaxePower": number(row["pick"]),
        "axePower": number(row["axe"]),
        "hammerPower": number(row["hammer"]),
        "toolSpeed": number(row["toolspeed"]),
        "fishingPower": number(row["fishing"]),
        "baitPower": number(row["bait"]),
        "rangeBonus": number(row["bonus"]),
        "healLife": number(row["hheal"]),
        "healMana": number(row["mheal"]),
        "placedWidth": number(row["placedwidth"]),
        "placedHeight": number(row["placedheight"]),
        "buff": strip_markup(row["buffs"]) or None,
        "debuff": strip_markup(row["debuffs"]) or None,
        "tooltip": tooltip_text(row["tooltip"]) or None,
    }
    item["minDifficulty"] = min_difficulty(item)
    # keep the file small: stat fields that don't apply to the item are left out
    return {k: v for k, v in item.items() if v is not None}, unmatched


def make_keys_unique(items):
    seen = Counter(i["key"] for i in items)
    for item in items:
        if seen[item["key"]] > 1:
            item["key"] = f"{item['key']}-{item['id']}"
    dupes = [k for k, n in Counter(i["key"] for i in items).items() if n > 1]
    if dupes:
        log(f"  warning: duplicate item keys remain: {dupes}")


def derive_obtain(items, drops, shimmer_results, obtain_sections, extractinator=None):
    """Obtain methods from our own data, added to the wiki's tags ([obtain] from_drops,
    from_containers, from_shimmer, from_extractinator, names); items with none at all get the
    fallback entry. `extractinator`: item key -> machine ids it comes from."""
    extractinator = extractinator or {}
    order = list(obtain_sections)
    fallback = next((oid for oid, o in obtain_sections.items() if o.get("fallback")), None)
    added, removed = Counter(), Counter()
    for item in items:
        # unobtainable items only belong to "Unobtainable" (see build_item)
        if item.get("unobtainable"):
            continue
        have = set(item["obtain"])
        # rows only in special world seeds do not make an obtain method (e.g. "I am error" chests)
        kinds, groups, seed_kinds, seed_groups = set(), set(), set(), set()
        for d in drops.drops.get(item["key"], ()):
            source = drops.sources[d["source"]]
            seed = seed_only(d)
            (seed_kinds if seed else kinds).add(source["kind"])
            if source.get("group"):
                (seed_groups if seed else groups).add(source["group"])
        # the wiki tags an item from its drop rows too: a method it has only from seed-only rows goes
        for oid in list(have):
            o = obtain_sections.get(oid, {})
            drops_of, containers_of = set(o.get("from_drops", ())), set(o.get("from_containers", ()))
            if ((seed_kinds & drops_of or seed_groups & containers_of)
                    and not (kinds & drops_of or groups & containers_of)):
                have.discard(oid)
                removed[oid] += 1
        name = norm_name(item["name"])
        for oid, o in obtain_sections.items():
            if oid in have:
                continue
            if (kinds & set(o.get("from_drops", ())) or groups & set(o.get("from_containers", ()))
                    or (o.get("from_shimmer") and item["key"] in shimmer_results)
                    or set(o.get("from_extractinator", ())) & extractinator.get(item["key"], set())
                    or any(fnmatch.fnmatchcase(name, norm_name(p)) for p in o.get("names", ()))):
                have.add(oid)
                added[oid] += 1
        if fallback and not have:
            have.add(fallback)
            added[fallback] += 1
        item["obtain"] = sorted(have, key=order.index)
    log(f"  obtain methods added from drops, shimmer and names: {dict(added)}")
    log(f"  obtain methods only from special seeds, removed: {dict(removed)}")


def section_file(section, entries, items):
    icon_by_name = {}
    for item in items:  # items are sorted by id -> lowest id wins
        icon_by_name.setdefault(norm_name(item["name"]), item.get("icon"))
    members = defaultdict(list)
    for item in items:
        for entry_id in item[section]:
            members[entry_id].append(item)
    out = []
    for entry_id, entry in entries.items():
        found = members.get(entry_id, [])
        if not found:
            log(f"  warning: {section}.{entry_id} matches no items")
            continue
        if entry.get("icon_file"):
            icon = image_url(entry["icon_file"])
        elif entry.get("icon"):
            icon = icon_by_name.get(norm_name(entry["icon"]))
            if not icon:
                log(f"  warning: {section}.{entry_id}: icon item '{entry['icon']}' not found")
        else:
            icon = None
        record = {"id": entry_id, "name": entry.get("name", entry_id),
                  "icon": icon or found[0].get("icon"), "count": len(found)}
        # vendors: their head as on the map ("Map Icon Merchant.png") for the filters and the table;
        # the full body ("icon") stays for the detail panel
        head = entry.get("head_file") or (f"Map Icon {record['name']}.png" if section == "vendors" else None)
        if head:
            record["head"] = image_url(head)
        if entry.get("parent"):
            record["parent"] = entry["parent"]
        if entry.get("fallback"):
            record["fallback"] = True
        if entry.get("filter") is False:
            record["filter"] = False  # shown with the items only, no filter option
        out.append(record)
    return out


def versions_file(items, names, icons):
    counts = Counter(i["version"] for i in items if "version" in i)
    icon_of = {norm_name(i["name"]): i.get("icon") for i in items}
    for v, item in icons.items():
        if not icon_of.get(norm_name(item)):
            log(f"  warning: icon item '{item}' of version {v} not found")
    for v in counts:
        if v not in names:
            log(f"  warning: version {v} has no name in [versions] of mapping.toml")
    order = sorted(counts, key=lambda v: tuple(int(x) for x in v.split(".")))
    return [{k: val for k, val in {"id": v, "name": names.get(v, v), "count": counts[v],
                                   "icon": icon_of.get(norm_name(icons.get(v, "")))}.items()
             if val is not None} for v in order]
