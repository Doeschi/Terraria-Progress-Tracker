# Terraria Progress Tracker

Track which Terraria items and bestiary entries you have collected, per playthrough, platform,
difficulty and game version – with filters and progress for categories, sources, bosses, events,
biomes and crafting, recipes and drops per item, and sync with your world file (chests and
bestiary). Runs entirely in the browser: progress is stored in a JSON file on your computer, world
files are read locally, and nothing is uploaded. See [REQUIREMENTS.md](REQUIREMENTS.md) for the
full feature list.

## Layout

| Folder                   | Contents                                                                     |
|--------------------------|------------------------------------------------------------------------------|
| `pipeline/`              | Python scripts that turn the Terraria Wiki's Cargo tables into JSON          |
| `pipeline/raw/`          | The downloaded wiki data, unchanged (Cargo tables as CSV, page sources)      |
| `pipeline/data_readable/`| The generated data, indented for reading (same content as `web/public/data`) |
| `web/`                   | The web app (Vite, React, TypeScript, Tailwind, shadcn/ui)                   |
| `web/public/data/`       | The generated data the app loads (minified JSON)                             |
| `web/public/icons/`      | Sprite sheets of the small wiki icons (`build_icons.py`)                      |

## Data for other projects

Building the tracker meant mining and cross-referencing a lot of wiki data. The results are plain
JSON and may be useful for other Terraria tools – feel free to use them (the data is CC BY-NC-SA
4.0, see [Credits](#credits)). Readable copies are in [`pipeline/data_readable/`](pipeline/data_readable),
the unchanged downloads in [`pipeline/raw/`](pipeline/raw).

| File | Contents |
|------|----------|
| `items.json` | All 6,194 items (key = internal name; 45 of them only known from recipes, see below) with id, icons, wiki page, stats, rarity, prices, platforms, and – derived – categories and subcategories, how they are obtained, vendors, events, biomes, time of day, the game update that added them and whether they are Expert/Master-only |
| `drops.json` | 419 drop sources (enemies, bosses, treasure bags, chests, crates, grab bags, shaking trees) and 3,404 drops with chance and quantity **per game mode** (Classic / Expert / Master) |
| `shops.json` | 817 shop rows of 24 vendors (from the vendor pages): per item the vendor, the wiki's condition text and the parsed conditions, events, biomes and moon phases |
| `conditions.json` | Conditions of shop rows and drops: time of day, moon phases, after a boss, wind, Hardmode, world seeds – with item counts |
| `milestones.json` | Progression milestones (Start, King Slime, … Moon Lord); `items.json` gives each item its earliest milestone and the reason (e.g. "crafted – needs Chlorophyte Ore") |
| `sprites.json` + `icons/` | The small wiki icons (about 6,300) packed into 3 sprite sheets, with each icon's sheet and position (`build_icons.py`) |
| `containers.json` | The container sources grouped into Chests, Crates, Other containers and Trees, with item counts |
| `bosses.json` | Bosses by progression stage, each with all drop sources that count for it (parts, treasure bag) |
| `recipes.json` | 3,610 crafting recipes (current versions, platform-limited ones marked), 42 crafting stations with the items that provide them (stronger stations included), 34 "Any …" ingredient groups resolved to items, 286 shimmer transmutations |
| `bestiary.json` | All 546 bestiary entries in the in-game order, with the internal name the world file uses, type, stars, biome / time / event filters, game update and platforms |
| `categories.json`, `subcategories.json`, `obtain.json`, `vendors.json`, `events.json`, `biomes.json`, `times.json` | The groups used above, with names, icons and item counts |
| `missing_items.json` | Items the wiki's Items table lacks, its Recipes table names with id, and that have no template in `[recipe_items]` (currently none) |
| `versions.json`, `rarities.json`, `coins.json`, `difficulties.json`, `platforms.json` | Game updates (with names and a representative item), rarity images, coin values, game-mode and platform icons |

What is derived rather than copied (see [`pipeline/trackerdata/`](pipeline/trackerdata) and
[`pipeline/mapping.toml`](pipeline/mapping.toml)):

- **Game update of an item** from the wiki's patch-note history (Desktop patches), corrected for
  items on shared pages by item id ranges – known for 6,186 of 6,194 items.
- **Items missing from the wiki's Items table** (45 new 1.4.5 doors, candelabras and a few
  others) from its Recipes table, with categories taken from a similar item.
- **Event and biome of an item** from the spawn conditions of the enemies that drop it: 201 items
  are only obtainable during events, 299 have a biome.
- **Expert/Master-only items** from their rarity, unless they can also be crafted, bought, found
  or fished.
- **Crafting stations** mapped to the items that provide them, and the wiki's "Any …" groups to
  their items (from the item ids on "Alternative crafting ingredients").
- **Bestiary entries** matched to NPC ids and internal names (the keys of the bestiary in world
  files), with the game update from the NPC id history.
- **Platform icons** extracted from the wiki's CSS.
- **Earliest milestone of an item** from its drops (bosses, events, Dungeon / Temple enemies),
  shops (when the vendor moves in, "after <boss>" conditions), recipes (latest ingredient or
  station, repeated until stable), containers and a few rules for mining – see `[milestones]`
  in `mapping.toml`.

The web app also contains a small reader for the tile entities of 1.4.5 world files (item frames,
weapon racks, mannequins, hat racks, plates and the new Item Flask) in
[`web/src/workers/tileEntities.ts`](web/src/workers/tileEntities.ts).

## Updating the item data

Requires Python 3.11+ and `pip install requests pillow`.

```bash
python pipeline/download_cargo_tables.py   # step 1: wiki -> pipeline/raw/ (Cargo tables, page images/sources)
python pipeline/build_tracker_data.py      # step 2: raw + mapping.toml -> web/public/data/*.json
python pipeline/check_icons.py             # optional: check that all linked wiki images exist
python pipeline/build_icons.py             # step 3: small icons -> sprite sheets in web/public/icons/
```

`check_icons.py` asks the wiki's API about all linked images in batches of 50 (about 180
requests, no image downloads). It reports missing files and saves files that are only redirects
– their direct link does not work – to `pipeline/raw/image_redirects.json`; run step 2 again and
the targets are linked instead.

`build_icons.py` packs the small icons (PNG up to 128 × 64 px; about 6,300) into a few sprite sheets
that are served with the app, so it does not load thousands of single images from the wiki. The
files are downloaded once into `pipeline/icons_cache/` (not committed); later runs only fetch
new ones (`--refresh` revalidates all). Larger images and animated GIFs stay links to the wiki.

wiki.gg asks scripts for a contact in their User-Agent: pass `--contact`, set `WIKI_CONTACT`, or
put it in `pipeline/contact.txt` (not committed); otherwise the project URL is sent.

Step 2 also writes the indented copies to `pipeline/data_readable/` (skip with `--no-readable`).

How wiki values become categories, subcategories, obtain methods, vendors, events, biomes, crafting
stations, bestiary filters and update names is defined in
[`pipeline/mapping.toml`](pipeline/mapping.toml). Step 2 reports values that are not mapped yet.
Its code is split by topic in [`pipeline/trackerdata/`](pipeline/trackerdata) (items, drops,
recipes, bestiary, icons); `build_tracker_data.py` is the entry point.

## Running the app

```bash
cd web
npm install
npm run dev
```

`npm run build` writes the static site to `web/dist`; `npm run lint` and `npm run format` keep the
code clean (see [`web/README.md`](web/README.md) for the code layout). Pushing to `main` deploys
it to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (enable
Pages with source "GitHub Actions" in the repository settings).

## License and credits

The code is licensed under the [MIT License](LICENSE).

Item data and icons come from the [Terraria Wiki](https://terraria.wiki.gg/) and are licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); this applies to
`pipeline/raw/`, `pipeline/data_readable/`, `web/public/data/` and the icon sprite sheets in
`web/public/icons/` as well. World files are parsed
with [terraria-world-file](https://github.com/cokolele/terraria-world-file-ts). Terraria is a
trademark of Re-Logic; this is an unofficial fan project. The app was built with the help of AI
(Claude by Anthropic).
