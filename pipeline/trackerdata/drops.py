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
    slug,
    strip_markup,
)


DROP_MODES = ("normal", "expert", "master")


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
                 conditions=None):
        self.include = set(include_kinds)
        self.conditions = conditions
        self.containers = containers or {}
        self.container_icons = container_icons or {}
        by_name, by_page = defaultdict(list), defaultdict(list)
        for item in items:
            by_name[norm_name(item["name"])].append(item)
            by_page[norm_name(item["page"])].append(item)
        self.by_name, self.by_page = by_name, by_page
        self.npcs = {norm_name(r["nameraw"]): r for r in npc_rows}
        self.sources = {}
        self.drops = defaultdict(list)
        self.unmatched = Counter()
        self.skipped = Counter()
        for row in drop_rows:
            self.add(row)

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
        if not found:
            base = re.sub(r"\s*\((item|painting)\)$", "", n)
            found = self.by_name.get(base) or self.by_page.get(n)
        if not found:
            # a whole furniture set, e.g. "Golden furniture" -> Golden Chair, Golden Bed, ...
            m = re.fullmatch(r"(.+) furniture", n)
            if m:
                prefix = m.group(1) + " "
                found = [i for items in self.by_name.values() for i in items
                         if norm_name(i["name"]).startswith(prefix) and "furniture" in i["categories"]]
        if found and len(found) > 1:
            # same name, several items: prefer obtainable ones (e.g. "Ogre Mask" has an unused,
            # unobtainable variant), then the item on its own page (e.g. "Seaweed")
            found = [i for i in found if not i.get("unobtainable")] or found
            own = [i for i in found if norm_name(i["page"]) == n]
            found = own or found
        return found or []

    def source(self, row, kind):
        sid = slug(row["nameraw"])
        if sid not in self.sources:
            name = html.unescape(row["nameraw"])
            record = {"id": sid, "name": name, "kind": kind}
            npc = self.npc_for(name)
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
            notes = re.findall(r'<span class="note">(.*?)</span>', html.unescape(row["custom"]))
            parsed = self.conditions.parse(" ".join([row["rate"], *notes]))
            note = condition_text(" ".join(notes)).strip("() ")
            entry["note"] = note or None
            entry["conditions"] = parsed["condition"] or None
            entry["events"] = parsed["event"] or None
            entry["biomes"] = parsed["biome"] or None
        entry = {k: v for k, v in entry.items() if v is not None}
        for item in items:
            if entry not in self.drops[item["key"]]:
                self.drops[item["key"]].append(entry)

    def drops_file(self):
        for key in self.drops:
            self.drops[key].sort(key=lambda d: -max((d.get("chance") or {}).values(), default=0))
        return {"sources": self.sources, "items": dict(self.drops)}

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

    order = list(events)
    by_key = {i["key"]: i for i in items}
    added = Counter()
    for key, entries in drops.drops.items():
        item = by_key[key]
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
        b = set().union(*(source_biomes.get(d["source"], ()) for d in entries))
        t = set().union(*(source_times.get(d["source"], ()) for d in entries))
        item["biomes"] = [bid for bid in biomes if bid in b]
        item["times"] = [tid for tid in times if tid in t]
    log(f"  biomes for {sum(1 for i in items if i.get('biomes'))} items, "
        f"time of day for {sum(1 for i in items if i.get('times'))}")
