#!/usr/bin/env python3
"""
Step 4 of the Terraria tracker pipeline (REQUIREMENTS DU1): compare the newly built data with the
previous one and write an update report to read before committing new data.

Compares web/public/data (step 2's output) with the same files in a git revision (default: HEAD,
the committed data) and writes update_report.md next to this script (not committed):
  - the parts read from page text with their minimums, and the warnings of step 2
    (build_warnings.json)
  - items added, removed and renamed (same item id, other key - renamed keys break progress files)
  - per item: changed categories, subcategories, "Obtained by", milestone, vendors, unobtainable
  - counts per data file before / after
and adds the items added, removed and renamed to the change log in meta.json (REQUIREMENTS DU4),
which the app uses to carry progress files over (renamed keys) and to tell what changed.

Usage:  python compare_data.py                 (after build_tracker_data.py)
        python compare_data.py --base HEAD~3   (compare with an older commit)
"""
import argparse
import json
import subprocess
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "web" / "public" / "data"
# item fields whose changes are listed, and the list file naming their ids
FIELDS = {
    "categories": "categories.json",
    "subcategories": "subcategories.json",
    "obtain": "obtain.json",
    "milestone": "milestones.json",
    "vendors": "vendors.json",
    "unobtainable": None,
}
# long lists in the report: the first ones, then "... and N more"
LIMIT = 150
# items named per change ("Armor → Armor, Sets: 230 items (Copper Greaves, ...)")
EXAMPLES = 12


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")


def old_file(rev, name):
    """A data file in a git revision, or None if it did not exist there."""
    r = git("show", f"{rev}:web/public/data/{name}")
    return json.loads(r.stdout) if r.returncode == 0 else None


def new_file(data_dir, name):
    path = data_dir / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def counts(name, data):
    """What a data file holds, as {label: number}."""
    if data is None:
        return {}
    if isinstance(data, list):
        out = {"entries": len(data)}
        if name == "sets.json":
            out["items"] = sum(len(s["items"]) for s in data)
        return out
    out = {}
    for key, value in data.items():
        if isinstance(value, (list, dict)):
            out[key] = len(value)
            # nested rows: drops per item, shop rows per item
            if isinstance(value, dict) and value and all(isinstance(v, list) for v in value.values()):
                out[f"{key} (rows)"] = sum(len(v) for v in value.values())
    if name == "shops.json":
        out = {"items": len(data), "rows": sum(len(v) for v in data.values())}
    return out


def shown_path(path):
    """A path for the report: relative to the project if it is inside it."""
    path = path.resolve()
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()


def capped(lines):
    if len(lines) <= LIMIT:
        return lines
    return lines[:LIMIT] + [f"- … and {len(lines) - LIMIT} more"]


def names_of(*lists):
    """id -> display name over the old and new versions of a list file."""
    out = {}
    for entries in lists:
        for e in entries or ():
            out.setdefault(e["id"], e.get("name", e["id"]))
    return out


def show(value, names):
    if isinstance(value, list):
        return ", ".join(names.get(v, v) for v in value) or "–"
    if value is None:
        return "–"
    return str(names.get(value, value)) if isinstance(value, str) else str(value)


def item_changes(old_items, new_items, data_dir, rev):
    old_by_key = {i["key"]: i for i in old_items}
    new_by_key = {i["key"]: i for i in new_items}
    added = [new_by_key[k] for k in new_by_key if k not in old_by_key]
    removed = [old_by_key[k] for k in old_by_key if k not in new_by_key]
    # renamed: an added and a removed item with the same item id (only one each)
    renamed = []
    for item in list(added):
        same = [r for r in removed if r["id"] == item["id"]]
        if len(same) == 1 and sum(a["id"] == item["id"] for a in added) == 1:
            renamed.append((same[0], item))
            added.remove(item)
            removed.remove(same[0])
    changes = {}
    for field, list_file in FIELDS.items():
        names = names_of(old_file(rev, list_file), new_file(data_dir, list_file)) if list_file else {}
        # the same change of many items (a new category) in one line, with its items
        by_change = {}
        for key, new in new_by_key.items():
            old = old_by_key.get(key)
            if not old:
                continue
            a, b = old.get(field), new.get(field)
            if isinstance(a, list) or isinstance(b, list):
                a, b = sorted(a or []), sorted(b or [])
            if a != b:
                by_change.setdefault(f"{show(a, names)} → {show(b, names)}", []).append(new["name"])
        changes[field] = sorted(by_change.items(), key=lambda c: -len(c[1]))
    return added, removed, renamed, changes


def change_lines(groups):
    """"- Armor → Armor, Sets: 230 items (Copper Greaves, Iron Greaves, … +218)"."""
    lines = []
    for change, items in groups:
        shown = ", ".join(items[:EXAMPLES]) + (f", … +{len(items) - EXAMPLES}" if len(items) > EXAMPLES else "")
        lines.append(f"- {change}: {len(items)} {'item' if len(items) == 1 else 'items'} ({shown})")
    return lines


def add_to_change_log(data_dir, readable_dir, added, removed, renamed):
    """meta.json "updates": the entry of the new data version gets the changes (merged with what an
    earlier run wrote for the same version); renames from [renamed_items] in mapping.toml too."""
    meta_path = data_dir / "meta.json"
    if not meta_path.exists():
        log("  meta.json missing - run build_tracker_data.py first; change log not written")
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if not (added or removed or renamed):
        return
    entry = next((u for u in meta["updates"] if u["dataVersion"] == meta["dataVersion"]), None)
    if entry is None:
        entry = {"dataVersion": meta["dataVersion"], "added": [], "removed": [], "renamed": {}}
        meta["updates"].append(entry)
    entry["added"] = sorted(set(entry["added"]) | {i["key"] for i in added})
    known = {r["key"] for r in entry["removed"]}
    entry["removed"] += [{"key": i["key"], "name": i["name"]} for i in removed if i["key"] not in known]
    entry["renamed"].update(renamed)
    meta["updates"].sort(key=lambda u: u["dataVersion"])
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if readable_dir.exists():
        (readable_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  change log of {meta['dataVersion']} in meta.json: {len(entry['added'])} added, "
        f"{len(entry['removed'])} removed, {len(entry['renamed'])} renamed")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="HEAD", help="git revision with the previous data (default: HEAD)")
    ap.add_argument("--data", type=Path, default=DATA, help="the new data (default: web/public/data)")
    ap.add_argument("--out", type=Path, default=HERE / "update_report.md")
    args = ap.parse_args()

    commit = git("log", "-1", "--format=%h %ad %s", "--date=short", args.base).stdout.strip()
    if not commit:
        sys.exit(f"unknown git revision: {args.base}")
    report = ["# Data update report", "",
              f"Previous data: `{args.base}` ({commit}) → new data: `{shown_path(args.data)}`.", ""]

    # step 2: parts read from page text, warnings
    warnings_path = HERE / "build_warnings.json"
    if warnings_path.exists():
        built = json.loads(warnings_path.read_text(encoding="utf-8"))
        report += ["## Parts read from page text", "", "| Part | Count | Minimum |", "|---|---:|---:|"]
        for name, s in built.get("sanity", {}).items():
            low = s["min"] is not None and s["count"] < s["min"]
            report.append(f"| {name} | {'**' if low else ''}{s['count']}{'**' if low else ''} | {s['min']} |")
        warnings = built.get("warnings", [])
        report += ["", f"## Warnings of step 2 ({len(warnings)})", ""]
        report += [f"- {w}" for w in warnings] or ["None."]
        report.append("")
    else:
        report += ["*build_warnings.json missing – run build_tracker_data.py first.*", ""]

    # items
    old_items, new_items = old_file(args.base, "items.json") or [], new_file(args.data, "items.json") or []
    added, removed, renamed, changes = item_changes(old_items, new_items, args.data, args.base)
    # renames the report cannot detect (another item id): [renamed_items] in mapping.toml
    manual = tomllib.loads((HERE / "mapping.toml").read_text(encoding="utf-8")).get("renamed_items", {})
    old_by_key, new_by_key = {i["key"]: i for i in old_items}, {i["key"]: i for i in new_items}
    for old, new in manual.items():
        if old in old_by_key and new in new_by_key and old not in new_by_key:
            pair = (old_by_key[old], new_by_key[new])
            if pair not in renamed:
                renamed.append(pair)
                added = [i for i in added if i["key"] != new]
                removed = [i for i in removed if i["key"] != old]
    report += [f"## Renamed items ({len(renamed)})", "",
               "Same item id, another key: checked items with the old key drop out of progress files.", ""]
    report += capped([f"- {o['name']} (`{o['key']}`) → {n['name']} (`{n['key']}`)" for o, n in renamed]) or ["None."]
    report += ["", f"## Added items ({len(added)})", ""]
    report += capped([f"- {i['name']} (`{i['key']}`, id {i['id']})" for i in added]) or ["None."]
    report += ["", f"## Removed items ({len(removed)})", ""]
    report += capped([f"- {i['name']} (`{i['key']}`, id {i['id']})" for i in removed]) or ["None."]
    report += ["", "## Changed items", ""]
    for field, groups in changes.items():
        total = sum(len(items) for _, items in groups)
        report += [f"### {field} ({total} items)", ""] + (capped(change_lines(groups)) or ["None."]) + [""]

    # counts per file
    files = sorted({p.name for p in args.data.glob("*.json")} | set(
        n.split("/")[-1] for n in git("ls-tree", "--name-only", args.base, "web/public/data/").stdout.split()
        if n.endswith(".json")))
    report += ["## Counts per data file", "", "| File | What | Before | After | Change |", "|---|---|---:|---:|---:|"]
    for name in files:
        if name == "sprites.json":
            continue
        before, after = counts(name, old_file(args.base, name)), counts(name, new_file(args.data, name))
        for label in dict.fromkeys([*before, *after]):
            a, b = before.get(label), after.get(label)
            diff = "" if a is None or b is None or a == b else f"{b - a:+d}"
            report.append(f"| {name} | {label} | {'–' if a is None else a} | {'–' if b is None else b} | {diff} |")

    args.out.write_text("\n".join(report) + "\n", encoding="utf-8")
    # the readable copy only for the real data (not a test copy given with --data)
    readable = HERE / "data_readable" if args.data.resolve() == DATA.resolve() else Path("/nonexistent")
    add_to_change_log(args.data, readable, added, removed,
                      {o["key"]: n["key"] for o, n in renamed})
    log(f"Wrote {args.out}: {len(added)} added, {len(removed)} removed, {len(renamed)} renamed items, "
        + ", ".join(f"{sum(len(i) for _, i in groups)} {field}" for field, groups in changes.items()) + " changes")


if __name__ == "__main__":
    main()
