"""The introductions of the wiki pages (intros.json) from page_intros.json (REQUIREMENTS D24)."""
import re
from html.parser import HTMLParser

LISTS = {"ul", "ol"}
# elements that end the paragraph or list entry before them
BREAKS = {"p", "li", "dd", "dt", "blockquote", "pre"}
SKIPPED = {"style", "script"}


def tidy(text):
    """Text of a paragraph: one space between words (the wiki's icons leave gaps), the notes
    on platforms apart from the word before them ("Shadow Mummies(Old-gen console and 3DS
    versions)")."""
    text = re.sub(r"\s+", " ", text).strip()
    # brackets around an icon alone ("right-clicking the icon ()")
    text = re.sub(r" ?\(\s*\)", "", text)
    text = re.sub(r"(?<=[\w%)\]])\((?=[^()]*\bversions?\))", " (", text)
    text = re.sub(r"\( ", "(", text)
    return re.sub(r" ([,.;:!?)])", r"\1", text)


class IntroParser(HTMLParser):
    """The blocks of an introduction: a paragraph is a string, a list the list of its entries
    (the entries of a list inside a list follow their parent)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.text = []       # pieces of the paragraph or list entry being read
        self.entries = None  # entries of the list being read
        self.depth = 0       # lists inside lists
        self.skipping = 0

    def flush(self):
        text, self.text = tidy("".join(self.text)), []
        if text:
            (self.blocks if self.entries is None else self.entries).append(text)

    def handle_starttag(self, tag, attrs):
        if tag in SKIPPED:
            self.skipping += 1
        elif tag in LISTS:
            self.flush()
            if not self.depth:
                self.entries = []
            self.depth += 1
        elif tag in BREAKS:
            self.flush()
        elif tag == "br":
            self.text.append(" ")

    def handle_endtag(self, tag):
        if tag in SKIPPED:
            self.skipping = max(0, self.skipping - 1)
        elif tag in LISTS:
            self.flush()
            self.depth = max(0, self.depth - 1)
            if not self.depth and self.entries is not None:
                if self.entries:
                    self.blocks.append(self.entries)
                self.entries = None
        elif tag in BREAKS:
            self.flush()

    def handle_data(self, data):
        if not self.skipping:
            self.text.append(data)


def intro_blocks(page_html):
    """[paragraph or [list entry, ...], ...] of an introduction's HTML."""
    parser = IntroParser()
    parser.feed(page_html)
    parser.close()
    parser.flush()
    if parser.entries:
        parser.blocks.append(parser.entries)
    blocks = parser.blocks
    # a single sentence that announces a table or a row of icons ("The full set grants the
    # following effects while equipped:"): the wiki's introduction leaves those out, so the
    # sentence goes too - unless it is all there is (Ankh Charm)
    kept = [b for n, b in enumerate(blocks)
            if not (isinstance(b, str) and b.endswith(":") and not re.search(r"[.!?] ", b)
                    and not isinstance(blocks[n + 1] if n + 1 < len(blocks) else None, list))]
    return kept or blocks


def intros_file(page_intros, items, entries):
    """{wiki page: blocks} for the pages of the items and the bestiary entries; pages without
    an introduction are left out. Not the pages of banners: they are the pages of their enemies."""
    pages = {i["page"] for i in items if i.get("page") and not i.get("banner")} | {e["page"] for e in entries}
    intros = {page: intro_blocks(page_intros.get(page, {}).get("html", "")) for page in sorted(pages)}
    return {page: blocks for page, blocks in intros.items() if blocks}
