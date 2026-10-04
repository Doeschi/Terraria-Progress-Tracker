"""The sources of an item: every way to obtain it - drop rows (enemies, treasure bags, containers),
shop rows, reward pages, recipes, shimmer, the Extractinators, and what only the wiki's tags or
a name rule say. They are collected once, when all the data is read (Sources); the item fields
that say how and when an item is obtained are read off this one list, so they cannot disagree
(apply): obtain, vendors, events, biomes, times, conditions, eventOnly, minDifficulty. The
milestones (milestones.py) use the same list. See REQUIREMENTS D8b.

A source is a dict:
  kind        "npc" / "bag" / "container" (a drop row), "shop" (a shop row), "vendor" (a vendor
              the Items table names, without a shop row), "reward" (a reward page, [obtain] page),
              "recipe", "shimmer", "extractinator", "name" ([obtain] names), "tag" (a method only
              the wiki's tags name)
  obtain      the obtain methods it stands for
  regular     False: only in special world seeds - shown, but it counts for nothing (CO6)
  free        True: no restriction of its own - at any time, in any difficulty
  events, biomes, times, conditions
              when and where it is available
  needs       recipe, shimmer, extractinator: what it is made from - [(name, [item keys])], each
              one of these items (a crafting station or an "Any ..." group: any of several);
              a shop row: the item the player must have
  method      tag, name: the method; `covered`: the item's drop rows say it more precisely (it
              only names the method); `sure`: it holds for every item it is on
  drop + source, row + vendor, recipe, row + machine
              the row it comes from: the drop and its source, the shop row and its vendor, ...
"""
import fnmatch
from collections import Counter, defaultdict

from .common import DIFFICULTY_BY_RARITY, log, norm_name, seed_only

# Methods without a restriction of their own when only the wiki's tags name them: at any time and
# in any difficulty (crafting, world items, fishing, a vendor without a shop row).
FREE = {"crafted", "vendor", "loot", "plunder", "fishing", "quest-reward"}
# The methods of drop rows: for an item with rows a tag naming one adds nothing (the rows are more
# precise); without rows it is a source nothing more is known about.
ROW_METHODS = {"drop", "bag", "treasure-bag", "loot"}
# Tagged methods that hold for every item they are on. The others are tagged per wiki page, also
# for items they do not hold for (every chandelier is "collected in the world"): those only
# count for items the data gives no source for (see the milestones).
SURE = {"fishing", "quest-reward", "player-death", "vendor"}
# the method of shop rows
VENDOR = "vendor"


def source(kind, obtain=(), **more):
    return {"kind": kind, "regular": True, "free": False, "obtain": list(obtain), "events": set(),
            "biomes": set(), "times": set(), "conditions": set(), **more}


class Sources:
    def __init__(self, items, drops, shops, rewards, recipes, extractinator, mapping):
        """`rewards`: page_rewards (conditions.py); `recipes`, `extractinator`: recipes.json and
        extractinator.json."""
        self.drops, self.shops, self.rewards = drops, shops, rewards
        self.sections = mapping.sections
        self.obtain = mapping.sections["obtain"]
        self.names = {item["key"]: item["name"] for item in items}
        # words of a chance that bind a drop to an event ("during Halloween")
        self.event_words = {eid: [w.lower() for w in e["drop_conditions"]]
                            for eid, e in mapping.sections["events"].items() if e.get("drop_conditions")}
        self.recipes, self.shimmer, self.extracted = defaultdict(list), defaultdict(list), defaultdict(list)
        for r in recipes["recipes"]:
            self.recipes[r["result"]].append(r)
        for s in recipes["shimmer"]:
            self.shimmer[s["result"]].append(s)
        for r in extractinator["results"]:
            self.extracted[r["item"]].append(r)
        # the items that provide a crafting station (not the conditions: "Water", "By Hand", ...) and
        # the items of an "Any ..." group
        self.stations = {name: s.get("items", []) for name, s in recipes["stations"].items() if not s.get("condition")}
        self.groups = {name: g.get("items", []) for name, g in recipes["groups"].items()}
        self.machines = {m["id"]: m for m in extractinator["machines"]}
        self.vendors = {}  # item key -> its vendors
        self.report = Counter()
        self.of = {item["key"]: self.collect(item) for item in items}

    def collect(self, item):
        key, out = item["key"], []
        rows = self.drops.drops.get(key, [])
        for d in rows:
            dropper = self.drops.sources[d["source"]]
            # containers are never restricted, and they add no events (fruit of a tree at night)
            container = dropper["kind"] == "container"
            events = set(dropper.get("events", ()))
            if not container:
                # the drop itself can be bound to an event: by a condition or the words of its chance
                rate = d.get("rate", "").lower()
                events |= set(d.get("events", ()))
                events |= {eid for eid, words in self.event_words.items() if any(w in rate for w in words)}
            out.append(source(
                dropper["kind"], regular=not seed_only(d), free=container, drop=d, source=dropper,
                obtain=[oid for oid, o in self.obtain.items()
                        if dropper["kind"] in o.get("from_drops", ())
                        or dropper.get("group") in o.get("from_containers", ())],
                events=events,
                biomes=set(dropper.get("biomes", ())) | (set() if container else set(d.get("biomes", ()))),
                # an enemy's spawn times count as the drop's
                times=set(dropper.get("times", ())),
                conditions=set() if container else set(d.get("conditions", ())) | set(dropper.get("times", ()))))
        shop = self.shops.get(key, [])
        for r in shop:
            # a row for players who have an item ("... a Nail Gun in their inventory") needs it
            needs = {"needs": [(self.names[r["needs"][0]], r["needs"])]} if r.get("needs") else {}
            out.append(source("shop", [VENDOR], regular=not seed_only(r), row=r, vendor=r["vendor"],
                              events=set(r["events"]), biomes=set(r["biomes"]), conditions=set(r["conditions"]),
                              **needs))
        # the vendors the Items table names; one that only has rows in special seeds is no vendor of
        # the item (the Princess's Terragrim)
        sold = [r["vendor"] for r in shop if not seed_only(r)]
        named = [v for v in item["vendors"] if v in sold or v not in {r["vendor"] for r in shop}]
        self.report["vendors only in special seeds"] += len(item["vendors"]) - len(named)
        self.report["vendors from shop rows"] += len(set(sold) - set(named))
        self.vendors[key] = named + [v for v in dict.fromkeys(sold) if v not in named]
        out += [source("vendor", [VENDOR], free=True, vendor=v) for v in named if v not in sold]
        # reward pages (Strange Plant rewards), with the conditions of their heading
        for oid, found in self.rewards.items():
            if key in found:
                out.append(source("reward", [oid], conditions=set(found[key])))
        # recipes: every crafting station and every ingredient
        for r in self.recipes.get(key, ()):
            needs = [(st, self.stations[st]) for st in r["stations"] if st in self.stations]
            needs += [(self.names[i["item"]], [i["item"]]) if i.get("item")
                      else (i["group"], self.groups.get(i["group"], [])) for i in r["ingredients"]]
            out.append(source("recipe", recipe=r, needs=needs))
        # shimmer: the item thrown in (or any of a group, "Any Fruit"); a note can restrict it
        # ("only after Moon Lord")
        for s in self.shimmer.get(key, ()):
            needs = (self.names[s["item"]], [s["item"]]) if s.get("item") else (s["group"], self.groups.get(s["group"], []))
            out.append(source("shimmer", [oid for oid, o in self.obtain.items() if o.get("from_shimmer")],
                              regular=not seed_only(s), row=s, needs=[needs], conditions=set(s.get("conditions", ()))))
        # the Extractinators: the machine and one of the inputs; some results only in Hardmode
        for r in self.extracted.get(key, ()):
            machine = self.machines[r["machine"]]
            needs = [(machine["name"], [machine["item"]])] if machine.get("item") else []
            out.append(source("extractinator", row=r, machine=machine,
                              obtain=[oid for oid, o in self.obtain.items()
                                      if r["machine"] in o.get("from_extractinator", ())],
                              needs=needs + ([(r["input"], r["inputs"])] if r["inputs"] else []),
                              conditions={"hardmode"} if r.get("phase") == "hardmode" else set()))
        name = norm_name(item["name"])
        for oid, o in self.obtain.items():
            if any(fnmatch.fnmatchcase(name, norm_name(p)) for p in o.get("names", ())):
                out.append(source("name", [oid], method=oid, covered=False, sure=False))
        # unobtainable items only belong to "Unobtainable" (D19): the wiki's other tags are former
        # or nominal sources
        if item.get("unobtainable"):
            return out
        # What only the wiki's tags (or [manual]) say. Not a tag another method of the item
        # replaces ([obtain] replaces): the wiki tags the Dye Trader's rewards as quest rewards and
        # the loot of boss treasure bags as "bag loot" too
        have = set(item["obtain"]) | {oid for s in out if s["regular"] for oid in s["obtain"]}
        replaced = {self.obtain[oid].get("replaces") for oid in have}
        for oid in item["obtain"]:
            if oid in replaced:
                self.report[f"replaced: {oid}"] += 1
                continue
            # the shop rows and vendors stand for it; with rows only in special seeds it is not sold
            if oid == VENDOR and (shop or named):
                continue
            # the wiki tags an item from its drop rows too: a method it only has in special seeds goes
            mine = [s for s in out if "drop" in s and oid in s["obtain"]]
            if mine and not any(s["regular"] for s in mine):
                self.report[f"only in special seeds: {oid}"] += 1
                continue
            covered = oid in ROW_METHODS and bool(rows)
            out.append(source("tag", [oid], method=oid, covered=covered, sure=oid in SURE,
                              free=not covered and oid in FREE | ROW_METHODS))
        return out

    def apply(self, items, conditions):
        """Set the item fields that follow from the sources (see the module text)."""
        order = {s: list(self.sections[s]) for s in ("obtain", "events", "biomes", "times")}
        fallback = next((oid for oid, o in self.obtain.items() if o.get("fallback")), None)
        added = Counter()
        for item in items:
            key = item["key"]
            sources = [s for s in self.of[key] if s["regular"]]
            # the rows that say when and where: drops and shop rows
            rows = [s for s in sources if s["kind"] in ("npc", "bag", "container", "shop")]
            # a source at any time: crafting, a vendor without a shop row, world items, ...
            free = any(s["free"] for s in sources if s["kind"] in ("vendor", "tag"))
            if not item.get("unobtainable"):
                have = {oid for s in sources for oid in s["obtain"]}
                if fallback and not have:
                    have = {fallback}
                added.update(have - set(item["obtain"]))
                item["obtain"] = sorted(have, key=order["obtain"].index)
            item["vendors"] = self.vendors[key]
            events = set(item["events"]).union(*(s["events"] for s in rows))
            item["events"] = [e for e in order["events"] if e in events]
            # where and when the enemies spawn that drop it - not what the wiki's tags say then
            dropped = key in self.drops.drops
            biomes = (set() if dropped else set(item["biomes"])).union(*(s["biomes"] for s in rows))
            item["biomes"] = [b for b in order["biomes"] if b in biomes]
            if dropped:
                times = set().union(*(s["times"] for s in rows))
                item["times"] = [t for t in order["times"] if t in times]
            # only during events: every row is bound to an event and there is no other way
            if rows and all(s["events"] for s in rows) and not free:
                item["eventOnly"] = True
            else:
                item.pop("eventOnly", None)
            item["conditions"] = conditions.required(
                [s["conditions"] for s in sources if s["kind"] in ("npc", "bag", "container", "shop", "reward")]
                + ([set()] if free else []))
            # Expert / Master rarity: only in that difficulty, unless there is a way in every one
            need = DIFFICULTY_BY_RARITY.get(item.get("rarity"))
            if need and not FREE & set(item["obtain"]):
                item["minDifficulty"] = need
            else:
                item.pop("minDifficulty", None)
        log(f"  obtain methods added from the data: {dict(added)}; left out: "
            f"{ {k: v for k, v in self.report.items() if v} }")
        log(f"  {sum(1 for i in items if i.get('eventOnly'))} items only obtainable during events, conditions "
            f"for {sum(1 for i in items if i['conditions'])}, biomes for {sum(1 for i in items if i['biomes'])}, "
            f"time of day for {sum(1 for i in items if i.get('times'))}")
