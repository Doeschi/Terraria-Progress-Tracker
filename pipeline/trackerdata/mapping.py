"""mapping.toml: how raw values become categories, subcategories, obtain methods, vendors, events, ..."""
import fnmatch
import sys
import tomllib
from collections import Counter

from .common import LIST_SECTIONS, norm_name, norm_value


class Mapping:
    def __init__(self, path):
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        self.fields = data["settings"]["match_fields"]
        # update id -> display name / icon item ("1.0" = {name, icon}, or just the name)
        versions = data.get("versions", {})
        self.versions = {v: e["name"] if isinstance(e, dict) else e for v, e in versions.items()}
        self.version_icons = {v: e["icon"] for v, e in versions.items()
                              if isinstance(e, dict) and e.get("icon")}
        # pickups used up on touch (Heart, Star, ...): no inventory items, not tracked
        self.pickups = set(data.get("pickups", {}).get("items", []))
        self.drop_kinds = data.get("drops", {}).get("include_kinds", ["npc", "bag"])
        self.boss_ignore_items = data.get("drops", {}).get("boss_ignore_items", [])
        self.boss_stages = data.get("boss_stages", {})
        # conditions of shop rows and drops (see conditions.py)
        self.conditions = data.get("conditions", {})
        # milestones ("available after", see milestones.py)
        self.milestones = {k: v for k, v in data.get("milestones", {}).items() if isinstance(v, dict)}
        self.milestone_conditions = data.get("milestone_conditions", {})
        self.container_milestones = data.get("container_milestones", {})
        self.milestone_sources = data.get("milestone_sources", {})
        self.drop_variants = data.get("drop_variants", {})
        self.drop_areas = data.get("drop_areas", {})
        self.extractinator_inputs = data.get("extractinator_inputs", {})
        self.milestone_items = data.get("milestone_items", {})
        # container groups ("Found in") and icons of containers that are no item
        self.containers = data.get("containers", {})
        for group in self.containers.values():
            group["match"] = [p.lower() for p in group.get("match", [])]
        self.container_icons = {norm_name(k): v for k, v in data.get("container_icons", {}).items()}
        self.bosses = data.get("bosses", {})
        self.recipes = data.get("recipes", {})
        self.recipe_groups = data.get("recipe_groups", {})
        self.stations = data.get("stations", {})
        # items only known from recipes: name pattern -> similar item used as template
        self.recipe_items = data.get("recipe_items", {})
        # items the wiki marks unobtainable that count as obtainable after all (normalised names)
        self.obtainable = {norm_name(n) for n in data.get("unobtainable", {}).get("obtainable", [])}
        # items the wiki does not mark unobtainable that are anyway (never really added to the game)
        self.unobtainable = {norm_name(n) for n in data.get("unobtainable", {}).get("unobtainable", [])}
        self.bestiary = data.get("bestiary", {})
        self.sections = {s: data.get(s, {}) for s in LIST_SECTIONS}
        for entries in self.sections.values():
            for entry in entries.values():
                # keys are lowercase; allow game field names like "equip:accRunSpeed"
                entry["match"] = [p.lower() for p in entry.get("match", [])]
                entry["exclude"] = [p.lower() for p in entry.get("exclude", [])]
        self.flags = data.get("flags", {})
        self.ignore = data.get("ignore", {}).get("keys", [])
        # [manual]: item name pattern -> ["section:id", ...]
        self.manual = []
        for pattern, targets in data.get("manual", {}).items():
            pairs = []
            for target in targets:
                section, _, entry_id = target.partition(":")
                if entry_id not in self.sections.get(section, {}):
                    sys.exit(f"mapping: [manual] '{pattern}' -> unknown '{target}'")
                pairs.append((section, entry_id))
            self.manual.append((norm_name(pattern), pairs))
        self.manual_used = Counter()
        for sub_id, sub in self.sections["subcategories"].items():
            parent = sub.get("parent")
            if parent and parent not in self.sections["categories"]:
                sys.exit(f"mapping: subcategory '{sub_id}' has unknown parent '{parent}'")

    @staticmethod
    def hits(patterns, key):
        return any(fnmatch.fnmatchcase(key, p) if "*" in p else key == p
                   for p in patterns)

    def keys_of(self, row, schema):
        """All raw keys "<field>:<value>" of one row, minus ignored ones."""
        keys, ignored = [], []
        for field in self.fields:
            raw = row.get(field) or ""
            info = schema.get(field, {})
            values = raw.split(info["delimiter"]) if info.get("list") else [raw]
            for v in values:
                v = norm_value(v)
                if not v:
                    continue
                key = f"{field}:{v}"
                (ignored if self.hits(self.ignore, key) else keys).append(key)
        return keys, ignored

    def apply(self, keys, name):
        """-> ({section: [ids]}, {flag: bool}, set of keys that matched nothing)."""
        matched = set()
        result = {}
        for section, entries in self.sections.items():
            ids = []
            for entry_id, entry in entries.items():
                hit = [k for k in keys if self.hits(entry.get("match", []), k)]
                if hit:
                    ids.append(entry_id)
                    matched.update(hit)
            result[section] = ids
        # manual assignments by item name
        name = norm_name(name)
        for pattern, pairs in self.manual:
            if self.hits([pattern], name):
                self.manual_used[pattern] += 1
                for section, entry_id in pairs:
                    if entry_id not in result[section]:
                        result[section].append(entry_id)
        # "exclude" removes an entry again for items with one of these keys
        for section, entries in self.sections.items():
            result[section] = [e for e in result[section]
                               if not any(self.hits(entries[e]["exclude"], k) for k in keys)]
        subs_def = self.sections["subcategories"]
        cats = result["categories"]
        # "only_in_parent" subcategories apply only to items already in the parent
        result["subcategories"] = [s for s in result["subcategories"]
                                   if not subs_def[s].get("only_in_parent")
                                   or subs_def[s].get("parent") in cats]
        # a subcategory puts the item into its parent category too
        for sub_id in result["subcategories"]:
            parent = subs_def[sub_id].get("parent")
            if parent and parent not in cats:
                cats.append(parent)
        # "without_categories": not for items that are also in one of these categories
        result["subcategories"] = [s for s in result["subcategories"]
                                   if not any(c in cats for c in subs_def[s].get("without_categories", ()))]
        # "with_categories" subcategories take the parent's items that are also in
        # one of these categories (e.g. crafting materials that are blocks)
        for sub_id, sub in subs_def.items():
            wanted = sub.get("with_categories")
            if (wanted and sub.get("parent") in cats and sub_id not in result["subcategories"]
                    and any(c in cats for c in wanted)):
                result["subcategories"].append(sub_id)
        # "fallback" subcategories take the items of their parent that fit no other one
        for sub_id, sub in subs_def.items():
            parent = sub.get("parent")
            if sub.get("fallback") and parent in cats and sub_id not in result["subcategories"]:
                if not any(subs_def[s].get("parent") == parent for s in result["subcategories"]):
                    result["subcategories"].append(sub_id)
        for section, ids in result.items():
            order = list(self.sections[section])
            ids.sort(key=order.index)
        flags = {}
        for name, patterns in self.flags.items():
            hit = [k for k in keys if self.hits(patterns, k)]
            flags[name] = bool(hit)
            matched.update(hit)
        return result, flags, set(keys) - matched
