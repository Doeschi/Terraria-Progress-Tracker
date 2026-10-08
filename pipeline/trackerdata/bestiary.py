"""The bestiary (bestiary.json) from the wiki pages "Bestiary/List" and "NPC IDs"."""
import html
import re
from collections import Counter, defaultdict

from .common import IMAGES, flag, image_url, log, norm_name, number, page_url
from .items import patch_version, version_group


def npc_id_table(page_html):
    """Rows of the rendered "NPC IDs" page: internal name -> {id, page, image}."""
    npcs = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 4:
            continue
        code = re.search(r"<code>(.*?)</code>", cells[3])
        link = re.search(r'<a href="/wiki/[^"]*" title="([^"]*)"', cells[1])
        img = re.search(r'src="/images/([^"?]+)', cells[2])
        if not code:
            continue
        npcs[html.unescape(code.group(1)).strip()] = {
            "id": int(re.sub(r"[^\d-]", "", cells[0].replace("−", "-")) or 0),
            "page": html.unescape(link.group(1)) if link else None,
            "image": IMAGES + img.group(1) if img else None,
        }
    return npcs


def npc_id_versions(page_html):
    """History of "NPC IDs": [(first id, last id, patch)] from "Added IDs a–b" /
    "Added ID n" / "Changed ID n" per Desktop patch."""
    i = page_html.find('id="History"')
    text = html.unescape(re.sub(r"<[^>]+>", " ", page_html[i:])) if i >= 0 else ""
    text = re.sub(r"\s+", " ", text).replace("−", "-")
    ranges = []
    parts = re.split(r"(Desktop [\d.]+)", text)
    for label, body in zip(parts[1::2], parts[2::2]):
        v = patch_version(label)
        if not v:
            continue
        for a, b in re.findall(r"Added IDs? (-?\d+)(?:\s*[–-]\s*(-?\d+))?", body):
            ranges.append((int(a), int(b or a), v))
        for a in re.findall(r"Changed ID (\d+)", body):
            ranges.append((int(a), int(a), v))
    return ranges


def l10n_names(wikitext):
    """English labels of the variant notes ({{l10n/register|bl|en | w_hat = With a Hat ...}})."""
    m = re.search(r"\{\{l10n/register\|bl\|en(.*?)\}\}", wikitext, re.S)
    names = {}
    for key, value in re.findall(r"\|\s*(\w+)\s*=\s*([^|<}]+)", m.group(1) if m else ""):
        names[key] = value.strip()
    return names


def table_rows(wikitext):
    """The rows of the table of "Bestiary/List", each as its cells."""
    table = wikitext[wikitext.find("{|"):]
    return [[c.strip() for c in row.strip().split("\n| ")] for row in table.split("\n|-")[1:]]


def entity_page(entity):
    """The wiki page of a row's entity ("{{tr|Blue Slime}}", "[[Guide]]"), None without one."""
    page = re.search(r"\{\{tr\|([^|}]+)", entity) or re.search(r"\[\[([^|\]]+)", entity)
    return html.unescape(page.group(1)).strip() if page else None


def entry_pages(wikitext):
    """The wiki pages of all bestiary entries (step 1 downloads their introductions)."""
    return sorted({page for cells in table_rows(wikitext) if len(cells) >= 5
                   for page in [entity_page(cells[1])] if page})


def bestiary_file(wikitext, page_html, npc_rows, exclusive, mapping, version_names):
    conf = mapping.bestiary
    icons = conf.get("icons", {})
    npc_ids = npc_id_table(page_html)
    id_versions = npc_id_versions(page_html)
    variants = l10n_names(wikitext)
    npcs_by_id = {}
    for r in npc_rows:
        if r["npcid"].strip():
            npcs_by_id.setdefault(int(r["npcid"]), r)
    type_rules = {t: {x.lower() for x in types} for t, types in conf.get("types", {}).items()}
    filters = conf.get("filters", {})
    first = tuple(int(x) for x in conf.get("first_version", "1.4.0").split("."))
    allowed = conf.get("platforms", ["desktop", "console", "mobile"])

    entries, problems = [], Counter()
    raw_types = {}  # entry id -> the NPCs table's types (for "type:..." in [bestiary.unlock_groups])
    for n, cells in enumerate(table_rows(wikitext), start=1):
        if len(cells) < 5:
            problems["row without 5 cells"] += 1
            continue
        _, entity, stars, filter_cell, desc = cells[:5]
        key = re.search(r"Bestiary_FlavorText\.npc_(\w+)", desc)
        page = entity_page(entity)
        if not key or not page:
            problems["row without name or key"] += 1
            continue
        key = key.group(1)
        notes = [variants.get(k, k) for k in re.findall(r"\{\{l10n\|bl\|(\w+)\}\}", entity)]
        name = f"{page} ({', '.join(notes)})" if notes else page
        npc = npc_ids.get(key)
        if not npc:
            problems[f"no NPC id for {key}"] += 1
        npc_id = npc["id"] if npc else None
        row_types = {t.strip().lower() for t in (npcs_by_id.get(npc_id) or {}).get("type", "").split("^")}
        raw_types[key] = row_types
        etype = next((t for t, types in type_rules.items() if row_types & types), "enemy")
        # version: the NPC id's update, but not before the bestiary itself
        v = max((ver for a, b, ver in id_versions if npc_id is not None and a <= npc_id <= b),
                default=first)
        version = version_group(max(v, first))
        if version not in version_names:
            problems[f"version {version} unknown"] += 1
        excl = exclusive.get(norm_name(page))
        plats = [pl for pl in allowed if excl and flag(excl.get(pl))] or list(allowed)
        targets = defaultdict(list)
        for f in re.findall(r"Bestiary_(?:Biomes|Times|Events|Invasions)\.(\w+)", filter_cell):
            if f not in filters:
                problems[f"filter {f} not in [bestiary.filters]"] += 1
            for target in filters.get(f, []):
                section, _, tid = target.partition(":")
                if tid not in targets[section]:
                    targets[section].append(tid)
        entry = {
            "id": key, "n": n, "name": name, "page": page, "url": page_url(page),
            # [bestiary.icons] replaces a poor image (e.g. Moon Lord: his core -> his head)
            "icon": (image_url(icons[key]) if key in icons else npc["image"] if npc else None), "type": etype,
            "stars": number(stars), "npcId": npc_id,
            "biomes": targets["biomes"], "times": targets["times"], "events": targets["events"],
            "version": version, "platforms": plats,
        }
        entries.append({k: v for k, v in entry.items() if v is not None})

    by_id = {e["id"]: e for e in entries}
    # what else unlocks an entry in the game ([bestiary.unlocked_by], [bestiary.unlock_groups]):
    # groups of entry ids - any group whose entries are all unlocked unlocks the entry
    unlocked_by = defaultdict(list)
    for key, rules in conf.get("unlocked_by", {}).items():
        for rule in rules:
            unlocked_by[key].append([rule] if isinstance(rule, str) else list(rule))
    for members in conf.get("unlock_groups", {}).values():
        ids = []
        for m in members:
            if m.startswith("type:"):
                ids += [e["id"] for e in entries if m[5:].lower() in raw_types[e["id"]]]
            else:
                ids.append(m)
        for i in ids:
            unlocked_by[i] += [[j] for j in ids if j != i]
    for key, groups in unlocked_by.items():
        unknown = [i for g in [[key], *groups] for i in g if i not in by_id]
        if unknown:
            problems[f"unlock rule with unknown entry {unknown}"] += 1
        else:
            by_id[key]["unlockedBy"] = groups
    types = []
    for tid, name in conf.get("type_names", {}).items():
        icon_entry = by_id.get(conf.get("type_icons", {}).get(tid, ""))
        types.append({"id": tid, "name": name, "icon": (icon_entry or {}).get("icon"),
                      "count": sum(1 for e in entries if e["type"] == tid)})
    log(f"  {len(entries)} bestiary entries: "
        + ", ".join(f"{t['count']} {t['id']}" for t in types))
    if problems:
        log(f"  problems: {dict(problems.most_common(20))}")
    return {"types": types, "entries": entries}
