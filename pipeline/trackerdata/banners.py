"""Enemy banners: their number in the game and the kills a banner takes (REQUIREMENTS D25)."""
import html
import re

from .common import log, norm_name, warn

# page_html.json: the rendered section of the wiki's banner page with the other kill counts
KILLS_SECTION = "Banners (enemy)#Banners with non-default kill count"


def kill_counts(section_html):
    """{banner name: kills} of the banners that take another number of kills than the default
    (rows "banner | kill count" of the rendered table)."""
    counts = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", section_html, re.S):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cell))).strip()
                 for cell in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        cells = [c for c in cells if c]
        if len(cells) >= 2 and cells[-1].isdigit():
            counts[norm_name(cells[0])] = int(cells[-1])
    return counts


def apply_banners(items, conf, counts):
    """Every enemy banner gets its number in the game (`bannerId`: the index of the kill
    counters in a world file) and the kills one banner takes (`bannerKills`). The numbers come
    from [banners] ranges: from number `from` on the item id is `item` + (number - from)."""
    banners = {}
    for item in items:
        if item.get("banner"):
            banners.setdefault(item["id"], []).append(item)
    ranges = sorted(conf.get("ranges", []))
    numbered, strays = set(), []
    for n, (start, first_id) in enumerate(ranges):
        # the last range goes on as long as its item ids are banners
        end = ranges[n + 1][0] if n + 1 < len(ranges) else start + len(banners)
        for number in range(start, end):
            found = banners.get(first_id + number - start)
            if not found:
                if n + 1 < len(ranges):
                    strays.append(number)
                    continue
                break
            for item in found:
                item["bannerId"] = number
            numbered.add(first_id + number - start)
    default = conf.get("kills", 50)
    names = set()
    for found in banners.values():
        for item in found:
            names.add(norm_name(item["name"]))
            item["bannerKills"] = counts.get(norm_name(item["name"]), default)
    missing = sorted(i["name"] for iid, found in banners.items() if iid not in numbered for i in found)
    if missing:
        warn(f"enemy banners without a number (add their range to [banners] in mapping.toml): {missing}")
    if strays:
        warn(f"banner numbers that lead to no enemy banner (check [banners] ranges): {strays[:20]}")
    unknown = sorted(name for name in counts if name not in names)
    if unknown:
        warn(f"banners of the wiki's kill count table that are no enemy banners: {unknown}")
    log(f"  banners: {len(numbered)} numbered, {sum(1 for n in names if n in counts)} with another kill count "
        f"than {default}")
