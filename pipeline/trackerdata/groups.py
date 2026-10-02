"""Drop groups (REQUIREMENTS B5): "one of the following items" in the drop lists of the wiki pages.

The Cargo Drops table lists each item of a group with its own chance; only the page source says
that they belong together:

  |:group:start|One of the following 8 items will always be dropped| @normal
  | Venus Magnum|1|12.5% @normal                      (a text; each row has its chance)
  ...
  |:group:end|---------|---------

  |:group:start|1|1/12                               (amount and chance of the group;
    | Balloony Beads||                                 the rows have none: "1/12: one of these")
  |:group:end|-----------------|-

  |:group:start|1|   or   |:group:start||           (rows with their own chances that exclude
    | Sailfish Boots||1/40                             each other: "only one of these")
  |:group:end|-----------------|-
"""
import re

from .common import norm_name, strip_markup

# templates whose first parameter is their text ({{item|Grenade Launcher}}, {{tr|Cavern}})
TEXT_TEMPLATES = {"item", "tr", "chance", "eil", "i", "l"}


def plain(text):
    """Wikitext -> plain text: references, comments and most templates removed."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref[^>/]*/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    text = text.replace("&nbsp;", " ")
    # innermost templates first
    while True:
        new = re.sub(r"\{\{([^{}]*)\}\}", template_text, text)
        if new == text:
            break
        text = new
    return strip_markup(text)


def template_text(m):
    name, *params = m.group(1).split("|")
    params = [p for p in params if "=" not in p]
    name = name.strip().lower()
    if name == "modes" and params:
        # {{modes|1/3|1/2}}: normal, expert (and master) value
        return params[0] + (f" (Expert: {params[1]})" if len(params) > 1 and params[1] != params[0] else "")
    if name in TEXT_TEMPLATES and params:
        return params[0]
    return ""


def split_top(text, sep="|"):
    """Split at `sep` outside of {{templates}} and [[links]]."""
    parts, depth, start, i = [], 0, 0, 0
    while i < len(text):
        two = text[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            i += 2
            continue
        if two in ("}}", "]]"):
            depth = max(0, depth - 1)
            i += 2
            continue
        if text[i] == sep and depth == 0:
            parts.append(text[start:i])
            start = i + 1
        i += 1
    parts.append(text[start:])
    return parts


def rows_of(block):
    """Rows of a drop list ("| name|amount|chance", one per line, continuation lines ":+ ...")."""
    rows, current = [], None
    for line in block.split("\n"):
        stripped = line.strip()
        if stripped.startswith("|"):
            if current is not None:
                rows.append(current)
            current = stripped[1:]
        elif current is not None and stripped:
            current += "\n" + stripped
    if current is not None:
        rows.append(current)
    return [split_top(r) for r in rows]


def row_items(row):
    """Item names of a row: "Venus Magnum", "custom:Grenade Launcher/Rocket I" -> Grenade Launcher
    and Rocket I (dropped with it), "bonusdrop:Torch" -> Torch, "custom:|{{item|Picksaw}}" ->
    Picksaw."""
    name = row[0].strip()
    m = re.match(r":?custom:([^:|]*)", name)
    if m:
        if m.group(1).strip():
            return [n.strip() for n in m.group(1).split("/") if n.strip()]
        text = plain(row[1]) if len(row) > 1 else ""
        return [re.sub(r"\s*\([^)]*\)$", "", text).strip()]
    return [plain(re.sub(r"^\w+:", "", name)).strip()]


AMOUNT = re.compile(r"^\d+(?:\s*[–-]\s*\d+)?$")
# game modes of a row or group ("| Venus Magnum|1|12.5% @normal"; "#expert": in the treasure bag)
MODES = {"@normal": ["normal"], "#expert": ["expert", "master"], "@expert": ["expert", "master"],
         "@master": ["master"]}


def page_groups(text):
    """The groups of a page source: [{"text"?, "amount"?, "chance"?, "modes"?, "sections"?, "items": [names],
    "chances": [chance text of each item]}]."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref[^>/]*/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    groups = []
    headings = [(h.start(), plain(h.group(2))) for h in re.finditer(r"^(=+)\s*(.*?)\s*\1\s*$", text, re.M)]
    for m in re.finditer(r"\|\s*:group:start(.*?)\|\s*:group:end", text, re.S):
        head, _, body = m.group(1).partition("\n")
        params = [p.strip() for p in split_top(head)][1:]
        first = plain(params[0]).strip() if params else ""
        second = plain(params[1]).strip() if len(params) > 1 else ""
        modes = sorted({mode for marker, ms in MODES.items() if marker in head for mode in ms})
        second = re.sub(r"[@#]\w+", "", second).strip()
        group = {}
        lines = first.split("\n")
        if first and all(AMOUNT.match(line.strip()) for line in lines):
            # amount per item; several lines: per layer ("5–14 (Underground) / 3–10 (Cavern)")
            group["amount"] = " / ".join(line.strip() for line in lines)
        elif first:
            group["text"] = " ".join(lines)
        if "%" in second or "/" in second:
            group["chance"] = second  # leaves out separators ("-----") and stray numbers
        rows = []
        for r in rows_of(body):
            names = [n for n in row_items(r) if n and not n.startswith(":")] if r and r[0].strip() else []
            if not names:
                continue
            # the amount of a row (custom rows have their display text there), else the group's
            custom = "custom:" in r[0]
            amount = plain(r[1]).strip() if len(r) > 1 and not custom else ""
            rows.append((names, amount or group.get("amount", ""), plain(r[2]) if len(r) > 2 else ""))
        group["items"] = [name for names, _, _ in rows for name in names]
        # the amount and chance of each item's row (if it has them)
        group["amounts"] = [amount for names, amount, _ in rows for _ in names]
        group["chances"] = [chance for names, _, chance in rows for _ in names]
        group["size"] = len(rows)
        if modes:
            group["modes"] = modes
        # the page section it is in ("Underground", "Cavern": the layers of a Gold Chest)
        section = [name for pos, name in headings if pos < m.start()]
        if section:
            group["sections"] = [section[-1]]
        groups.append(group)
    return groups


def read_groups(pages):
    """{normalized page name: [groups]} of the downloaded pages (translations left out)."""
    return {norm_name(page): groups for page, text in pages.items()
            if "/" not in page and (groups := page_groups(text))}
