"""Item lists of wiki pages: what a rendered page lists below each heading (REQUIREMENTS D26)."""
import html
import re

from .common import log, norm_name

# the wiki's platform notes in a heading: "(3DS version) Oktoberfest Vanity Sets"
NOTE = re.compile(r"\([^()]*\bversions?\)")


def page_lists(page_html):
    """{heading: [names of each entry]} of the item lists (class "itemlist") of a rendered page.
    An entry is an item or a page of several items (a set); its names are what it may be resolved
    by, best first: the text shown, then the titles of its links (an image's title without its
    " placed")."""
    lists = {}
    parts = re.split(r"<h[2-4][^>]*>(.*?)</h[2-4]>", page_html, flags=re.S)
    for n in range(1, len(parts), 2):
        # the heading without its "[edit]" link and the platform notes
        text = re.sub(r"<[^>]+>", " ", parts[n].split('<span class="mw-editsection"')[0])
        heading = re.sub(r"\s+", " ", NOTE.sub("", html.unescape(text))).strip()
        entries = []
        for block in re.findall(r'<div class="itemlist[^"]*".*?</ul></div>', parts[n + 1], re.S):
            for entry in block.split("<li")[1:]:
                entry = entry.split(">", 1)[-1]  # after the <li ...> attributes
                shown = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", entry))).strip()
                links = [html.unescape(t) for t in re.findall(r'<a href="/wiki/[^"]*"[^>]*title="([^"]+)"', entry)
                         if not t.startswith("File:")]
                # a note after the name ("Blue Cultist Fighter Banner Internal Item ID: 2903") is no name
                names = [shown, shown.split(" Internal Item ID")[0], *links,
                         *(t[: -len(" placed")] for t in links if t.endswith(" placed"))]
                names = [x for x in dict.fromkeys(names) if x and x != "Item IDs"]
                if names:
                    entries.append(names)
        if heading and entries:
            lists[heading] = entries
    return lists


def list_keys(pages, pages_html, resolve, redirects):
    """({(item id, name): {"list:<page>#<heading>", ...}}, number of entries read) for the pages
    of [page_lists]: every item of an entry (`resolve`: by name, or the items of that page;
    `redirects`: entries that are another name of a page, "Solar Cultist set" -> "Cultist set")
    gets the key of its list."""
    keys, entries = {}, 0
    for page in pages:
        lists = page_lists(pages_html.get(page, ""))
        unknown = []
        for heading, names in lists.items():
            key = f"list:{norm_name(page)}#{norm_name(heading)}"
            entries += len(names)
            for candidates in names:
                found = next((f for name in candidates for f in (resolve(name), resolve(redirects.get(name, ""))) if f), [])
                if not found:
                    unknown.append(candidates[0])
                for item in found:
                    keys.setdefault((item["id"], norm_name(item["name"])), set()).add(key)
        log(f"  lists of '{page}': " + ", ".join(f"{h} {len(t)}" for h, t in lists.items())
            + (f"; not in the item data: {unknown}" if unknown else ""))
    return keys, entries
