"""The sources of an item: every way to obtain it - drop rows (enemies, treasure bags, containers),
shop rows, reward pages, shimmer, the Extractinators, and what only the wiki's tags or a name
rule say. They are collected once, when all the data is read (Sources); the item fields that say
how and when an item is obtained are read off this one list, so they cannot disagree (apply):
obtain, vendors, events, biomes, times, conditions, eventOnly, minDifficulty. The milestones
(milestones.py) use the same list. See REQUIREMENTS D8b.

A source is a dict:
  kind        "npc" / "bag" / "container" (a drop row), "shop" (a shop row), "vendor" (a vendor
              the Items table names, without a shop row), "reward" (a reward page, [obtain] page),
              "shimmer", "extractinator", "name" ([obtain] names), "tag" (a method only the wiki's
              tags name)
  obtain      the obtain methods it stands for
  regular     False: only in special world seeds - shown, but it counts for nothing (CO6)
  free        True: no restriction of its own - at any time, in any difficulty
  covered     True: a tag the item's drop rows say more precisely (it only names the method)
  events, biomes, times, conditions
              when and where it is available
  drop + source, row + vendor, method
              the drop row and its source, the shop row and its vendor, the tagged method
"""
import fnmatch
from collections import Counter

from .common import DIFFICULTY_BY_RARITY, log, norm_name, seed_only

# Methods without a restriction of their own when only the wiki's tags name them: at any time and
# in any difficulty (crafting, world items, fishing, a vendor without a shop row).
FREE = {"crafted", "vendor", "loot", "plunder", "fishing", "quest-reward"}
# The methods of drop rows: for an item with rows a tag naming one adds nothing (the rows are more
# precise); without rows it is a source nothing more is known about.
ROW_METHODS = {"drop", "bag", "treasure-bag", "loot"}
# the method of shop rows
VENDOR = "vendor"


class Sources:
    def __init__(self, items, drops, shops, rewards, shimmer_results, extractinator, mapping):
        """`rewards`: page_rewards (conditions.py); `shimmer_results`: keys of the items a shimmer
        transmutation gives; `extractinator`: item key -> machine ids it comes from."""
        self.drops, self.shops, self.rewards = drops, shops, rewards
        self.shimmer_results, self.extractinator = shimmer_results, extractinator
        self.sections = mapping.sections
        self.obtain = mapping.sections["obtain"]
        # words of a chance that bind a drop to an event ("during Halloween")
        self.event_words = {eid: [w.lower() for w in e["drop_conditions"]]
                            for eid, e in mapping.sections["events"].items() if e.get("drop_conditions")}
        self.vendors = {}  # item key -> its vendors
        self.report = Counter()
        self.of = {item["key"]: self.collect(item) for item in items}

    @staticmethod
    def plain(kind, oid, **more):
        """A source without data of its own."""
        return {"kind": kind, "regular": True, "free": oid in FREE, "obtain": [oid], "events": set(),
                "biomes": set(), "times": set(), "conditions": set(), **more}

    def collect(self, item):
        key, out = item["key"], []
        rows = self.drops.drops.get(key, [])
        for d in rows:
            source = self.drops.sources[d["source"]]
            # containers are never restricted, and they add no events (fruit of a tree at night)
            container = source["kind"] == "container"
            events = set(source.get("events", ()))
            if not container:
                # the drop itself can be bound to an event: by a condition or the words of its chance
                rate = d.get("rate", "").lower()
                events |= set(d.get("events", ()))
                events |= {eid for eid, words in self.event_words.items() if any(w in rate for w in words)}
            out.append({
                "kind": source["kind"], "regular": not seed_only(d), "free": container, "drop": d, "source": source,
                "obtain": [oid for oid, o in self.obtain.items()
                           if source["kind"] in o.get("from_drops", ())
                           or source.get("group") in o.get("from_containers", ())],
                "events": events,
                "biomes": set(source.get("biomes", ())) | (set() if container else set(d.get("biomes", ()))),
                # an enemy's spawn times count as the drop's
                "times": set(source.get("times", ())),
                "conditions": set() if container else set(d.get("conditions", ())) | set(source.get("times", ())),
            })
        shop = self.shops.get(key, [])
        for r in shop:
            out.append({"kind": "shop", "regular": not seed_only(r), "free": False, "row": r, "vendor": r["vendor"],
                        "obtain": [VENDOR], "events": set(r["events"]), "biomes": set(r["biomes"]), "times": set(),
                        "conditions": set(r["conditions"])})
        # the vendors the Items table names; one that only has rows in special seeds is no vendor of
        # the item (the Princess's Terragrim)
        sold = [r["vendor"] for r in shop if not seed_only(r)]
        named = [v for v in item["vendors"] if v in sold or v not in {r["vendor"] for r in shop}]
        self.report["vendors only in special seeds"] += len(item["vendors"]) - len(named)
        self.report["vendors from shop rows"] += len(set(sold) - set(named))
        self.vendors[key] = named + [v for v in dict.fromkeys(sold) if v not in named]
        out += [self.plain("vendor", VENDOR, vendor=v) for v in named if v not in sold]
        # reward pages (Strange Plant rewards), with the conditions of their heading
        replaced = set()
        for oid, found in self.rewards.items():
            if key in found:
                replaced.add(self.obtain[oid].get("replaces"))
                out.append(self.plain("reward", oid, conditions=set(found[key])))
        name = norm_name(item["name"])
        for oid, o in self.obtain.items():
            if o.get("from_shimmer") and key in self.shimmer_results:
                out.append(self.plain("shimmer", oid))
            if set(o.get("from_extractinator", ())) & self.extractinator.get(key, set()):
                out.append(self.plain("extractinator", oid))
            if any(fnmatch.fnmatchcase(name, norm_name(p)) for p in o.get("names", ())):
                out.append(self.plain("name", oid))
        # unobtainable items only belong to "Unobtainable" (D19): the wiki's other tags are former
        # or nominal sources
        if item.get("unobtainable"):
            return out
        # what only the wiki's tags (or [manual]) say
        for oid in item["obtain"]:
            if oid in replaced:
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
            out.append(self.plain("tag", oid, method=oid, covered=covered,
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
