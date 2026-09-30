"""Milestones (milestones.json): the earliest point of a typical playthrough from which an item can
be obtained - see [milestones] in mapping.toml and REQUIREMENTS.md (MS)."""
from .common import image_url, log, norm_name, slug

# obtain methods that have no data of their own here: available from the start (the item's
# minimum still applies, e.g. Hardmode fish); the reason is the method's name in [obtain]
PLAIN_SOURCES = {"fishing", "quest-reward", "plunder", "loot", "crafted", "vendor", "drop", "bag", "treasure-bag"}


class Milestones:
    def __init__(self, mapping, bosses):
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
        # item name pattern -> milestone, or {milestone, reason}
        self.item_rules = [(norm_name(p), m if isinstance(m, str) else m["milestone"],
                            None if isinstance(m, str) else m.get("reason"))
                           for p, m in mapping.milestone_items.items()]
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
            elif source.get("events"):
                base = self.of_events(source["events"])
            elif "jungle-temple" in source.get("biomes", []):
                base = self.index["plantera"]
            elif "dungeon" in source.get("biomes", []):
                base = self.index["skeletron"]
            else:
                base = 0
            base = max(base, self.of_events(d.get("events", [])))
            reason = f"dropped by {name}" if source["kind"] == "npc" else f"from the {name}"
        return max(base, cond), reason

    def compute(self, items, drops, shops, recipes, rewards):
        """Set item["milestone"] and item["milestoneVia"] (reason)."""
        by_key = {i["key"]: i for i in items}
        inf = len(self.order)
        floor = {}
        for item in items:
            value, reason = (self.index["wall-of-flesh"], "Hardmode item") if item.get("hardmode") else (0, None)
            for pattern, mid, why in self.item_rules:
                if pattern == norm_name(item["name"]) or (pattern.endswith("*") and
                                                          norm_name(item["name"]).startswith(pattern[:-1])):
                    self.item_rules_used.add(pattern)
                    if self.index[mid] > value:
                        value, reason = self.index[mid], why or "rule in mapping.toml"
            floor[item["key"]] = (value, reason)

        # sources that do not depend on other items
        base = {}

        def offer(key, value, reason):
            if value is not None and (key not in base or value < base[key][0]):
                base[key] = (value, reason)

        for item in items:
            key = item["key"]
            if item.get("unobtainable"):
                continue
            modelled = set()
            for d in drops.drops.get(key, []):
                v = self.drop_value(drops, d)
                if v:
                    offer(key, *v)
                modelled.add("drop")
            for r in shops.get(key, []):
                cond = self.of_conditions(r["conditions"])
                if cond is not None:
                    vendor = self.index[self.vendor_milestone.get(r["vendor"], self.order[0])]
                    offer(key, max(cond, vendor), f"sold by the {self.vendor_name(r['vendor'])}")
                modelled.add("vendor")
            for oid, found in rewards.items():
                if key in found:
                    cond = self.of_conditions(found[key])
                    offer(key, cond, "Strange Plant reward")
            # vendors only known from the Items table (no shop row)
            for v in item["vendors"]:
                if v not in {r["vendor"] for r in shops.get(key, [])}:
                    offer(key, self.index[self.vendor_milestone.get(v, self.order[0])],
                          f"sold by the {self.vendor_name(v)}")
            kinds = {drops.sources[d["source"]]["kind"] for d in drops.drops.get(key, [])}
            for o in item["obtain"]:
                if o in ("crafted",) or (o in ("vendor",) and "vendor" in modelled):
                    continue
                # the drop data (enemies, bags, lock boxes, chests) is more precise than the
                # general obtain methods
                if o in ("drop", "bag", "treasure-bag", "loot") and kinds:
                    continue
                if o in PLAIN_SOURCES:
                    offer(key, 0, self.obtain_names.get(o, o))
            if key not in base and key not in recipes["by_result"] and key not in recipes["shimmer_to"]:
                # no source data at all (e.g. Fallen Star): from the start, the minimum still applies
                offer(key, 0, self.obtain_names["crafted"] if "crafted" in item["obtain"] else None)

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
                    if s.get("item"):
                        candidates.append((value_of(s["item"]), f"shimmer from {by_key[s['item']]['name']}"))
                if not candidates:
                    continue
                # earliest; on a tie the one with a reason
                value, reason = min(candidates, key=lambda c: (c[0], c[1] is None))
                f = floor[key]
                if f[0] > value:
                    value, reason = f
                if value < inf and (key not in best or best[key][0] != value):
                    best[key] = (value, reason)
                    changed = True
            return changed

        settle()
        # items still open depend on items without any source data: those count from the start
        for item in items:
            if item["key"] not in best and not item.get("unobtainable"):
                offer(item["key"], 0, None)
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
