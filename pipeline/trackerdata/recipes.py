"""Crafting recipes (recipes.json): stations, ingredient groups and shimmer transmutations."""
import fnmatch
import html
import re
from collections import Counter, defaultdict

from .common import file_from_wikitext, flag, image_url, log, norm_name, number
from .mapping import Mapping


# Words of the Recipes table's `version` column -> platform ids
RECIPE_PLATFORMS = {"desktop": "desktop", "console": "console", "mobile": "mobile",
                    "old-gen": "oldgen", "3ds": "3ds", "japanese": "japanese"}


def recipe_group_ids(wikitext):
    """"Any ..." groups of the page "Alternative crafting ingredients":
    {{#arraydefine:ids-Wood|9, 619, ...|,}} -> {"Any Wood": [9, 619, ...]}"""
    groups = {}
    for name, ids in re.findall(r"#arraydefine:ids-([^|]+)\|([\d,\s]+)\|", wikitext):
        groups[f"Any {name.strip()}"] = [int(i) for i in ids.split(",") if i.strip()]
    return groups


def recipes_file(rows, items, mapping, wikitext):
    """recipes.json: crafting recipes, stations, ingredient groups and shimmer
    transmutations. Items are referenced by key."""
    by_name, by_id = defaultdict(list), defaultdict(list)
    for item in items:
        by_name[norm_name(item["name"])].append(item)
        by_id[item["id"]].append(item)

    def by_pattern(patterns):
        pats = [p.lower() for p in patterns]
        return [i for i in items if Mapping.hits(pats, norm_name(i["name"]))]

    def resolve(name, item_id=None):
        """Item for a name ("Blue Jellyfish (bait)" -> "Blue Jellyfish");
        with several candidates the one with the id, then obtainable ones, then the one on
        its own page."""
        n = norm_name(name)
        found = by_name.get(n) or by_name.get(re.sub(r"\s*\([^)]*\)$", "", n)) or []
        if len(found) > 1 and item_id is not None:
            found = [i for i in found if i["id"] == item_id] or found
        if len(found) > 1:
            found = [i for i in found if not i.get("unobtainable")] or found
        if len(found) > 1:
            found = [i for i in found if norm_name(i["page"]) == n] or found
        return found[0] if found else None

    def icon_of(found):
        return next((i["icon"] for i in found if i.get("icon")), None)

    conf = mapping.recipes
    conditions = {norm_name(c) for c in conf.get("conditions", [])}
    shimmer_station = norm_name(conf.get("shimmer", "Shimmer"))

    groups = {}  # normalised name -> (name, items)
    for name, ids in recipe_group_ids(wikitext).items():
        found = []
        for i in ids:
            cands = by_id.get(i, [])
            # ids shared with old-gen/3DS items: prefer the desktop item
            found += [c for c in cands if "desktop" in c["platforms"]][:1] or cands[:1]
        groups[norm_name(name)] = (name, found)
    for name, patterns in mapping.recipe_groups.items():
        groups[norm_name(name)] = (name, by_pattern(patterns))

    stations, recipes, shimmer = {}, [], []
    unmatched, used_groups = Counter(), set()

    def station(name):
        n = norm_name(name)
        if n not in stations:
            if n in conditions:
                stations[n] = {"name": name, "condition": True}
            else:
                found = by_pattern(mapping.stations.get(name) or [name])
                if not found:
                    unmatched[f"station {name}"] += 1
                stations[n] = {"name": name, "items": [i["key"] for i in found],
                               "icon": icon_of(found)}
        return stations[n]["name"]

    for row in rows:
        if flag(row["legacy"]):
            continue
        result = resolve(row["result"], int(row["resultid"]) if row["resultid"].strip() else None)
        if not result:
            unmatched[f"result {row['result']}"] += 1
            continue
        amount = number(row["amount"]) or 1
        ingredients = []
        for part in html.unescape(row["ings"]).split("^"):
            bits = part.split("¦")
            if len(bits) != 3 or not bits[1].strip():
                continue
            name, count = bits[1].strip(), number(bits[2]) or 1
            if norm_name(name) in groups:
                used_groups.add(norm_name(name))
                ingredients.append({"group": groups[norm_name(name)][0], "amount": count})
                continue
            item = resolve(name)
            if item:
                ingredients.append({"item": item["key"], "amount": count})
            else:
                unmatched[f"ingredient {name}"] += 1
                ingredients.append({"name": name, "amount": count})
        station_names = [st.strip() for st in html.unescape(row["station"]).split(" and ")
                         if st.strip()]
        words = row["version"].split()
        for w in words:
            if w not in RECIPE_PLATFORMS:
                unmatched[f"platform {w}"] += 1
        platforms = [RECIPE_PLATFORMS[w] for w in words if w in RECIPE_PLATFORMS]
        if [norm_name(n) for n in station_names] == [shimmer_station]:
            # transmutation: one ingredient -> result
            for ing in ingredients:
                entry = {k: v for k, v in ing.items() if k != "amount"}
                shimmer.append({**entry, "result": result["key"], "amount": amount})
            continue
        recipe = {"result": result["key"], "amount": amount,
                  "stations": [station(n) for n in station_names],
                  "ingredients": ingredients}
        if platforms:
            recipe["platforms"] = platforms
        recipes.append(recipe)

    out_stations = {}
    for st in stations.values():
        out_stations[st["name"]] = {k: v for k, v in st.items() if k != "name" and v is not None}
    out_groups = {}
    for n, (name, found) in groups.items():
        if n not in used_groups:
            continue
        if not found:
            log(f"  warning: ingredient group '{name}' has no items")
        out_groups[name] = {k: v for k, v in
                            {"items": [i["key"] for i in found], "icon": icon_of(found)}.items()
                            if v is not None}
    log(f"  {len(recipes)} recipes for {len({r['result'] for r in recipes})} items, "
        f"{len(out_stations)} stations, {len(out_groups)} ingredient groups, "
        f"{len(shimmer)} shimmer transmutations")
    if unmatched:
        log(f"  {sum(unmatched.values())} names not matched (items missing from the Items "
            f"table are skipped): {dict(unmatched.most_common(20))}")
    return {"stations": out_stations, "groups": out_groups, "recipes": recipes, "shimmer": shimmer}


# fields a recipe-only item takes from its template item (what kind of item it is, not its stats)
TEMPLATE_FIELDS = ("page", "categories", "subcategories", "platforms", "hardmode", "stack",
                   "research", "consumable", "placeable", "autoswing")


def recipe_only_items(rows, items, templates, starts):
    """Items the Items table lacks but the Recipes table names with an id (e.g. 1.4.5 doors and
    candelabras). Built from the recipe (name, id, icon; obtained by crafting) and a similar item
    named in mapping.toml ([recipe_items], name pattern -> template item) for page, categories,
    platforms and placement flags.
    The game update comes from the item id. Items without a template are reported."""
    known = {i["id"] for i in items}
    by_name = {norm_name(i["name"]): i for i in items}
    patterns = [(norm_name(p), t) for p, t in templates.items()]
    added, missing = {}, []
    for row in rows:
        if flag(row["legacy"]) or not row["resultid"].strip():
            continue
        item_id = int(row["resultid"])
        if item_id in known or item_id in added:
            continue
        name = html.unescape(row["result"]).strip()
        template_name = next((t for p, t in patterns if fnmatch.fnmatchcase(norm_name(name), p)), None)
        template = by_name.get(norm_name(template_name)) if template_name else None
        if template_name and not template:
            log(f"  warning: [recipe_items] template item '{template_name}' not found")
        if not template:
            missing.append(name)
            continue
        version = next((v for start, v in reversed(starts) if start <= item_id), None)
        item = {
            "key": re.sub(r"\W", "", name.title()),
            "id": item_id,
            "name": name,
            "page": template["page"],
            "url": template["url"],
            "icon": image_url(file_from_wikitext(row["resultimage"]) or f"{name}.png"),
            **{f: template[f] for f in TEMPLATE_FIELDS if f in template},
            # known from a recipe (or a shimmer transmutation) - crafted
            "obtain": ["crafted"],
            "vendors": [], "events": [], "biomes": [], "times": [],
            "platformsKnown": False,
            "introduced": version,
            "version": version,
            "hardmodeOnly": False, "unobtainable": False, "banner": False, "questFish": False,
            # not in the wiki's Items table: no stats, rarity or prices
            "recipeOnly": True,
        }
        added[item_id] = {k: v for k, v in item.items() if v is not None}
    log(f"  {len(added)} items added from recipes (not in the Items table)"
        + (f"; without a template in [recipe_items]: {missing}" if missing else ""))
    return sorted(added.values(), key=lambda i: i["id"])


def missing_items_file(rows, items):
    """Items the wiki's Items table lacks but its Recipes table names with an id (e.g. 1.4.5
    furniture): id, name and the probable icon, so the app can name such ids in world files."""
    known = {i["id"] for i in items}
    missing = {}
    for row in rows:
        if flag(row["legacy"]) or not row["resultid"].strip():
            continue
        item_id = int(row["resultid"])
        if item_id not in known and item_id not in missing:
            name = html.unescape(row["result"]).strip()
            missing[item_id] = {"id": item_id, "name": name,
                                "icon": image_url(file_from_wikitext(row["resultimage"]) or f"{name}.png")}
    log(f"  {len(missing)} items known only from recipes (not in the Items table)")
    return sorted(missing.values(), key=lambda m: m["id"])
