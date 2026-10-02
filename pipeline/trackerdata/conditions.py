"""Conditions of vendor shop rows and drops (conditions.json, shops.json): time of day, moon
phase, bosses defeated, wind, events, biomes, world seeds, ... - see [conditions] in mapping.toml."""
import html
import re
from collections import Counter, defaultdict

from .common import OTHER_SOURCES, image_url, log, norm_name, seed_only, slug, strip_markup

# words that negate the rest of a clause: "before defeating [[Golem]]", "except [[Remix]] worlds";
# "defeated on the same day as the [[Wall of Flesh]]" is no "after" condition either
NEGATION = re.compile(r"\b(before|except|not|without|unless|no|outside|same day)\b", re.I)
LINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]")
MOONS = re.compile(r"\{\{\s*moons\s*\|([^}]*)\}\}", re.I)
# special conditions with a number or name: regex -> (id, name); shown in the Conditions column
DYNAMIC = [
    (re.compile(r"filled to at least (\d+)\s*%", re.I),
     lambda m: (f"bestiary-{m.group(1)}", f"Bestiary ≥ {m.group(1)} %")),
    (re.compile(r"bestiary has been filled completely", re.I), lambda m: ("bestiary-100", "Bestiary complete")),
    (re.compile(r"all three fairies", re.I), lambda m: ("bestiary-fairies", "All three fairies in the Bestiary")),
    (re.compile(r"golf score over (\d+)", re.I), lambda m: (f"golf-{m.group(1)}", f"Golf score over {m.group(1)}")),
    (re.compile(r"only if name is (\w+)", re.I),
     lambda m: (f"npc-name-{m.group(1).lower()}", f"NPC named {m.group(1)}")),
]


def templates(text, name):
    """Inner text of every {{name|...}} in `text` (nested templates and links kept)."""
    start = re.compile(r"\{\{\s*" + re.escape(name) + r"\s*\|", re.I)
    pos = 0
    while True:
        m = start.search(text, pos)
        if not m:
            return
        depth, j = 0, m.start()
        while j < len(text):
            if text.startswith("{{", j):
                depth, j = depth + 1, j + 2
            elif text.startswith("}}", j):
                depth, j = depth - 1, j + 2
                if depth == 0:
                    break
            else:
                j += 1
        yield text[m.end():j - 2]
        pos = j


def split_args(inner):
    """Template arguments split at top-level "|" -> (positional, named)."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(inner):
        two = inner[i:i + 2]
        if two in ("{{", "[["):
            depth, cur, i = depth + 1, cur + two, i + 2
        elif two in ("}}", "]]"):
            depth, cur, i = depth - 1, cur + two, i + 2
        elif inner[i] == "|" and depth == 0:
            parts.append(cur)
            cur, i = "", i + 1
        else:
            cur, i = cur + inner[i], i + 1
    parts.append(cur)
    positional, named = [], {}
    for p in parts:
        m = re.match(r"\s*([a-z]+)\s*=(.*)", p, re.S)
        if m:
            named[m.group(1)] = m.group(2).strip()
        else:
            positional.append(p.strip())
    return positional, named


def condition_text(wikitext):
    """Condition wikitext -> plain text for display (moon icons are shown separately)."""
    text = MOONS.sub("", wikitext)
    text = re.sub(r"\{\{\s*b entries\s*\|[^}]*\}\}", "", text, flags=re.I)
    text = re.sub(r"\{\{\s*pc\s*\|\s*([^}|]*)\}\}", r"\1 platinum", text, flags=re.I)
    text = re.sub(r"\{\{\s*(?:small|sc)\s*\|([^}]*)\}\}", r"\1", text, flags=re.I)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    text = strip_markup(text).replace("\n", " ")
    text = re.sub(r"\(\s*\)", "", text)
    return re.sub(r"\s+([.,:;])", r"\1", re.sub(r"\s+", " ", text)).strip(" :")


class Conditions:
    """Maps condition wikitext to ids: [conditions.*] (own filter group), and the links of
    [events.*] / [biomes.*] (existing groups). Bosses give "after-<boss>" conditions."""

    def __init__(self, mapping, items):
        conf = mapping.conditions
        self.groups = conf.get("groups", {})
        self.entries = {cid: c for cid, c in conf.items() if cid != "groups" and isinstance(c, dict)}
        self.item_icons = {norm_name(i["name"]): i.get("icon") for i in items}
        # after a boss: "when [[Plantera]] has been defeated"
        for bid, boss in mapping.bosses.items():
            names = [boss.get("name", bid), *boss.get("sources", [])]
            self.entries[f"after-{bid}"] = {"name": boss.get("name", bid), "group": "boss", "boss": bid,
                                            "links": [n.lower() for n in names], "after": True}
        self.link_map = defaultdict(list)   # link target -> [(kind, id, entry)]
        self.phrases = []                   # (regex, kind, id)
        for kind, section in (("condition", self.entries), ("event", mapping.sections["events"]),
                              ("biome", mapping.sections["biomes"])):
            for eid, e in section.items():
                for link in e.get("links", []):
                    self.link_map[link.lower()].append((kind, eid, e))
                for p in e.get("phrases", []):
                    self.phrases.append((re.compile(p, re.I), kind, eid))
        self.moon_ids = {int(e["moon"]): cid for cid, e in self.entries.items() if "moon" in e}
        self.ignore_links = set(self.item_icons) | {x.lower() for x in conf.get("ignore_links", [])}
        self.unmapped = Counter()

    @staticmethod
    def clauses(text):
        """Clauses of a condition text: "In [[Hardmode]], during [[night]], when [[Plantera]] has
        been defeated." -> 3. Split at , ; : . ( and "or", not inside links ("[[Zenith (seed)|…]]").
        Sentences that start with a negation ("Not available in worlds with …") are skipped."""
        links = []

        def protect(m):
            links.append(m.group(0))
            return f"\x00{len(links) - 1}\x00"

        def restore(s):
            return re.sub(r"\x00(\d+)\x00", lambda m: links[int(m.group(1))], s)

        # <br/> only wraps lines: "When the [[Martian Madness]]<br/>has been defeated."
        protected = re.sub(r"\[\[[^\]]*\]\]", protect, re.sub(r"<br\s*/?>", " ", text))
        out = []
        for sentence in re.split(r"(?<=\.)\s|\n", protected):
            if re.match(r"\s*(not|never)\b", sentence, re.I):
                continue
            out += [restore(c) for c in re.split(r"[,;:.(]|\bor\b", sentence) if c.strip()]
        return out

    def parse(self, wikitext):
        """-> {"condition": [ids], "event": [ids], "biome": [ids], "moons": [1..8]}"""
        found = {"condition": [], "event": [], "biome": []}
        text = html.unescape(wikitext or "")
        moons = sorted({int(n) for m in MOONS.finditer(text) for n in re.findall(r"\d", m.group(1))})

        def add(kind, cid):
            if cid not in found[kind]:
                found[kind].append(cid)

        for n in moons:
            if n in self.moon_ids:
                add("condition", self.moon_ids[n])
        for clause in self.clauses(MOONS.sub("", text)):
            neg = NEGATION.search(clause)
            for m in LINK.finditer(clause):
                if neg and neg.start() < m.start():
                    continue
                target = m.group(1).strip().lower()
                hits = self.link_map.get(target)
                if not hits:
                    if target not in self.ignore_links and not target.startswith(("file:", "category:")):
                        self.unmapped[target] += 1
                    continue
                defeated = "defeat" in clause.lower()
                for kind, cid, entry in hits:
                    if entry.get("after") and not defeated:
                        continue
                    if kind == "event" and defeated:
                        continue  # "when a [[Pirate Invasion]] has been defeated" - after, not during
                    if "moon" in entry and moons:
                        continue  # the {{moons}} numbers are exact
                    add(kind, cid)
            plain = strip_markup(clause)
            neg_plain = NEGATION.search(plain)
            for regex, kind, cid in self.phrases:
                m = regex.search(plain)
                if m and not (neg_plain and neg_plain.start() < m.start()):
                    add(kind, cid)
        # special cases with a number or name of their own
        plain = strip_markup(MOONS.sub("", text))
        for regex, make in DYNAMIC:
            for m in regex.finditer(plain):
                cid, name = make(m)
                self.entries.setdefault(cid, {"name": name, "group": "special"})
                add("condition", cid)
        return {**found, "moons": moons}

    def filterable(self, cid):
        return self.groups.get(self.entries[cid]["group"], {}).get("filter", False)

    def conditions_file(self, items, bosses_icons):
        """conditions.json: groups (in mapping order) and conditions with item counts."""
        counts = Counter(c for i in items for c in i.get("conditions", []))
        out = []
        for cid, e in self.entries.items():
            if not counts[cid] and e["group"] == "boss":
                continue  # bosses nothing depends on
            icon = None
            if e.get("icon_file"):
                icon = image_url(e["icon_file"])
            elif e.get("boss"):
                icon = bosses_icons.get(e["boss"])
            elif e.get("icon"):
                icon = self.item_icons.get(norm_name(e["icon"]))
                if not icon:
                    log(f"  warning: condition {cid}: icon item '{e['icon']}' not found")
            out.append({k: v for k, v in {"id": cid, "name": e["name"], "group": e["group"],
                                          "icon": icon, "count": counts[cid]}.items() if v is not None})
        groups = [{"id": gid, "name": g["name"], "filter": g.get("filter", False)}
                  for gid, g in self.groups.items()]
        return {"groups": groups, "conditions": out}


def shops_file(shops):
    """shops.json: item key -> shop rows for display (vendor, condition text, condition ids,
    event and biome ids, moon phases)."""
    return {key: [{k: v for k, v in {"vendor": r["vendor"], "text": r["text"],
                                     "conditions": r["conditions"] or None,
                                     "events": r["events"] or None, "biomes": r["biomes"] or None,
                                     "moons": r["moons"] or None}.items() if v is not None}
                  for r in rows]
            for key, rows in sorted(shops.items())}


def shop_rows(wikitext_pages, vendors, resolve, conditions):
    """Shop rows of the vendor pages: item key -> [{vendor, text, conditions, moons}] (+ ids
    of events and biomes, used for the item's groups)."""
    rows = defaultdict(list)
    unmatched = Counter()
    for vid, vendor in vendors.items():
        page = vendor.get("page", vendor["name"])
        text = wikitext_pages.get(page)
        if not text:
            log(f"  warning: vendor page '{page}' not downloaded (run download_cargo_tables.py)")
            continue
        for inner in templates(text, "shop row"):
            args, _ = split_args(inner)
            if not args or not args[0]:
                continue
            name = strip_markup(args[0])
            # "Princess Dress (Clothier)" -> Princess Dress; "Any Pylon" = pylons of happy NPCs
            items = resolve(name) or resolve(re.sub(r"\s*\([^)]*\)$", "", name))
            if not items and name.lower().startswith("any "):
                continue
            if not items:
                unmatched[name] += 1
                continue
            cond = args[1] if len(args) > 1 else ""
            parsed = conditions.parse(cond)
            if seed_only({"conditions": parsed["condition"]}):
                # a sentence without a seed ("Always available.", "In a Jungle.") is the regular
                # case, the others describe special seeds: a regular row with those conditions
                sentences = [x for x in re.split(r"(?<=\.)\s+|<br\s*/?>", cond) if strip_markup(x).strip(" .")]
                regular = [x for x in sentences if not seed_only({"conditions": conditions.parse(x)["condition"]})]
                if regular and len(regular) < len(sentences):
                    parsed = conditions.parse(" ".join(regular))
            row = {"vendor": vid, "text": condition_text(cond) or None,
                   "conditions": parsed["condition"], "moons": parsed["moons"],
                   "events": parsed["event"], "biomes": parsed["biome"]}
            for item in items:
                if row not in rows[item["key"]]:
                    rows[item["key"]].append(row)
    if unmatched:
        log(f"  shop rows naming no known item: {dict(unmatched.most_common(15))}")
    return rows


def page_rewards(obtain_sections, wikitext_pages, resolve, conditions):
    """Obtain entries filled from a wiki page section ([obtain.*] `page`, `section`), e.g. the
    Strange Plant rewards of the Dye Trader: {obtain id: {item key: [condition ids]}}. The
    conditions come from the headings above the items ("After defeating [[Plantera]]")."""
    out = {}
    for oid, conf in obtain_sections.items():
        if not conf.get("page"):
            continue
        text = wikitext_pages.get(conf["page"], "")
        m = re.search(r"^=+\s*" + re.escape(conf["section"]) + r"\s*=+\s*$", text, re.M)
        if not m:
            log(f"  warning: obtain {oid}: section '{conf['section']}' not found on '{conf['page']}'")
            continue
        end = re.search(r"^==[^=]", text[m.end():], re.M)
        section = text[m.end():m.end() + end.start()] if end else text[m.end():]
        found, current = {}, []
        for line in section.split("\n"):
            for inner in templates(line, "infocard/mainheading"):
                title = split_args(inner)[0][0]
                # "any [[Mechanical bosses|mechanical boss]]" -> the link text decides
                current = conditions.parse(re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"[[\1]]", title))["condition"]
            for name in re.findall(r"\{\{\s*item\s*\|([^|}]+)", line):
                items = resolve(name.strip())
                if not items:
                    log(f"  warning: obtain {oid}: unknown item '{name.strip()}'")
                for item in items:
                    found[item["key"]] = current
        out[oid] = found
    return out


def apply_page_rewards(items, rewards, obtain_sections):
    """Put the items of page_rewards into their obtain entry (instead of `replaces`)."""
    order = list(obtain_sections)
    for item in items:
        for oid, found in rewards.items():
            if item["key"] in found:
                replaced = obtain_sections[oid].get("replaces")
                item["obtain"] = [o for o in item["obtain"] if o != replaced]
                if oid not in item["obtain"]:
                    item["obtain"].append(oid)
                item["obtain"].sort(key=order.index)
    for oid, found in rewards.items():
        log(f"  {oid}: {len(found)} items from the page '{obtain_sections[oid]['page']}'")


def required_conditions(item, rows, drops, conditions, rewards=None):
    """Filterable conditions the item can only be obtained under: per condition group (time of
    day, moon phase, boss, weather) every source must be restricted within the group - then the
    item belongs to the group's conditions of its sources. E.g. Leaf Wings (only the Witch
    Doctor, at night after Plantera) -> night, after Plantera; a Glowstick (Merchant at night,
    Skeleton Merchant by day, enemies any time) -> nothing.
    Sources: shop rows (not those only in special seeds), drops (an enemy's spawn times count
    as the drop's; containers are never restricted) and obtain methods without such data
    (crafting, fishing, ...; vendors without a shop row) as unrestricted."""
    sources = [set(r["conditions"]) for r in rows if not seed_only(r)]
    for d in drops.drops.get(item["key"], []):
        if seed_only(d):
            continue
        source = drops.sources[d["source"]]
        if source["kind"] == "container":
            sources.append(set())
        else:
            sources.append(set(d.get("conditions", [])) | set(source.get("times", [])))
    # rewards with the conditions of their heading (e.g. Strange Plant rewards after Plantera)
    for found in (rewards or {}).values():
        if item["key"] in found:
            sources.append(set(found[item["key"]]))
    unrestricted = {"crafted", "fishing", "quest-reward", "plunder", "loot"}
    shop_vendors = {r["vendor"] for r in rows}
    # obtain methods without drop data (e.g. developer items from any treasure bag)
    if item["key"] not in drops.drops:
        unrestricted |= {"drop", "bag", "treasure-bag"}
    if unrestricted & set(item["obtain"]) or any(v not in shop_vendors for v in item["vendors"]):
        sources.append(set())
    if not sources:
        return []
    required = set()
    for group, conf in conditions.groups.items():
        if not (conf.get("filter") or conf.get("column")):
            continue
        per_source = [{c for c in s if conditions.entries.get(c, {}).get("group") == group} for s in sources]
        if all(per_source):
            required |= set().union(*per_source)
    return [c for c in conditions.entries if c in required]


def apply_conditions(items, drops, shops, conditions, mapping, rewards=None):
    """Item fields from shop rows and drop conditions: vendors, events, biomes (where / when it
    can be obtained), conditions (only obtainable then, see required_conditions), eventOnly."""
    event_order, biome_order = list(mapping.sections["events"]), list(mapping.sections["biomes"])
    by_key = {i["key"]: i for i in items}
    added_vendors = removed_vendors = 0
    for key, item in by_key.items():
        events, biomes = set(item["events"]), set(item["biomes"])
        # rows only in special world seeds count for nothing (CO6): a vendor that has only such
        # rows is no vendor of the item (e.g. the Princess's Terragrim)
        all_rows = shops.get(key, [])
        rows = [r for r in all_rows if not seed_only(r)]
        seed_vendors = {r["vendor"] for r in all_rows} - {r["vendor"] for r in rows}
        if seed_vendors & set(item["vendors"]):
            removed_vendors += len(seed_vendors & set(item["vendors"]))
            item["vendors"] = [v for v in item["vendors"] if v not in seed_vendors]
        # sold only in special seeds (also when the wiki tags it just "vendor"): not bought
        if all_rows and not rows and not item["vendors"] and "vendor" in item["obtain"]:
            item["obtain"].remove("vendor")
        for r in rows:
            if r["vendor"] not in item["vendors"]:
                item["vendors"].append(r["vendor"])
                added_vendors += 1
            events.update(r["events"])
            biomes.update(r["biomes"])
        if rows and "vendor" not in item["obtain"]:
            item["obtain"].append("vendor")
        for d in drops.drops.get(key, []):
            # container drops (chest contents in special seeds, fruit at night) only show theirs
            if drops.sources[d["source"]]["kind"] != "container" and not seed_only(d):
                events.update(d.get("events", []))
                biomes.update(d.get("biomes", []))
        item["conditions"] = required_conditions(item, rows, drops, conditions, rewards)
        item["events"] = [e for e in event_order if e in events]
        item["biomes"] = [b for b in biome_order if b in biomes]
        # event only: every drop (see derive_events) and every shop row is bound to an event
        if rows:
            shop_events = all(r["events"] for r in rows)
            only_shops = not (OTHER_SOURCES - {"vendor"}) & set(item["obtain"]) and key not in drops.drops
            if item.get("eventOnly") and not shop_events:
                item.pop("eventOnly")
            elif shop_events and (only_shops or item.get("eventOnly")):
                item["eventOnly"] = True
    log(f"  shops: {sum(len(v) for v in shops.values())} rows for {len(shops)} items "
        f"({added_vendors} vendors added, {removed_vendors} only in special seeds removed); conditions for "
        f"{sum(1 for i in items if i['conditions'])} items")
    if conditions.unmapped:
        log(f"  condition links not mapped (add them to mapping.toml or [conditions] ignore_links): "
            f"{dict(conditions.unmapped.most_common(30))}")
