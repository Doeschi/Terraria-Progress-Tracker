"""Icons taken from wiki pages: rarities, coins, difficulties (page images) and platforms (CSS)."""
import json
import re
from collections import Counter

from .common import (
    COINS,
    DIFFICULTIES,
    PLATFORM_FIELDS,
    PLATFORM_ICON_COMMENTS,
    RARITY_ICONS,
    coins,
    image_url,
    log,
)


def icon_files(raw_dir, items):
    """rarities.json, coins.json and difficulties.json, with icons taken from the
    image lists of the wiki pages "Rarity", "Coins" and "Difficulty"
    (raw/page_images.json from step 1)."""
    path = raw_dir / "page_images.json"
    pages = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    if not pages:
        log("  warning: raw/page_images.json missing - rarity and coin icons left out")

    def find(page, *candidates):
        files = set(pages.get(page, []))
        for c in candidates:
            for ext in ("png", "gif"):
                name = f"{c}.{ext}"
                if name in files:
                    return image_url(name)
        if pages:
            log(f"  warning: no icon for {candidates[0]} on page {page}")
        return None

    counts = Counter(i.get("rarity") for i in items)
    rarities = [{"id": level, "name": name, "count": counts[level],
                 "icon": find("Rarity", f"Rarity_color_{suffix}_big", f"Rarity_color_{suffix}")}
                for level, (name, suffix) in sorted(RARITY_ICONS.items())]
    coins = [{"id": cid, "name": f"{name} Coin", "value": value,
              "icon": find("Coins", f"{name}_Coin")}
             for cid, (name, value) in COINS.items()]
    # "<Name>_mode_icon.png" only redirects to "<Name>_Mode.png" (direct /images/ URLs
    # do not follow file redirects), so the real file is tried first
    difficulties = [{"id": did, "name": name,
                     "icon": find("Difficulty", f"{name}_Mode", f"{name}_mode_icon")}
                    for did, name in DIFFICULTIES.items()]
    return rarities, coins, difficulties


def platform_icons(css):
    """Platform id -> icon (data URI) from the wiki's CSS for {{eicons}}: each icon
    is a block with a comment naming the version and a base64 background image."""
    icons = {}
    for comment, url in re.findall(r"\{\s*/\*\s*([^*]+?)\s*\*/[^}]*?url\((data:image/[^)]+)\)", css):
        for pid, words in PLATFORM_ICON_COMMENTS.items():
            if comment.strip().lower() == words:
                icons[pid] = url
    missing = [p for p in PLATFORM_FIELDS if p not in icons]
    if missing:
        log(f"  warning: no platform icon for {missing} in MediaWiki:Common.css")
    return icons
