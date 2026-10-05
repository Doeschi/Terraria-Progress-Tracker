"""Item lists of wiki pages: what a rendered page lists below each heading (REQUIREMENTS D26)."""
import html
import re

from .common import log, norm_name

# the wiki's platform notes in a heading: "(3DS version) Oktoberfest Vanity Sets"
NOTE = re.compile(r"\([^()]*\bversions?\)")


def page_lists(page_html):
    """{heading: [title of each entry]} of the item lists (class "itemlist") of a rendered page.
    An entry is an item or a page of several items (a set)."""
    lists = {}
    parts = re.split(r"<h[2-4][^>]*>(.*?)</h[2-4]>", page_html, flags=re.S)
    for n in range(1, len(parts), 2):
        # the heading without its "[edit]" link and the platform notes
        text = re.sub(r"<[^>]+>", " ", parts[n].split('<span class="mw-editsection"')[0])
        heading = re.sub(r"\s+", " ", NOTE.sub("", html.unescape(text))).strip()
        titles = []
        for block in re.findall(r'<div class="itemlist".*?</ul></div>', parts[n + 1], re.S):
            for entry in block.split("<li")[1:]:
                # the first link that is not the entry's image (a missing image links its file)
                links = re.findall(r'<a href="/wiki/[^"]*"[^>]*title="([^"]+)"', entry)
                title = next((html.unescape(t) for t in links if not t.startswith("File:")), None)
                if title:
                    titles.append(title)
        if heading and titles:
            lists[heading] = titles
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
        for heading, titles in lists.items():
            key = f"list:{norm_name(page)}#{norm_name(heading)}"
            entries += len(titles)
            for title in titles:
                found = resolve(title) or resolve(redirects.get(title, ""))
                if not found:
                    unknown.append(title)
                for item in found:
                    keys.setdefault((item["id"], norm_name(item["name"])), set()).add(key)
        log(f"  lists of '{page}': " + ", ".join(f"{h} {len(t)}" for h, t in lists.items())
            + (f"; not in the item data: {unknown}" if unknown else ""))
    return keys, entries
