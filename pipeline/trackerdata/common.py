"""Constants and helpers shared by all steps: parsing raw Cargo values, names, URLs, CSV."""
import csv
import html
import re
import sys
from urllib.parse import quote




WIKI = "https://terraria.wiki.gg/wiki/"


IMAGES = "https://terraria.wiki.gg/images/"
# Image files that are only redirects on the wiki (their direct /images/ link is a 404):
# file name -> target file. Filled by the build from raw/image_redirects.json, which
# check_icons.py writes.
IMAGE_REDIRECTS = {}


CSV_DELIMITER = ";"


# mapping.toml sections that become list fields on items and their own JSON file.
LIST_SECTIONS = ["categories", "subcategories", "obtain", "vendors", "events", "biomes", "times"]


# Platform columns in the Exclusive table, in output order.
PLATFORM_FIELDS = ["desktop", "console", "mobile", "oldgen", "3ds", "japanese"]


# Platform id -> words of the comment above its icon in the wiki's CSS
# ({{eicons}}: ".eico.i1:before { /* Desktop version */ ... url(data:...) }")
PLATFORM_ICON_COMMENTS = {
    "desktop": "desktop version", "console": "console version", "mobile": "mobile version",
    "oldgen": "old-gen console version", "3ds": "3ds version", "japanese": "japanese console version",
}


PLATFORM_NAMES = {
    "desktop": "Desktop (PC)", "console": "Console", "mobile": "Mobile",
    "oldgen": "Old-gen console", "3ds": "Nintendo 3DS", "japanese": "Japanese console",
}


# The Exclusive table only has rows for items restricted to some versions
# ({{exclusive}} template); items without a row exist on every version.
DEFAULT_PLATFORMS = PLATFORM_FIELDS


# Items with these rarities only drop in Expert/Master mode (treasure bag items,
# relics, ...) unless they can also be obtained another way.
DIFFICULTY_BY_RARITY = {-12: "expert", -13: "master"}


OTHER_SOURCES = {"crafted", "vendor", "loot", "plunder", "fishing", "quest-reward"}


# Rarity level -> (name, suffix of the wiki file "Rarity_color_<suffix>_big")
RARITY_ICONS = {
    -13: ("Master", "fiery_red"), -12: ("Expert", "rainbow"), -11: ("Quest", "quest"),
    -1: ("Gray", "negative"), 0: ("White", "0"), 1: ("Blue", "1"), 2: ("Green", "2"),
    3: ("Orange", "3"), 4: ("Light Red", "4"), 5: ("Pink", "5"), 6: ("Light Purple", "6"),
    7: ("Lime", "7"), 8: ("Yellow", "8"), 9: ("Cyan", "9"), 10: ("Red", "10"),
    11: ("Purple", "11"),
}


# Coin id -> (name, value in copper); icon file "<Name>_Coin.png"
COINS = {"platinum": ("Platinum", 1_000_000), "gold": ("Gold", 10_000),
         "silver": ("Silver", 100), "copper": ("Copper", 1)}


# Difficulty id -> name; icon file "<Name>_Mode.png" on the page "Difficulty"
DIFFICULTIES = {"classic": "Classic", "expert": "Expert", "master": "Master", "journey": "Journey"}


# Terraria's special rarity values that the wiki writes as text.
RARITY_WORDS = {"quest": -11, "expert": -12, "master": -13}


def seed_only(row):
    """A shop or drop row only in special world seeds (Princess's stock in Celebration Mk 10 worlds,
    "I am error" chests, Remix drops): shown, but it counts for no filter (REQUIREMENTS CO6)."""
    return any(c.startswith("seed-") for c in row.get("conditions") or ())


# what step 2 reports for a decision (REQUIREMENTS DU1): written to build_warnings.json
WARNINGS = []


def log(*args):
    print(*args, file=sys.stderr, flush=True)
    text = " ".join(str(a) for a in args).strip()
    if text.startswith("warning:"):
        WARNINGS.append(text[len("warning:"):].strip())


def warn(text):
    """A finding that needs a decision (mapping.toml or the wiki): logged and collected."""
    log(f"  warning: {text}")


def strip_markup(value):
    """Wikitext/HTML -> plain text. Version icons and file embeds are removed."""
    text = html.unescape(value or "")
    text = re.sub(r'<span class="eico[^"]*".*?</span></span>', "", text)  # version icons
    text = re.sub(r"<s class=\"sortkey\".*?</s>", "", text)
    text = re.sub(r"\[\[(?:File|Category):[^\]]*\]\]", "", text)
    text = re.sub(r"\[\[[^|\]]*\|([^\]]*)\]\]", r"\1", text)   # [[page|label]]
    text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)             # [[page]]
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace(" ", " ").replace("\xa0", " ")
    lines = (re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n"))
    return "\n".join(line for line in lines if line)


# platform images in tooltips ("Right click to open / L2 to open (PlayStation logo) / ...") ->
# markers the app shows as icons (web/public/icons/platforms/<id>.*); other images are removed
TOOLTIP_ICONS = {
    "Desktop only.png": "desktop",
    "Console only.png": "console",
    "Mobile only.png": "mobile",
    "PS.svg": "playstation",
    "Xbox One.svg": "xbox-one",
    "Xbox.svg": "xbox",
    "Nintendo Switch.svg": "switch",
    "3DS.svg": "3ds",
    "Wii U icon.svg": "wiiu",
}


def tooltip_text(value):
    """strip_markup for item tooltips: the platform images become "{icon:<id>}" markers."""
    def icon(m):
        name = m.group(1).strip().replace("_", " ")
        return f"{{icon:{TOOLTIP_ICONS[name]}}}" if name in TOOLTIP_ICONS else m.group(0)
    return strip_markup(re.sub(r"\[\[File:([^|\]]+)[^\]]*\]\]", icon, html.unescape(value or "")))


def number(value, as_int=True):
    """First number in a raw value ("19 (set)", "150%", "9999 ... / 99" -> 19, 150, 9999).
    Where the wiki lists several values per platform, the first is the desktop one."""
    m = re.search(r"-?\d+(?:\.\d+)?", strip_markup(value))
    if not m:
        return None
    n = float(m.group())
    return int(n) if as_int else n


def rarity(value):
    text = (value or "").strip().lower()
    if text in RARITY_WORDS:
        return RARITY_WORDS[text]
    # HTML rarity spans keep the level in a sort key, in one of two forms:
    #   <s class="sortkey">05*</s>   or   <span class="rarity" data-sort-value="05">
    # With per-platform rarities the first one is the Desktop/Console/Mobile value.
    m = re.search(r'class="sortkey"[^>]*>\s*(-?\d+)|class="rarity"[^>]*data-sort-value="(-?\d+)"', value or "")
    if m:
        return int(m.group(1) or m.group(2))
    return number(value)


def coins(value):
    """Coin span -> value in copper coins, from its data-sort-value attribute."""
    m = re.search(r'data-sort-value="(\d+)"', value or "")
    return int(m.group(1)) if m else number(value)


def flag(value):
    return (value or "").strip().lower() in ("1", "yes", "true", "y")


def lower_text(value):
    text = strip_markup(value).lower()
    return text or None


def file_from_wikitext(value):
    """'[[File:X (placed).png|...]]' -> 'X (placed).png'."""
    m = re.search(r"\[\[(?:File|Image):([^|\]]+)", html.unescape(value or ""))
    return m.group(1).strip() if m else None


def image_url(filename):
    if not filename:
        return None
    name = filename.strip().replace("_", " ")
    name = name[:1].upper() + name[1:]  # MediaWiki file names start upper case ("r Terraria.png")
    name = IMAGE_REDIRECTS.get(name, name)
    return IMAGES + quote(name.replace(" ", "_"))


def page_url(page):
    return WIKI + quote(page.replace(" ", "_"))


def norm_value(value):
    """Normalise a type/listcat/tag value for matching (see mapping.toml)."""
    value = html.unescape(value).split("|")[0]
    return re.sub(r"\s+", " ", value).strip().lower()


def norm_name(name):
    return html.unescape(name or "").replace("_", " ").strip().lower()


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=CSV_DELIMITER))


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", html.unescape(text).lower()).strip("-")
