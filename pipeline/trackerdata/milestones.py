"""Milestones (milestones.json): the earliest point of a typical playthrough from which an item can
be obtained - see [milestones] in mapping.toml and REQUIREMENTS.md (MS)."""
from urllib.parse import unquote

from .common import WIKI, image_url, log, norm_name, slug

# obtain methods that have no data of their own here: available from the start (the item's
# minimum still applies, e.g. Hardmode fish); the reason is the method's name in [obtain]
PLAIN_SOURCES = {"fishing", "quest-reward", "crafted", "vendor", "player-death"}
# the same, but the wiki tags them per page - also for items they do not hold for (every chandelier
# is "collected in the world"): they only count for items the data gives no source for
TAGGED_SOURCES = {"plunder", "loot", "drop", "bag", "treasure-bag"}


class Milestones:
    def __init__(self, mapping, bosses, hardmode_npcs=()):
        self.entries = mapping.milestones                   # id -> {name, bosses, events, ...}
        self.order = list(self.entries)
        self.index = {mid: n for n, mid in enumerate(self.order)}
        self.boss_milestone, self.event_milestone = {}, {}
        for mid, m in self.entries.items():
            for b in m.get("bosses", []):
                self.boss_milestone[b] = mid
            for e in m.get("events", []):
                self.event_milestone[e] = mid
        # drop source name -> boss id (the boss, its parts, its treasure bag)
        self.source_boss = {norm_name(n): bid for bid, b in bosses.items() for n in b.get("sources", [])}
        self.condition_milestone = {f"after-{b}": m for b, m in self.boss_milestone.items()}
        self.condition_milestone.update(mapping.milestone_conditions)
        self.vendor_milestone = {vid: v.get("milestone", self.order[0])
                                 for vid, v in mapping.sections["vendors"].items()}
        self.vendor_names = {vid: v["name"] for vid, v in mapping.sections["vendors"].items()}
        # "Collected in the world", ... as in the "Obtained by" filter
        self.obtain_names = {oid: o.get("name", oid) for oid, o in mapping.sections["obtain"].items()}
        self.container_milestone = {slug(k): v for k, v in mapping.container_milestones.items()}
        self.source_milestone = {slug(k): v for k, v in mapping.milestone_sources.items()}
        # the wiki's "Hardmode-only NPCs": enemy names and pages (a group page like "Mimics" also
        # holds pre-Hardmode enemies - [milestone_sources] overrides those)
        self.hardmode_npcs = {norm_name(n) for n in hardmode_npcs}
        # item name pattern -> milestone, or {milestone, reason}
        self.item_rules = [(norm_name(p), m if isinstance(m, str) else m["milestone"],
                            None if isinstance(m, str) else m.get("reason"))
                           for p, m in mapping.milestone_items.items()]
        # rules with override = true set the milestone exactly (also earlier than the sources say)
        self.item_overrides = {norm_name(p) for p, m in mapping.milestone_items.items()
                               if isinstance(m, dict) and m.get("override")}
        self.item_rules_used = set()
        for mid in [*self.boss_milestone.values(), *self.event_milestone.values(),
                    *self.condition_milestone.values(), *self.vendor_milestone.values(),
                    *self.container_milestone.values(), *self.source_milestone.values(),
                    *(m for _, m, _ in self.item_rules)]:
            if mid not in self.index:
                raise SystemExit(f"mapping: unknown milestone '{mid}'")

    def of_conditions(self, ids):
        """Latest milestone required by condition ids (after a boss, Hardmode); None = the row
        only exists in special seeds."""
        if any(c.startswith("seed-") for c in ids):
            return None
        return max((self.index[self.condition_milestone[c]] for c in ids if c in self.condition_milestone),
                   default=0)

    def of_events(self, events):
        """Earliest milestone of the events (an enemy of any of them)."""
        return min((self.index[self.event_milestone.get(e, self.order[0])] for e in events), default=0)

    def drop_value(self, drops, d):
        """(milestone index, reason) of one drop, or None if it does not count."""
        source = drops.sources[d["source"]]
        cond = self.of_conditions(d.get("conditions", []))
        if cond is None:
            return None
        name = source["name"]
        if source["kind"] == "container":
            base, reason = self.index[self.container_milestone.get(source["id"], self.order[0])], f"found in {name}"
        else:
            boss = self.source_boss.get(norm_name(name))
            if boss and boss in self.boss_milestone:
                base = self.index[self.boss_milestone[boss]]
            elif source["id"] in self.source_milestone:
                base = self.index[self.source_milestone[source["id"]]]
            elif source["id"] in self.vendor_milestone:
                # a town NPC (the Mechanic's Combat Wrench): from when it can move in
                base = self.index[self.vendor_milestone[source["id"]]]
            elif source.get("events"):
                base = self.of_events(source["events"])
            elif "jungle-temple" in source.get("biomes", []):
                base = self.index["plantera"]
            elif "dungeon" in source.get("biomes", []):
                base = self.index["skeletron"]
            else:
                base = 0
            if source["id"] not in self.source_milestone and self.hardmode_only(source):
                base = max(base, self.index["wall-of-flesh"])
            base = max(base, self.of_events(d.get("events", [])))
            reason = f"dropped by {name}" if source["kind"] == "npc" else f"from the {name}"
        return max(base, cond), reason

    def hardmode_only(self, source):
        page = unquote(source.get("url", "")[len(WIKI):]).replace("_", " ")
        return norm_name(source["name"]) in self.hardmode_npcs or norm_name(page) in self.hardmode_npcs

    def compute(self, items, drops, sources, recipes):
        """Set item["milestone"] and item["milestoneVia"] (reason). `sources`: the sources of
        the items (sources.py); `recipes`: recipes, shimmer and Extractinator results per item."""
        by_key = {i["key"]: i for i in items}
        inf = len(self.order)
        floor, fixed, ruled = {}, {}, set()
        for item in items:
            value, reason = (self.index["wall-of-flesh"], "Hardmode item") if item.get("hardmode") else (0, None)
            for pattern, mid, why in self.item_rules:
                if pattern == norm_name(item["name"]) or (pattern.endswith("*") and
                                                          norm_name(item["name"]).startswith(pattern[:-1])):
                    self.item_rules_used.add(pattern)
                    ruled.add(item["key"])
                    if pattern in self.item_overrides:
                        fixed[item["key"]] = (self.index[mid], why or "rule in mapping.toml")
                    elif self.index[mid] > value:
                        value, reason = self.index[mid], why or "rule in mapping.toml"
            floor[item["key"]] = (value, reason)

        # sources that do not depend on other items; `tagged`: the method the wiki's tags name
        # (TAGGED_SOURCES), for items the data leaves open
        base, tagged = {}, {}

        def offer(key, value, reason):
            if value is not None and (key not in base or value < base[key][0]):
                base[key] = (value, reason)

        for item in items:
            key = item["key"]
            if item.get("unobtainable"):
                continue
            for s in sources.of[key]:
                if not s["regular"]:
                    continue  # only in special seeds
                if "drop" in s:
                    v = self.drop_value(drops, s["drop"])
                    if v:
                        offer(key, *v)
                elif s["kind"] in ("shop", "vendor"):
                    # the later of the vendor's move-in and the row's conditions; "vendor": only
                    # known from the Items table (no shop row)
                    vendor = self.index[self.vendor_milestone.get(s["vendor"], self.order[0])]
                    offer(key, max(vendor, self.of_conditions(s["conditions"])),
                          f"sold by the {self.vendor_name(s['vendor'])}")
                elif s["kind"] == "reward":
                    offer(key, self.of_conditions(s["conditions"]), self.obtain_names[s["obtain"][0]])
                # what only the wiki's tags say; "crafted": the recipes, below. Not a tag the drop
                # data (enemies, bags, lock boxes, chests) says more precisely
                elif s["kind"] == "tag" and not s["covered"] and s["method"] != "crafted":
                    name = self.obtain_names.get(s["method"], s["method"])
                    # an item with a rule in [milestone_items] is obtained as its tags say (mined, found)
                    if s["method"] in TAGGED_SOURCES and key not in ruled:
                        tagged.setdefault(key, name)
                    elif s["method"] in PLAIN_SOURCES | TAGGED_SOURCES:
                        offer(key, 0, name)
            if (key not in base and key not in recipes["by_result"] and key not in recipes["shimmer_to"]
                    and key not in recipes.get("extractinator_to", {})):
                # no source data at all (e.g. Fallen Star): from the start, the minimum still applies
                offer(key, 0, tagged.get(key) or (self.obtain_names["crafted"] if "crafted" in item["obtain"]
                                                  else None))

        # recipes and shimmer, until nothing changes
        best = {}

        def value_of(key):
            v = best.get(key)
            return v[0] if v else inf

        station_items = {name: s.get("items", []) for name, s in recipes["stations"].items()}
        station_free = {name for name, s in recipes["stations"].items() if s.get("condition")}
        groups = {name: g.get("items", []) for name, g in recipes["groups"].items()}
        rounds = 0

        def settle():
            nonlocal rounds
            changed = True
            while changed:
                changed, rounds = step(), rounds + 1

        def step():
            changed = False
            for item in items:
                key = item["key"]
                candidates = [base[key]] if key in base else []
                for r in recipes["by_result"].get(key, []):
                    worst, why = 0, None
                    for st in r["stations"]:
                        if st in station_free:
                            continue
                        v = min((value_of(k) for k in station_items.get(st, [])), default=0)
                        if v > worst:
                            worst, why = v, st
                    for ing in r["ingredients"]:
                        if ing.get("item"):
                            v, name = value_of(ing["item"]), by_key[ing["item"]]["name"]
                        elif ing.get("group"):
                            v, name = min((value_of(k) for k in groups.get(ing["group"], [])), default=0), ing["group"]
                        else:
                            continue
                        if v > worst:
                            worst, why = v, name
                    candidates.append((worst, f"crafted – needs {why}" if why else "crafted"))
                for s in recipes["shimmer_to"].get(key, []):
                    # a note can restrict it: "only after Moon Lord" (the Bottomless Shimmer Bucket)
                    after = self.of_conditions(s.get("conditions", []))
                    if after is None:
                        continue
                    if s.get("item"):
                        candidates.append((max(value_of(s["item"]), after),
                                           f"shimmer from {by_key[s['item']]['name']}"))
                    elif s.get("group"):
                        # any item of a group ("Any Fruit" -> Ambrosia): its earliest
                        v = min((value_of(k) for k in groups.get(s["group"], [])), default=0)
                        candidates.append((max(v, after), f"shimmer from {s['group']}"))
                # Extractinator results (B6): the latest of the machine, the input (any of them) and
                # "Hardmode only"
                for r in recipes.get("extractinator_to", {}).get(key, []):
                    values = [value_of(r["machine_item"])] if r.get("machine_item") else []
                    if r["inputs"]:
                        values.append(min(value_of(k) for k in r["inputs"]))
                    if r.get("phase") == "hardmode":
                        values.append(self.index["wall-of-flesh"])
                    candidates.append((max(values, default=0), f"from the {r['machine_name']} ({r['input']})"))
                if key in fixed:
                    value, reason = fixed[key]
                else:
                    if not candidates:
                        continue
                    # earliest; on a tie the one with a reason
                    value, reason = min(candidates, key=lambda c: (c[0], c[1] is None))
                    # from the start by a recipe too: the tags agree, their method is the reason
                    # ("Collected in the world" rather than crafted from its own walls)
                    if value == 0 and key in tagged and base.get(key, (inf,))[0] > 0:
                        reason = tagged[key]
                    f = floor[key]
                    if f[0] > value:
                        value, reason = f
                if value < inf and (key not in best or best[key][0] != value):
                    best[key] = (value, reason)
                    changed = True
            return changed

        def needs(key):
            """Items the recipes, shimmer and Extractinator sources of an item wait for; of "any
            of these" (the items of a station or a group) only while none of them is known."""
            def any_of(keys):
                return [] if any(k in best for k in keys) else keys

            out = set()
            for r in recipes["by_result"].get(key, []):
                for st in r["stations"]:
                    out.update(any_of(station_items.get(st, [])))
                for ing in r["ingredients"]:
                    out.update([ing["item"]] if ing.get("item") else any_of(groups.get(ing.get("group"), [])))
            for s in recipes["shimmer_to"].get(key, []):
                out.update([s["item"]] if s.get("item") else any_of(groups.get(s.get("group"), [])))
            for r in recipes.get("extractinator_to", {}).get(key, []):
                out.update(any_of(r["inputs"]) + ([r["machine_item"]] if r.get("machine_item") else []))
            return out

        settle()
        # Items still open have no usable source data: recipes in a circle (Obsidian from Obsidian
        # Walls and back) or nothing at all. Those count from the start, with the method of the
        # wiki's tags as the reason - not the items that only need them (an Obsidian Shield still
        # needs its Cobalt Shield). In a circle the tagged items come first (Pearlwood, found in
        # the world, not the Pearlwood Wall made from it).
        while True:
            still_open = {i["key"] for i in items if i["key"] not in best and not i.get("unobtainable")}
            if not still_open:
                break
            circle = still_open
            while True:
                needed = circle & set().union(*(needs(k) for k in circle))
                if needed == circle:
                    break
                circle = needed
            for key in [k for k in circle if k in tagged] or circle or still_open:
                offer(key, 0, tagged.get(key))
            settle()
        for item in items:
            if item["key"] in best:
                value, reason = best[item["key"]]
                item["milestone"] = self.order[value]
                if reason:
                    # "Crafted – needs Chlorophyte Ore", like the names in "Obtained by"
                    item["milestoneVia"] = reason[:1].upper() + reason[1:]
        log(f"  milestones for {len(best)} items ({rounds} rounds)")
        raised = [i["name"] for i in items if i.get("milestoneVia") == "Hardmode item"]
        log(f"  {len(raised)} items raised to Hardmode by their Hardmode flag (Hardmode enemies are "
            f"not marked in the NPC data), e.g. {raised[:10]}")
        for pattern, _, _ in self.item_rules:
            if pattern not in self.item_rules_used:
                log(f"  warning: [milestone_items] '{pattern}' matches no items")

    def vendor_name(self, vid):
        return self.vendor_names.get(vid, vid)

    def milestones_file(self, items, boss_icons, item_icons):
        counts = {}
        for i in items:
            if "milestone" in i:
                counts[i["milestone"]] = counts.get(i["milestone"], 0) + 1
        out = []
        for mid, m in self.entries.items():
            icon = None
            if m.get("icon_file"):
                icon = image_url(m["icon_file"])
            elif m.get("icon"):
                icon = item_icons.get(norm_name(m["icon"]))
            elif m.get("bosses"):
                icon = boss_icons.get(m["bosses"][0])
            out.append({k: v for k, v in {"id": mid, "name": m["name"], "icon": icon,
                                          "count": counts.get(mid, 0)}.items() if v is not None})
        return out
