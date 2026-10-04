"""Milestones (milestones.json): the earliest point of a typical playthrough from which an item can
be obtained - see [milestones] in mapping.toml and REQUIREMENTS.md (MS)."""
from urllib.parse import unquote

from .common import WIKI, image_url, log, norm_name, slug


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
        # drop sources (enemies, containers) and biomes that are only reached later
        self.source_milestone = {slug(k): v for k, v in mapping.milestone_sources.items()}
        self.biome_milestone = dict(mapping.milestone_biomes)
        # the wiki's "Hardmode-only NPCs": enemy names and pages (a group page like "Jellyfish" also
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
                    *self.source_milestone.values(), *self.biome_milestone.values(),
                    *(m for _, m, _ in self.item_rules)]:
            if mid not in self.index:
                raise SystemExit(f"mapping: unknown milestone '{mid}'")
        for biome in self.biome_milestone:
            if biome not in mapping.sections["biomes"]:
                raise SystemExit(f"mapping: [milestone_biomes] unknown biome '{biome}'")

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

    def hardmode_only(self, dropper):
        page = unquote(dropper.get("url", "")[len(WIKI):]).replace("_", " ")
        return norm_name(dropper["name"]) in self.hardmode_npcs or norm_name(page) in self.hardmode_npcs

    def reached(self, dropper):
        """Milestone (index) from which a drop source - an enemy, a treasure bag, a container - is
        reached: its boss; else what [milestone_sources] says; else the later of where it appears
        (a town NPC: when it moves in, e.g. the Mechanic's Combat Wrench; an event enemy: the
        event; a biome of [milestone_biomes]) and Hardmode for the wiki's "Hardmode-only NPCs"."""
        boss = self.source_boss.get(norm_name(dropper["name"]))
        if boss in self.boss_milestone:
            value = self.index[self.boss_milestone[boss]]
        elif dropper["id"] in self.source_milestone:
            return self.index[self.source_milestone[dropper["id"]]]
        elif dropper["id"] in self.vendor_milestone:
            value = self.index[self.vendor_milestone[dropper["id"]]]
        elif dropper.get("events"):
            value = self.of_events(dropper["events"])
        else:
            value = next((self.index[m] for b, m in self.biome_milestone.items() if b in dropper.get("biomes", ())), 0)
        return max(value, self.index["wall-of-flesh"]) if self.hardmode_only(dropper) else value

    def gate(self, s):
        """Milestone (index) a source (sources.py) needs by itself - without the items it is made
        from; None: only in special seeds."""
        if "drop" in s:
            # where its source is reached, the drop's conditions and - not for containers - the
            # event the drop itself is bound to
            d = s["drop"]
            cond = self.of_conditions(d.get("conditions", ()))
            if cond is None:
                return None
            return max(self.reached(s["source"]), cond, 0 if s["kind"] == "container" else self.of_events(d.get("events", ())))
        cond = self.of_conditions(s["conditions"])
        if cond is not None and s["kind"] in ("shop", "vendor"):
            # the later of the vendor's move-in and the row's conditions
            return max(cond, self.index[self.vendor_milestone.get(s["vendor"], self.order[0])])
        return cond

    def text(self, s, why=None):
        """A source as the reason of a milestone; `why`: what a recipe needs latest."""
        kind = s["kind"]
        if "drop" in s:
            name = s["source"]["name"]
            return f"found in {name}" if kind == "container" else f"dropped by {name}" if kind == "npc" else f"from the {name}"
        if kind in ("shop", "vendor"):
            return f"sold by the {self.vendor_name(s['vendor'])}"
        if kind == "recipe":
            return f"crafted – needs {why}" if why else "crafted"
        if kind == "shimmer":
            return f"shimmer from {s['needs'][0][0]}"
        if kind == "extractinator":
            return f"from the {s['machine']['name']} ({s['row']['input']})"
        return self.obtain_names.get(s["obtain"][0], s["obtain"][0])  # "Strange Plant reward", "Fished"

    def compute(self, items, sources):
        """Set item["milestone"] and item["milestoneVia"] (reason) from the sources of the items
        (sources.py): the earliest source, but not before the item's minimum."""
        inf = len(self.order)
        # the minimum: Hardmode items, [milestone_items]; `fixed`: rules that set it exactly
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

        # `base`: the earliest source that does not depend on other items; `made`: the sources that
        # do (recipes, shimmer, the Extractinators); `tagged`: the method only the wiki's tags or a
        # name rule give, for items the data leaves open
        base, made, tagged = {}, {}, {}

        def offer(key, value, reason):
            if value is not None and (key not in base or value < base[key][0]):
                base[key] = (value, reason)

        for item in items:
            key = item["key"]
            if item.get("unobtainable"):
                continue
            made[key] = []
            for s in sources.of[key]:
                if not s["regular"]:
                    continue  # only in special seeds
                if "needs" in s:
                    made[key].append(s)
                elif "method" not in s:
                    offer(key, self.gate(s), self.text(s))
                # What only the wiki's tags or a name rule say: from the start. Not a tag the drop
                # data (enemies, bags, lock boxes, chests) says more precisely; "crafted": the recipes
                elif not s["covered"] and s["method"] != "crafted":
                    # an item with a rule in [milestone_items] is obtained as its tags say (mined, found)
                    if s["sure"] or key in ruled:
                        offer(key, 0, self.text(s))
                    else:
                        tagged.setdefault(key, self.text(s))
            if key not in base and not made[key]:
                # no source data at all (e.g. Fallen Star): from the start, the minimum still applies
                offer(key, 0, tagged.get(key) or (self.obtain_names["crafted"] if "crafted" in item["obtain"]
                                                  else None))

        # recipes, shimmer and the Extractinators depend on other items: until nothing changes
        best = {}
        rounds = 0

        def value_of(key):
            v = best.get(key)
            return v[0] if v else inf

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
                for s in made.get(key, ()):
                    # the latest of what it needs (of a station's items or a group: the earliest)
                    worst, why = self.gate(s), None
                    for name, keys in s["needs"]:
                        v = min((value_of(k) for k in keys), default=0)
                        if v > worst:
                            worst, why = v, name
                    candidates.append((worst, self.text(s, why)))
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

        def waits_for(key):
            """Items the sources of an item wait for; of "any of these" (the items of a station or
            a group) only while none of them is known."""
            return {k for s in made.get(key, ()) for _, keys in s["needs"]
                    if not any(k in best for k in keys) for k in keys}

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
                needed = circle & set().union(*(waits_for(k) for k in circle))
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
