# Terraria Progress Tracker

**▶ Open the tracker: [doeschi.github.io/Terraria-Progress-Tracker](https://doeschi.github.io/Terraria-Progress-Tracker/)**

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
4.0, see [License and credits](#license-and-credits)). Readable copies are in [`pipeline/data_readable/`](pipeline/data_readable),
the unchanged downloads in [`pipeline/raw/`](pipeline/raw).

| File | Contents |
|------|----------|
| `items.json` | All 6,185 items (key = internal name; 45 of them only known from recipes, see below; pickups like Heart and Star are left out) with id, icons, wiki page, stats, rarity, prices, platforms, and – derived – categories and subcategories, how they are obtained, vendors, events, biomes, time of day, the game update that added them and whether they are Expert/Master-only |
| `drops.json` | 488 drop sources (enemies, bosses, treasure bags, chests, crates, grab bags, shaking trees) and 3,688 drops (incl. 305 enemy banners from the NPCs table) with chance and quantity **per game mode** (Classic / Expert / Master) |
| `shops.json` | 817 shop rows of 24 vendors (from the vendor pages): per item the vendor, the wiki's condition text and the parsed conditions, events, biomes and moon phases |
| `conditions.json` | Conditions of shop rows and drops: time of day, moon phases, after a boss, wind, Hardmode, world seeds – with item counts |
| `milestones.json` | Progression milestones (World creation, King Slime, … Moon Lord); `items.json` gives each item its earliest milestone and the reason (e.g. "Crafted – needs Chlorophyte Ore") |
| `sprites.json` + `icons/` | The small wiki icons (about 6,300) packed into 3 sprite sheets, with each icon's sheet and position (`build_icons.py`) |
| `containers.json` | The container sources grouped into Chests, Crates, Other containers and Trees, with item counts |
| `bosses.json` | Bosses by progression stage, each with all drop sources that count for it (parts, treasure bag) |
| `recipes.json` | 3,655 crafting recipes (current versions, platform-limited ones marked), 42 crafting stations with the items that provide them (stronger stations included), 34 "Any …" ingredient groups resolved to items, 287 shimmer transmutations |
| `bestiary.json` | All 546 bestiary entries in the in-game order, with the internal name the world file uses, type, stars, biome / time / event filters, game update and platforms |
| `categories.json`, `subcategories.json`, `obtain.json`, `vendors.json`, `events.json`, `biomes.json`, `times.json` | The groups used above, with names, icons and item counts |
| `missing_items.json` | Items the wiki's Items table lacks, its Recipes table names with id, and that have no template in `[recipe_items]` (currently none) |
| `versions.json`, `rarities.json`, `coins.json`, `difficulties.json`, `platforms.json` | Game updates (with names and a representative item), rarity images, coin values, game-mode and platform icons |

How each file is built is explained in [How the data is built](#how-the-data-is-built).

The web app also contains a small reader for the tile entities of 1.4.5 world files (item frames,
weapon racks, mannequins, hat racks, plates and the new Item Flask) in
[`web/src/workers/tileEntities.ts`](web/src/workers/tileEntities.ts).

## How the data is built

Everything comes from the [Terraria Wiki](https://terraria.wiki.gg/) (wiki.gg). The pipeline has
three steps; only steps 1 and 3 talk to the wiki, step 2 works offline on the downloaded files.

```
step 1  download_cargo_tables.py   wiki -> pipeline/raw/   (tables, page sources, image lists)
step 2  build_tracker_data.py      raw + mapping.toml -> web/public/data/*.json (+ data_readable/)
        check_icons.py (optional)  checks the linked images, notes renamed files for step 2
step 3  build_icons.py             small icons -> web/public/icons/ sprite sheets + sprites.json
```

### 1. Where the information comes from

**Cargo tables – structured data.** The wiki stores the infoboxes of its pages in database
tables ([Cargo](https://www.mediawiki.org/wiki/Extension:Cargo)). Step 1 downloads them
completely through the API (`action=cargoquery`) and saves them unchanged as CSV. They are the
stable base: fields with a fixed meaning, filled by the wiki's templates.

| Table | Fields used | Used for |
|-------|-------------|----------|
| `Items` | `itemid`, `name`, `internalname`, page, image files (item / placed / equipped), `type`, `listcat`, `tag`, `hardmode`, `unobtainable`, `rare`, `buy`, `sell`, `research`, `stack`, `consumable`, `placeable`, `autoswing`, the stats (`damage`, `damagetype`, `critical`, `knockback`, `velocity`, `usetime`, `mana`, `defense`, `bodyslot`, `pick` / `axe` / `hammer`, `toolspeed`, `fishing`, `bait`, `bonus`, `hheal` / `mheal`, `placedwidth` / `placedheight`, `buffs` / `debuffs`), `tooltip` | one entry per item; `type`, `listcat`, `tag`, `hardmode` and `unobtainable` go through `mapping.toml` into categories, obtain methods, vendors, events and flags |
| `Exclusive` | the platform columns per page (desktop, console, mobile, old-gen, 3DS, Japanese) | on which platforms an item exists |
| `History` | patch notes per page (`patch`, `changes`) | the game update that added an item ("Added in") |
| `Equipinfo` | which player values an equippable item changes | accessory subcategories (e.g. movement speed → "Movement"), as `equip:<field>` keys |
| `Drops` | source (`nameraw`, `isfromnpc`, `id`), item, `quantity`, `rate`, `custom` (notes), game modes (`normal` / `expert` / `master`) | `drops.json`: who drops what with which chance per game mode; chests, crates, trees; drop conditions in the chance text and notes; the NPC ids of variant-only drops (e.g. Torch from the Torch Zombie) for the expected drops |
| `NPCs` | `nameraw`, `type`, `environment`, `image`, `npcid`, `bannername` | icons of drop sources; bosses, town NPCs and critters (`type`); where and when an enemy spawns (`environment` → biomes, time of day, events); which enemy gives which banner |
| `Recipes` | `result`, `resultid`, `resultimage`, `amount`, `station`, ingredients, `version`, `legacy` | `recipes.json`, shimmer transmutations, and the 45 items the Items table lacks |

**Page sources – scraped.** Some information exists only in the text of wiki pages, not in a
table. Step 1 saves the source text (wikitext) of these pages, and step 2 reads it with regular
expressions. This depends on how the pages are written and may need adjustments when they
change.

| Page | What is read |
|------|--------------|
| "Alternative crafting ingredients" | the item ids of the "Any …" recipe groups (Any Wood, Any Iron Bar, …) |
| "Bestiary/List" | all bestiary entries in the in-game order, their stars and the bestiary's own filters |
| "MediaWiki:Common.css" | the platform icons (embedded as images in the wiki's style sheet) |
| the 24 vendor pages (Merchant, …; the list is `[vendors]` in `mapping.toml`) | the shops: `{{shop row\|item\|condition}}` with the condition text ("In Hardmode, during night, …") and moon phases |
| "Dye Trader", section "Rewards" | the 33 Strange Plant rewards and the boss each needs |

Also scraped: the rendered HTML of "NPC IDs" (internal NPC names and ids – the keys of the
bestiary in world files) and the image lists of "Rarity", "Coins" and "Difficulty" (their icons).

**Images.** Icons are links to the wiki's image files (`https://terraria.wiki.gg/images/…`),
built from the file names in the tables. `check_icons.py` asks the API about all of them (in
batches of 50) and saves renamed files (redirects) to `raw/image_redirects.json`, so step 2 links
the new names. `build_icons.py` downloads the small ones once and packs them into sprite sheets.

### 2. What step 2 does, in order

1. **Items:** every row of `Items` becomes an item. The values of `type`, `listcat`, `tag`,
   `hardmode` and `unobtainable` become keys like `type:weapon`, `listcat:broadswords`,
   `tag:vendor:witch doctor`, which `mapping.toml` turns into categories, subcategories, obtain
   methods, vendors, events and flags (see below). Platforms come from `Exclusive`, the game
   update from `History`. This runs twice: after the first pass the drops are known, and rules
   can use them (`drop:npc`, `drop:boss`, `npc:critter`).
2. **Items only in recipes:** results of `Recipes` whose id is missing from `Items` (1.4.5 doors,
   candelabras, …) are added with the categories of a similar item (`[recipe_items]`).
3. **Game update by item id:** ids grow with every update; items on shared pages (e.g.
   "Chairs") whose id belongs to a later update are moved to it.
4. **Drops:** the rows of `Drops` are matched to items by name (also without "(item)", by wiki
   page, and "… furniture" sets) and sorted into enemies, treasure bags and containers, with chance
   and quantity per game mode. Conditions in the chance text or notes are read (`[conditions]`).
5. **Events, biomes, time of day:** from the spawn `environment` of the enemies (`NPCs`) and the
   drop conditions; an item is "event only" if every source is bound to an event.
6. **Shops and conditions:** the vendor pages give the shop rows; their condition texts become
   conditions (night, moon phase, after a boss, wind, Hardmode, world seeds), events and biomes.
   The Dye Trader's rewards get their own obtain method.
   "Obtained by" is completed from our own data: drop sources, shimmer transmutations, critters
   and music boxes; items without any method go under "Other".
7. **Group files:** `categories.json`, `obtain.json`, … with names, icons and item counts, and
   platforms, game updates, rarities, coins and difficulties.
8. **Drops, bosses, containers, shops, conditions** are written; `[bosses]` defines which drop
   sources count for which boss.
9. **Recipes:** stations are linked to the items that provide them, "Any …" groups to their
   items; shimmer transmutations are kept apart.
10. **Milestones:** the earliest point of a playthrough from which each item can be obtained,
    from all of the above (`[milestones]`).
11. **Bestiary:** the entries of "Bestiary/List", matched to NPC ids and internal names ("NPC
    IDs") and to the `NPCs` table.
12. Everything is written minified to `web/public/data/` and indented to `pipeline/data_readable/`.
    Raw values the mapping does not know yet are listed in the output.

### 3. The mapping file (`pipeline/mapping.toml`)

`mapping.toml` holds every decision that is not in the wiki data itself: how raw values become
the tracker's groups, plus knowledge the wiki does not store in a usable form. Step 2 reads it on
every run – editing it and running step 2 again is enough.

**How matching works.** Every raw value of the fields in `[settings] match_fields` becomes a key
`<field>:<value>` in lower case (`type:weapon`, `listcat:broadswords`, `tag:vendor:witch doctor`,
`hardmode:1`). The build adds more keys: `equip:<field>` (Equipinfo), `page:<wiki page>`,
`npc:critter`, `drop:npc`, `drop:boss`. An entry's `match` list says which keys put an item into
it (`*` is a wildcard). Example: the Starfury has `type: weapon^crafting material`,
`listcat: broadswords^…^loot items` and `tag: loot^bag loot`, so it ends up in
`[categories.weapon]` (`type:weapon`), `[subcategories.broadsword]` (`listcat:broadswords`),
`[obtain.loot]` (`tag:loot`) and `[obtain.bag]` (`tag:bag loot`).

| Section | What it does |
|---------|--------------|
| `[settings]` | which Items fields become keys |
| `[categories.*]`, `[subcategories.*]` | the "Categories" filter: name, icon and `match` keys. Subcategories have a `parent`; they can be a `fallback` ("Other …"), be limited to items of some categories (`with_categories`, `without_categories`, `only_in_parent`), or be removed again by `exclude` keys |
| `[obtain.*]` | the "Obtained by" filter (crafted, bought, dropped, chests, fishing, quest rewards, caught, recorded, shimmer, other, …); `page` / `section` / `replaces` fill an entry from a page section (the Strange Plant rewards); `from_drops` / `from_containers` / `from_shimmer` / `names` add items from our own data; the `fallback` entry ("Other") takes items without any method |
| `[vendors.*]` | the "Sold by" filter: the vendor's tag, icon, wiki page (for the shop) and `milestone` (when the vendor moves in) |
| `[events.*]` | the "Events" filter: `environments` (spawn conditions of the event's enemies), `drop_conditions` (words in a drop's chance), `links` / `phrases` (in the condition texts of shops and drops) |
| `[biomes.*]`, `[times.*]` | where and when enemies spawn (`environments`, `alone`), plus `links` / `phrases` for condition texts |
| `[conditions]` | the "Conditions" filter: the condition groups (time of day, moon phase, after a boss, weather; world seeds and progress are only shown), each condition with the wiki links and text patterns that mean it; `ignore_links` for links that are no condition |
| `[milestones.*]`, `[milestone_conditions]`, `[container_milestones]`, `[milestone_sources]`, `[milestone_items]` | the "Progression" filter: the milestones in order with their bosses and events, and the exceptions the data cannot tell (late Dungeon enemies, locked chests, mining Hellstone and Chlorophyte, …) |
| `[flags]` | yes/no fields of an item: `hardmode`, `hardmodeOnly`, `unobtainable`, `banner`, `questFish` |
| `[drops]` | which source kinds are used; `boss_ignore_items` (coins and potions do not count for a boss) |
| `[containers.*]`, `[container_icons]` | the "Found in" groups (chests, crates, other, trees) and icons for sources that are no item (trees → their wood) |
| `[unobtainable]` | items the wiki marks unobtainable that are obtainable after all |
| `[recipes]`, `[recipe_groups]`, `[stations]` | stations that need no item (water, lava, "By Hand"), "Any …" groups the wiki page lacks, and which items provide a station (a Mythril Anvil also counts as an Iron Anvil) |
| `[recipe_items]` | template items for the items only known from recipes ("* Door" → Ash Wood Door) |
| `[bestiary]` | entry types (town, critter, enemy, boss) and the bestiary's own filters → our biomes, times and events |
| `[boss_stages]`, `[bosses.*]` | the "Bosses" filter: stages, map icons and the drop sources that count for each boss (the boss, its parts, its treasure bag) |
| `[versions.*]` | names and icon items of the game updates ("1.4.4 · Labor of Love") |
| `[ignore]` | raw keys dropped on purpose (duplicates, not useful), so they are not reported as unmapped |
| `[manual]` | item name patterns → groups, for what the wiki does not tag (items without `type`, the developer wings, music boxes, …) |

### 4. What is derived rather than copied

- **Game update of an item** from the patch-note history (Desktop patches), corrected for items
  on shared pages by item id ranges – known for 6,177 of 6,185 items.
- **Items missing from the wiki's Items table** (45 new 1.4.5 doors, candelabras and a few
  others) from its Recipes table, with categories taken from a similar item.
- **Events, biomes and time of day of an item** from the spawn conditions of the enemies that
  drop it (enemy banners included) and from the conditions of drops and shops: 361 items are only
  obtainable during events, 532 have a biome.
- **Conditions** (night, moon phase, after a boss, wind) for the 166 items that can only be
  obtained under them, from the shop texts of the vendor pages and the drop notes.
- **Expert/Master-only items** from their rarity, unless they can also be crafted, bought, found
  or fished.
- **Crafting stations** linked to the items that provide them, and the "Any …" groups to their
  items.
- **Earliest milestone of every item** from its drops, shops, recipes (repeated until stable) and
  containers, plus a few rules for mining.
- **Bestiary entries** matched to NPC ids and internal names (the keys of the bestiary in world
  files), with the game update from the NPC id history.
- **Platform icons** extracted from the wiki's CSS.

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

How wiki values become the tracker's groups is defined in
[`pipeline/mapping.toml`](pipeline/mapping.toml) (see [The mapping file](#3-the-mapping-file-pipelinemappingtoml)).
Step 2 reports values that are not mapped yet. Its code is split by topic in
[`pipeline/trackerdata/`](pipeline/trackerdata) (items, drops, recipes, conditions, milestones,
bestiary, icons); `build_tracker_data.py` is the entry point.

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
