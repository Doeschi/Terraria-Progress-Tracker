"""What the Extractinator and the Chlorophyte Extractinator turn blocks into (REQUIREMENTS B6).

Not in the Cargo tables: the machines' pages have tables in "Possible conversions" – one per
input ("With {{item|Silt Block}} / {{item|Slush Block}}") with the results, their chance and
amount, sometimes under a heading row "[[Hardmode]] only" – and a table "Special conversions"
(an input always becomes another item: Hive -> Honey Block, Copper Ore -> Tin Ore).
"""
import re

from .common import log, warn
from .groups import plain

MACHINES = [
    {"id": "extractinator", "name": "Extractinator", "page": "Extractinator"},
    {"id": "chlorophyte-extractinator", "name": "Chlorophyte Extractinator", "page": "Chlorophyte Extractinator"},
]


def item_names(text):
    """The items of a cell: {{item|Silt Block}} -> Silt Block (its first parameter without "=",
    {{item|icons=n|Glowing Moss}} -> Glowing Moss)."""
    names = []
    for m in re.findall(r"\{\{item\|([^{}]+)\}\}", text, re.I):
        params = [p.strip() for p in m.split("|") if "=" not in p]
        if params:
            names.append(params[0])
    return names


def table_rows(table):
    """Rows of a wiki table as (heading text or None, [cells]); cells split at "||" and new lines."""
    rows = []
    for chunk in re.split(r"\n\|-[^\n]*", table):
        cells, heading = [], None
        for line in chunk.split("\n"):
            line = line.strip()
            if line.startswith("!"):
                heading = line.lstrip("! ").split("|")[-1].strip()
            elif line.startswith("|") and not line.startswith(("|+", "|}", "{|")):
                cells += [c.strip() for c in line[1:].split("||")]
        if cells or heading:
            rows.append((heading if not cells else None, cells))
    return rows


def section(text, title):
    m = re.search(rf"^(=+)\s*{re.escape(title)}\s*\1\s*$", text, re.M)
    if not m:
        return ""
    end = re.search(rf"^={{1,{len(m.group(1))}}}[^=]", text[m.end():], re.M)
    return text[m.end():m.end() + end.start()] if end else text[m.end():]


def page_results(machine, text):
    """[{machine, inputs: [names], input, item, chance, quantity, phase?, conversion?}]"""
    results = []
    conversions = section(text, "Special conversions")
    possible = section(text, "Possible conversions").replace(conversions, "")
    for table in re.findall(r"\{\|(.*?)\n\|\}", possible, re.S):
        caption = re.search(r"^\|\+(.*)$", table, re.M)
        if not caption:
            continue
        inputs = item_names(caption.group(1))
        label = " / ".join(inputs)
        phase = None
        for heading, cells in table_rows(table):
            if heading is not None:
                # "[[Pre-Hardmode]] only" / "[[Hardmode]] only"
                h = plain(heading).lower()
                phase = "prehardmode" if "pre-hardmode" in h else "hardmode" if "hardmode" in h else None
                continue
            names = item_names(cells[0]) if cells else []
            if not names or len(cells) < 3:
                continue
            row = {"machine": machine, "inputs": inputs, "input": label, "item": names[0],
                   "chance": plain(cells[1]).strip(), "quantity": plain(cells[2]).strip()}
            if phase:
                row["phase"] = phase
            results.append(row)
    for table in re.findall(r"\{\|(.*?)\n\|\}", conversions, re.S):
        # an output spanning several rows ({{item|Stone Block|rowspan=3}}): the rows below have
        # only their input
        outputs, span = [], 0
        for heading, cells in table_rows(table):
            if heading is not None or not cells:
                continue
            if len(cells) >= 2:
                outputs = item_names(cells[1])
                m = re.search(r"rowspan\s*=\s*(\d+)", cells[1])
                span = int(m.group(1)) - 1 if m else 0
            elif span > 0:
                span -= 1
            else:
                continue
            inputs = item_names(cells[0])
            for out in outputs:
                results.append({"machine": machine, "inputs": inputs, "input": " / ".join(inputs),
                                "item": out, "conversion": True})
    return results


def extractinator_file(wikitext, resolve, items, aliases=None):
    """extractinator.json: the machines (with their item) and the results, item names resolved to
    keys (`aliases`: wiki name -> item names or keys, [extractinator_inputs])."""
    by_name = {i["name"]: i["key"] for i in items}
    by_key = {i["key"] for i in items}
    machines, results, unknown = [], [], set()

    def keys(name):
        if name in (aliases or {}):
            # item keys ("FishingSeaweed") or names
            return [k for n in aliases[name] for k in ([n] if n in by_key else keys(n))]
        found = resolve(name)
        if not found:
            unknown.add(name)
        return [i["key"] for i in found]

    for m in MACHINES:
        text = wikitext.get(m["page"])
        if not text:
            log(f"  warning: page '{m['page']}' not downloaded (step 1)")
            continue
        machines.append({"id": m["id"], "name": m["name"], "item": by_name.get(m["name"])})
        for r in page_results(m["id"], text):
            input_keys = [k for n in r["inputs"] for k in keys(n)]
            for key in keys(r["item"]):
                row = {"machine": r["machine"], "item": key, "inputs": input_keys, "input": r["input"]}
                for f in ("chance", "quantity", "phase", "conversion"):
                    if r.get(f):
                        row[f] = r[f]
                results.append(row)
    log(f"  extractinators: {len(results)} results of {len({r['item'] for r in results})} items "
        f"({sum(1 for r in results if r.get('conversion'))} conversions)")
    if unknown:
        warn(f"Extractinator: unknown items {sorted(unknown)} (add them to [extractinator_inputs])")
    return {"machines": machines, "results": results}
