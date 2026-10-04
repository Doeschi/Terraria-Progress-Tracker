"""Drops (drops.json, bosses.json) and what is derived from them: events, biomes and time of day."""
import fnmatch
import html
import re
from collections import Counter, defaultdict

from .conditions import condition_text
from .common import (
    OTHER_SOURCES,
    file_from_wikitext,
    flag,
    image_url,
    log,
    norm_name,
    page_url,
    seed_only,
    slug,
    warn,
    strip_markup,
)


DROP_MODES = ("normal", "expert", "master")


def strip_ids(drop):
    return {k: v for k, v in drop.items() if k not in ("npcIds", "variants", "_pages")}


def drop_text(value):
    """Rate/quantity wikitext -> plain text, e.g. '1% · Expert: 1.99%'."""
    text = html.unescape(value or "")
    text = re.sub(r"\[\[(Expert|Master) Mode\|", r"[[\1 Mode| · \1: ", text)
    text = strip_markup(text).replace("\n", " · ")
    return re.sub(r"\s+", " ", text).strip(" ·")


def drop_chance(text):
    """First chance in percent: '12.5%' -> 12.5, '1/24 (4.17%)' -> 4.17, '1/3' -> 33.33."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+)\s*/\s*(\d+)", text)
    return round(int(m.group(1)) / int(m.group(2)) * 100, 2) if m else None


def chance_values(text):
    """All chances in a text, in percent: '16.66% (Expert: 25%)' -> {16.66, 25.0}."""
    values = {float(v) for v in re.findall(r"(\d+(?:\.\d+)?)\s*%", text)}
    values |= {round(int(a) / int(b) * 100, 2) for a, b in re.findall(r"(\d+)\s*/\s*(\d+)", text) if int(b)}
    return values


def amounts(text):
    """The amounts in a text: '5–14 (Underground) · 3-10 (Cavern)' -> {'5–14', '3–10'}."""
    return {re.sub(r"\s*[–-]\s*", "–", a) for a in re.findall(r"\d+(?:\s*[–-]\s*\d+)?", text or "")}


def per_mode(text, modes, convert):
    """Split '1% · Expert: 1.99%' into values per game mode.

    The unlabeled value is the Normal mode one; 'Expert:' also applies to Master
    unless a 'Master:' value is given. A drop limited to Expert/Master without
    labels uses its only value for those modes. Only the drop's modes are kept."""
    base, labeled = None, {}
    for segment in (text or "").split(" · "):
        m = re.match(r"(Expert|Master):\s*(.*)", segment)
        if m:
            labeled[m.group(1).lower()] = m.group(2)
        elif base is None and segment.strip():
            base = segment
    raw = {
        "normal": base,
        "expert": labeled.get("expert", base),
        "master": labeled.get("master", labeled.get("expert", base)),
    }
    values = {mode: convert(raw[mode]) for mode in modes if raw[mode] is not None}
    return {k: v for k, v in values.items() if v is not None} or None


class Drops:
    """drops.json (sources + drops per item) and bosses.json from the wiki's
    Drops and NPCs tables.

    Drop rows name the item as text. They are matched to items by name, then
    without a disambiguation suffix ("Shadow Orb (item)"), then by wiki page
    ("Vampire set" -> every item on that page), then as furniture set
    ("Golden furniture" -> every furniture item named "Golden ...").
    """

    def __init__(self, drop_rows, npc_rows, items, include_kinds, containers=None, container_icons=None,
                 conditions=None, default_variants=None, groups=None, areas=None):
        self.include = set(include_kinds)
        self.conditions = conditions
        self.containers = containers or {}
        self.container_icons = container_icons or {}
        by_name, by_page = defaultdict(list), defaultdict(list)
        for item in items:
            by_name[norm_name(item["name"])].append(item)
            by_page[norm_name(item["page"])].append(item)
        self.by_name, self.by_page = by_name, by_page
        # layers of containers, by the note naming them ([drop_areas])
        self.areas = {norm_name(k): v for k, v in (areas or {}).items()}
        # names of the rows without a variant note, per source ([drop_variants])
        self.default_variants = {norm_name(k): v for k, v in (default_variants or {}).items()}
        self.npcs = {norm_name(r["nameraw"]): r for r in npc_rows}
        # first NPC row per wiki page (e.g. "Mythical Wyvern" -> its Head)
        self.npcs_by_page = {}
        for r in npc_rows:
            self.npcs_by_page.setdefault(norm_name(r["_pageName"]), r)
        self.sources = {}
        self.drops = defaultdict(list)
        self.unmatched = Counter()
        self.skipped = Counter()
        for row in drop_rows:
            self.add(row)
        if "npc" in self.include:
            self.add_banners(npc_rows)
        self.groups = {}
        self.group_report = Counter()
        self.group_pages = Counter()  # pages with rows or groups that could not be matched
        self.attach_groups(groups or {})

    def add_banners(self, npc_rows):
        """Enemy banners (every 50 kills) are not in the Drops table: the NPCs table names each
        enemy's banner (`bannername`). They become drops of the enemy with the rate "Banner", so
        biome, event and milestone follow from where the enemy spawns."""
        added, unmatched = 0, []
        # a row named after the main NPC of another page (Raincoat Zombie's variants are named
        # "Zombie") is its own page's NPC, not that other one
        main_pages = {norm_name(r["_pageName"]) for r in npc_rows if norm_name(r["nameraw"]) == norm_name(r["_pageName"])}
        for npc in npc_rows:
            name = html.unescape(npc.get("bannername") or "").strip()
            if not name or not npc["nameraw"].strip():
                continue
            items = self.resolve(name)
            if not items:
                unmatched.append(name)
                continue
            items = [i for i in items if not i.get("unobtainable")]  # e.g. unused cultist banners
            if not items:
                continue
            name_n, page_n = norm_name(npc["nameraw"]), norm_name(npc["_pageName"])
            owner = npc["_pageName"] if name_n != page_n and name_n in main_pages and page_n in main_pages else npc["nameraw"]
            sid = self.source({"nameraw": owner, "_pageName": npc["_pageName"]}, "npc")
            entry = {"source": sid, "quantity": "1", "rate": "Banner", "modes": list(DROP_MODES),
                     "quantities": {m: "1" for m in DROP_MODES}}
            for item in items:
                if entry not in self.drops[item["key"]]:
                    self.drops[item["key"]].append(entry)
                    added += 1
        log(f"  banners: {added} enemy banners linked to their enemy (NPCs table)")
        if unmatched:
            warn(f"unknown banner items: {sorted(set(unmatched))[:10]}")

    def npc_for(self, name):
        """NPCs-table row of a drop source; "Blue Slime (bonus drop)" -> "Blue Slime"."""
        n = norm_name(name)
        return self.npcs.get(n) or self.npcs.get(re.sub(r"\s*\(bonus drop\)$", "", n))

    def kind(self, row):
        if flag(row["isfromnpc"]):
            return "npc"
        return "bag" if row["nameraw"].startswith("Treasure Bag") else "container"

    def container_group(self, name):
        """[containers] group of a container source (first match, else the fallback group)."""
        n = norm_name(name)
        for gid, group in self.containers.items():
            if any(fnmatch.fnmatchcase(n, p) for p in group.get("match", [])):
                return gid
        return next((gid for gid, g in self.containers.items() if g.get("fallback")), None)

    def containers_file(self):
        """containers.json: the container groups in mapping order, each with its sources (by
        name), icon and the number of items found in them."""
        items_by_source = defaultdict(set)
        for key, entries in self.drops.items():
            for d in entries:
                items_by_source[d["source"]].add(key)
        out = []
        for gid, group in self.containers.items():
            sids = sorted((sid for sid, s in self.sources.items() if s.get("group") == gid),
                          key=lambda sid: self.sources[sid]["name"].lower())
            found = self.by_name.get(norm_name(group.get("icon", "")))
            if group.get("icon") and not found:
                log(f"  warning: container group {gid}: icon item '{group['icon']}' not found")
            icon = found[0].get("icon") if found else None
            count = len(set().union(*(items_by_source[s] for s in sids))) if sids else 0
            out.append({k: v for k, v in {"id": gid, "name": group.get("name", gid), "icon": icon,
                                          "sources": sids, "count": count}.items() if v is not None})
        return out

    def resolve(self, name):
        n = norm_name(name)
        found = self.by_name.get(n)
        kind = None
        if not found:
            # "Constellation (painting)": the painting, not the whip of that name
            m = re.search(r"\s*\((item|painting)\)$", n)
            base, kind = (n[:m.start()], m.group(1)) if m else (n, None)
            found = self.by_name.get(base) or self.by_page.get(n)
        if not found:
            # a whole furniture set, e.g. "Golden furniture" -> Golden Chair, Golden Bed, ...
            m = re.fullmatch(r"(.+) furniture", n)
            if m:
                prefix = m.group(1) + " "
                # set pieces are on the shared page of their type ("Chairs", "Work Benches"): not
                # the Golden Crate (a page of its own) or the golden grave markers ("Tombstones")
                found = [i for items in self.by_name.values() for i in items
                         if norm_name(i["name"]).startswith(prefix) and "furniture" in i["categories"]
                         and norm_name(i["page"]) not in (norm_name(i["name"]), "tombstones")]
        if found and len(found) > 1:
            # same name, several items: prefer obtainable ones (e.g. "Ogre Mask" has an unused,
            # unobtainable variant), then the item on its own page (e.g. "Seaweed") or of the kind
            # named in brackets
            found = [i for i in found if not i.get("unobtainable")] or found
            own = [i for i in found if norm_name(i["page"]) == n or kind in i["subcategories"]]
            found = own or found
        return found or []

    def source(self, row, kind):
        sid = slug(row["nameraw"])
        if sid not in self.sources:
            name = html.unescape(row["nameraw"])
            # wiki page: the source's link in the Drops table, else the page the row is on
            link = re.search(r"\[\[([^|\]#]+)", row.get("name") or "")
            page = html.unescape(link.group(1).strip()) if link else row.get("_pageName")
            record = {"id": sid, "name": name, "kind": kind, "url": page_url(page) if page else None}
            npc = self.npc_for(name)
            if not npc and page and norm_name(page) == norm_name(name):
                npc = self.npcs_by_page.get(norm_name(page))
            if npc:
                record["icon"] = image_url(file_from_wikitext(npc["image"]))
                if npc["npcid"].strip():
                    record["npcId"] = int(npc["npcid"])
            else:
                # bags and containers are items themselves; "Gold Chest (Dungeon)" -> Gold Chest,
                # trees use a configured item (their wood)
                icon_name = self.container_icons.get(norm_name(name)) or re.sub(r"\s*\([^)]*\)$", "", name)
                item = (self.resolve(name) or self.resolve(icon_name) or [None])[0]
                if item and item.get("icon"):
                    record["icon"] = item["icon"]
                # enemies without an NPC row (the item-carrying slimes on "Slimes", Mechdusa): the wiki
                # names their image after them (check_icons.py reports it if not)
                elif kind == "npc":
                    record["icon"] = image_url(f"{name}.png")
            if kind == "container":
                record["group"] = self.container_group(name)
            self.sources[sid] = {k: v for k, v in record.items() if v is not None}
        return sid

    def add(self, row):
        kind = self.kind(row)
        if kind not in self.include:
            self.skipped[kind] += 1
            return
        target = row["item"].strip()
        if not target and row["custom"].strip():
            # the item is only given as a link in "custom", e.g. [[Gel]] for slimes
            m = re.search(r"\[\[(?!File:|Image:|Category:)([^|\]]+)", html.unescape(row["custom"]))
            target = m.group(1).strip() if m else ""
        items = self.resolve(target) if target else []
        if not items:
            self.unmatched[target or "(empty)"] += 1
            return
        sid = self.source(row, kind)
        rate = drop_text(row["rate"])
        # a link to the wiki instead of a chance ("More info (In I am error worlds)"): no rate, the
        # rest is a note
        rate_note = ""
        if rate.startswith("More info"):
            rate, rate_note = "", rate[len("More info"):]
        quantity = drop_text(row["quantity"])
        modes = [m for m in DROP_MODES if flag(row[m])] or list(DROP_MODES)
        entry = {
            "source": sid,
            # full texts for display, e.g. "1% · Expert: 1.99%"
            "quantity": quantity or None,
            "rate": rate or None,
            # the same per game mode: chance in percent, quantity as text
            "chance": per_mode(rate, modes, drop_chance),
            "quantities": per_mode(quantity, modes, lambda q: q.strip() or None),
            "modes": modes,
        }
        if self.conditions:
            # conditions in the chance ("In [[Remix]] worlds", "[[Halloween]]") and in notes of
            # the custom column ("(if [[Wind|wind speed]] ≥ 20 mph)")
            # (also as <div class="note-text">, e.g. "(Only if name is Andrew)")
            custom = html.unescape(row["custom"])
            notes = [*re.findall(r'<span class="note">(.*?)</span>', custom),
                     *re.findall(r'<div class="note-text[^"]*">(.*?)</div>', custom, re.S)]
            # a note on one of several chances ("3.33% · 3.11% (Hardmode)": another chance in
            # Hardmode) is no condition of the row
            chances = [s for s in rate.split(" · ") if re.search(r"\d", s) and not re.match(r"(Expert|Master):", s)]
            parsed = self.conditions.parse(" ".join([row["rate"] if len(chances) < 2 else "", *notes]))
            note = condition_text(" ".join([*notes, rate_note])).strip("() ")
            if note.lower() == "in regular worlds":
                note = ""  # the default; its Remix counterpart has the condition
            entry["note"] = note or None
            entry["conditions"] = parsed["condition"] or None
            entry["events"] = parsed["event"] or None
            entry["biomes"] = parsed["biome"] or None
        # a row of one variant only, e.g. Torch for the Torch Zombie on the Zombie page: its NPC ids
        # (expected drops count only the kills of these variants)
        # (the wiki names the variant in a note: "Zombie (Torch Zombie)")
        if kind == "npc" and "note-text" in row["name"] and re.fullmatch(r"-?\d+", row["id"].strip()):
            entry["npcIds"] = [int(row["id"])]
        # the variant the row is for, as the wiki names it ("Pre-Hardmode variant", "Dark Lamia",
        # "T3", "Second Form"); rows without one can get a name from [drop_variants]
        if kind == "npc":
            m = re.search(r'<div class="note-text[^"]*">(.*?)</div>', html.unescape(row["name"]), re.S)
            variant = strip_markup(m.group(1)).strip("() ") if m else self.default_variants.get(norm_name(row["nameraw"]))
            if variant:
                entry["variants"] = [variant]
        entry = {k: v for k, v in entry.items() if v is not None}
        entry["_pages"] = [norm_name(row["_pageName"])]  # for the drop groups, removed in drops_file
        for entry in self.split_areas(entry):
            self.add_entry(items, entry)

    def split_areas(self, entry):
        """A container row with chances or amounts per layer ("1/6 (16.67%) (Underground) · 2/15
        (13.33%) (Cavern)") -> one drop per layer, the layer as its variant ([drop_areas]). Parts
        without a layer apply to every layer of the row."""
        if not self.areas or "Expert:" in entry.get("rate", "") + entry.get("quantity", ""):
            return [entry]

        def parts(text):
            out = {}
            for part in (text or "").split(" · "):
                m = re.match(r"(.*?)\s*\(([^()]*)\)$", part.strip())
                label = norm_name(m.group(2).strip('" ').split(",")[0]) if m else ""
                area = self.areas.get(label)
                out.setdefault(area, []).append(m.group(1) if area else part.strip())
            return out

        rates, quantities = parts(entry.get("rate")), parts(entry.get("quantity"))
        layers = [a for a in dict.fromkeys(self.areas.values()) if a in rates or a in quantities]
        if not layers:
            return [entry]
        split = []
        for area in layers:
            rate = " · ".join(rates.get(area) or rates.get(None) or [])
            quantity = " · ".join(quantities.get(area) or quantities.get(None) or [])
            if not rate and not quantity:
                continue
            e = {**entry, "rate": rate or None, "quantity": quantity or None, "variants": [area],
                 "chance": per_mode(rate, entry["modes"], drop_chance),
                 "quantities": per_mode(quantity, entry["modes"], lambda q: q.strip() or None)}
            split.append({k: v for k, v in e.items() if v is not None})
        return split

    def add_entry(self, items, entry):
        for item in items:
            same = next((d for d in self.drops[item["key"]] if strip_ids(d) == strip_ids(entry)), None)
            if same is None:
                self.drops[item["key"]].append(dict(entry))
            else:
                if "npcIds" in same and "npcIds" in entry:
                    # further variants with the same drop (Small / Big / Armed Slimed Zombie)
                    same["npcIds"] = sorted(set(same["npcIds"]) | set(entry["npcIds"]))
                elif "npcIds" in same:
                    del same["npcIds"]  # also dropped by the main NPC: all variants count
                if "variants" in same and "variants" in entry:
                    same["variants"] += [v for v in entry["variants"] if v not in same["variants"]]
                elif "variants" in same:
                    del same["variants"]  # also dropped without a variant
                same["_pages"] = sorted(set(same.get("_pages", ())) | set(entry["_pages"]))

    def attach_groups(self, page_groups):
        """Drop groups (REQUIREMENTS B5): rows of the same page whose item is in a group of that page
        get the group's id. An item in several groups of a page (Gold Chest per layer, the mimics,
        normal / expert) takes the one that fits the row's game modes and whose items are all dropped
        by the row's source (and variant)."""
        layers = set(self.areas.values())

        def fits_area(group, d):
            # a group under a layer's heading (Gold Chest: "Underground") is for that layer's rows
            areas = {s for s in group.get("sections", ()) if s in layers}
            return not areas or not d.get("variants") or not set(d["variants"]) & layers or areas & set(d["variants"])

        def fits_variant(a, b):
            return not a.get("variants") or not b.get("variants") or set(a["variants"]) & set(b["variants"])

        for page, groups in page_groups.items():
            # the same group in several places (layers, normal + expert; its text may differ
            # slightly: "three" / "3"): once, with the first text
            merged = []
            for g in groups:
                same = next((m for m in merged if same_group(m, g)), None)
                if same is None:
                    merged.append(dict(g))
                    continue
                same["sections"] = list(dict.fromkeys(same.get("sections", []) + g.get("sections", [])))
                if "modes" in same:
                    same["modes"] = sorted(set(same["modes"]) | set(g["modes"])) if "modes" in g else None
                    if same["modes"] is None:
                        del same["modes"]
            keyed = []
            for n, g in enumerate(merged, 1):
                keys = {i["key"] for name in g["items"] for i in self.resolve(name)}
                keyed.append((f"{slug(page)}-{n}", g, keys))
            used = set()
            for key in {k for _, _, keys in keyed for k in keys}:
                for d in self.drops.get(key, ()):
                    if page not in d.get("_pages", ()):
                        continue
                    # per game mode: a row can be for all modes while the wiki lists the group of
                    # the treasure bag apart (Angry Bones: Bone is only in the normal mode's group)
                    per_mode = {}
                    for mode in d["modes"]:
                        found = [(gid, g, keys) for gid, g, keys in keyed
                                 if key in keys and mode in (g.get("modes") or DROP_MODES)
                                 and fits_area(g, d)]
                        # a row of another table of the page with the same item (Gold Chest: Torch
                        # 10–20 on the surface, 15–29 in the group of the caverns)
                        quantity = amounts((d.get("quantities") or {}).get(mode, ""))
                        found = [(gid, g, keys) for gid, g, keys in found
                                 if not quantity or all(
                                     not amounts(a) or amounts(a) & quantity
                                     for name, a in zip(g["items"], g["amounts"])
                                     if key in {i["key"] for i in self.resolve(name)})]
                        if len(found) > 1:
                            found = [(gid, g, keys) for gid, g, keys in found
                                     if all(any(o["source"] == d["source"] and fits_variant(o, d)
                                                for o in self.drops.get(k, ())) for k in keys)]
                        if len(found) > 1:
                            # the same items with other chances (the Ogre's tiers): the one listing
                            # the row's chance
                            own = (d.get("chance") or {}).get(mode)
                            found = [(gid, g, keys) for gid, g, keys in found
                                     if own is not None and any(
                                         own in chance_values(c) for name, c in zip(g["items"], g["chances"])
                                         if c and key in {i["key"] for i in self.resolve(name)})] or found
                        if len(found) == 1:
                            per_mode[mode] = found[0][0]
                        elif found:
                            self.group_report["ambiguous rows"] += 1
                            self.group_pages[page] += 1
                    if per_mode:
                        ids = set(per_mode.values())
                        # one group for all its modes, else the group per mode
                        d["group"] = ids.pop() if len(ids) == 1 and len(per_mode) == len(d["modes"]) else per_mode
                        used.update(per_mode.values())
            for gid, g, keys in keyed:
                if gid not in used:
                    self.group_report["groups without drop rows"] += 1
                    self.group_pages[page] += 1
                    continue
                self.group_report["groups"] += 1
                self.groups[gid] = group_record(g)

    def drops_file(self):
        for key in self.drops:
            self.drops[key].sort(key=lambda d: -max((d.get("chance") or {}).values(), default=0))
            for d in self.drops[key]:
                d.pop("_pages", None)
        return {"sources": self.sources, "items": dict(self.drops), "groups": self.groups,
                "areas": list(dict.fromkeys(self.areas.values()))}

    def bosses_file(self, stages, bosses, ignore_items):
        ignored = set()
        for name in ignore_items:
            found = self.resolve(name)
            if not found:
                log(f"  warning: boss_ignore_items: unknown item '{name}'")
            ignored.update(i["key"] for i in found)
        by_source_name = {norm_name(s["name"]): sid for sid, s in self.sources.items()}
        items_by_source = defaultdict(set)
        for key, entries in self.drops.items():
            if key in ignored:
                continue
            for d in entries:
                items_by_source[d["source"]].add(key)
        out = []
        for boss_id, boss in bosses.items():
            if boss.get("stage") not in stages:
                log(f"  warning: boss {boss_id} has unknown stage {boss.get('stage')}")
            sids = []
            for name in boss.get("sources", []):
                sid = by_source_name.get(norm_name(name))
                if sid:
                    sids.append(sid)
                else:
                    log(f"  warning: boss {boss_id}: drop source '{name}' not found")
            icon = image_url(boss["icon_file"]) if boss.get("icon_file") else None
            count = len(set().union(*(items_by_source[s] for s in sids))) if sids else 0
            out.append({"id": boss_id, "name": boss.get("name", boss_id), "stage": boss.get("stage"),
                        "icon": icon, "sources": sids, "count": count})
        def stage(sid, value):
            # "id = name" or a table with name and icon (an item name)
            value = value if isinstance(value, dict) else {"name": value}
            icon = None
            if value.get("icon"):
                found = self.by_name.get(norm_name(value["icon"]))
                icon = found[0].get("icon") if found else None
                if not icon:
                    log(f"  warning: boss stage {sid}: icon item '{value['icon']}' not found")
            return {k: v for k, v in {"id": sid, "name": value.get("name", sid), "icon": icon}.items() if v}

        return {"stages": [stage(k, v) for k, v in stages.items()], "bosses": out,
                # item keys that never count for a boss (generic drops like coins, potions)
                "ignoreItems": sorted(ignored)}


PICK = {"one": 1, "two": 2, "1": 1, "2": 2}


def same_group(a, b):
    """The same group listed twice: same items, amount and chance; texts may differ if the items'
    chances are the same ("three" / "3"), else they are groups of other variants (the Ogre's tiers)."""
    def chances(g):
        return [re.sub(r"[@#]\w+", "", c).strip() for c in g.get("chances", ())]

    return all(a.get(k) == b.get(k) for k in ("items", "amount", "chance")) and (
        a.get("text") == b.get("text") or chances(a) == chances(b))


def group_record(group):
    """A group in drops.json: its wiki text or amount and chance, how many of its items are dropped
    ("pick": "One of the following 8 items" -> 1; none: a condition like "Only in Corrupt worlds"),
    and its number of rows (an item dropped with another counts once: Grenade Launcher + Rockets)."""
    record = {k: group[k] for k in ("text", "amount", "chance") if k in group}
    text = group.get("text", "").lower()
    m = re.search(r"\b(one|two|\d+)\b[^.]*\bof the following|\bonly (one|1)\b", text)
    if m:
        record["pick"] = PICK.get(m.group(1) or m.group(2), 1)
    elif not text:
        record["pick"] = 1  # "1|1/12": one of these; "|": rows that exclude each other
    record["size"] = group["size"]
    return record


def spawn_events(environment, conditions):
    """Events an NPC is bound to: those whose condition appears in every spawn
    alternative ('A/B' = alternatives, 'X+Y' = all required)."""
    alternatives = [a for a in html.unescape(environment or "").split("/") if a.strip()]
    if not alternatives:
        return set()
    per_alt = [{c.strip() for c in a.split("+")} for a in alternatives]
    return {event for event, conds in conditions.items()
            if all(any(c in conds for c in alt) for alt in per_alt)}


def derive_events(items, drops, events, bosses):
    """Add events to items from their drops (see [events] in mapping.toml) and
    mark items that can only be obtained during events ("eventOnly")."""
    env_conditions = {eid: set(e.get("environments", [])) for eid, e in events.items()}
    drop_conditions = {eid: e.get("drop_conditions", []) for eid, e in events.items()}
    main_boss_sources = {norm_name(name) for b in bosses.values()
                         if b.get("stage") in ("pre-hardmode", "hardmode")
                         for name in b.get("sources", [])}
    source_events = {}
    for sid, source in drops.sources.items():
        found = set()
        if source["kind"] == "npc" and norm_name(source["name"]) not in main_boss_sources:
            npc = drops.npcs.get(norm_name(source["name"]))
            if npc:
                found = spawn_events(npc["environment"], env_conditions)
        source_events[sid] = found
        if found:
            source["events"] = [e for e in events if e in found]  # also used for milestones

    order = list(events)
    by_key = {i["key"]: i for i in items}
    added = Counter()
    for key, entries in drops.drops.items():
        item = by_key[key]
        entries = [d for d in entries if not seed_only(d)]
        if not entries:
            continue
        per_drop = []
        for d in entries:
            found = set(source_events.get(d["source"], ()))
            # container drops (chests, crates, trees) add no events; they also make an item
            # obtainable outside of events
            if drops.sources[d["source"]]["kind"] != "container":
                found |= set(d.get("events", ()))
                text = d.get("rate", "")
                found |= {eid for eid, words in drop_conditions.items()
                          if any(w.lower() in text.lower() for w in words)}
            per_drop.append(found)
        new = set().union(*per_drop) - set(item["events"])
        if new:
            item["events"] = sorted(set(item["events"]) | new, key=order.index)
            added.update(new)
        # only during events: every drop is event-bound and no other way to get it
        if all(per_drop) and not (OTHER_SOURCES | {"bag", "treasure-bag"}) & set(item["obtain"]):
            item["eventOnly"] = True
    log(f"  events from drops: {dict(added)}; "
        f"{sum(1 for i in items if i.get('eventOnly'))} items only obtainable during events")


def spawn_biomes(environment, biomes):
    """Biomes named in an NPC's spawn conditions ('A/B' = alternatives, 'X+Y' =
    all required). A biome's `alone` conditions only count on their own."""
    found = set()
    for alt in html.unescape(environment or "").split("/"):
        alt = alt.strip().lower()
        if not alt:
            continue
        parts = [p.strip() for p in alt.split("+")]
        for bid, b in biomes.items():
            envs = {e.lower() for e in b.get("environments", [])}
            alone = {e.lower() for e in b.get("alone", [])}
            if alt in envs or alt in alone or any(p in envs for p in parts):
                found.add(bid)
    return found


def derive_spawns(items, drops, mapping):
    """Biome and time of day per drop source (for display) and per item (filters):
    where / when the enemies spawn that drop an item. Main bosses, enemies that
    only spawn during events and town NPCs are left out (a town NPC's environment
    is where it is found before moving in, e.g. the Stylist in a Spider Nest)."""
    biomes, times = mapping.sections["biomes"], mapping.sections["times"]
    event_conditions = {eid: set(e.get("environments", [])) for eid, e in mapping.sections["events"].items()}
    time_conditions = {tid: set(t.get("environments", [])) for tid, t in times.items()}
    main_boss_sources = {norm_name(name) for b in mapping.bosses.values()
                         if b.get("stage") in ("pre-hardmode", "hardmode")
                         for name in b.get("sources", [])}
    source_biomes, source_times = {}, {}
    for sid, source in drops.sources.items():
        npc = drops.npc_for(source["name"]) if source["kind"] == "npc" else None
        if not npc or norm_name(source["name"]) in main_boss_sources:
            continue
        if npc["type"].strip().lower().startswith("npc"):  # town NPCs: "nPC", "nPC^goblin"
            continue
        env = npc["environment"]
        if spawn_events(env, event_conditions):
            continue
        b = [bid for bid in biomes if bid in spawn_biomes(env, biomes)]
        t = [tid for tid in times if tid in spawn_events(env, time_conditions)]
        if b:
            source["biomes"] = source_biomes[sid] = b
        if t:
            source["times"] = source_times[sid] = t
    by_key = {i["key"]: i for i in items}
    for key, entries in drops.drops.items():
        item = by_key[key]
        entries = [d for d in entries if not seed_only(d)]
        b = set().union(*(source_biomes.get(d["source"], ()) for d in entries))
        t = set().union(*(source_times.get(d["source"], ()) for d in entries))
        item["biomes"] = [bid for bid in biomes if bid in b]
        item["times"] = [tid for tid in times if tid in t]
    log(f"  biomes for {sum(1 for i in items if i.get('biomes'))} items, "
        f"time of day for {sum(1 for i in items if i.get('times'))}")
