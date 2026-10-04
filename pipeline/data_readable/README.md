# The tracker data (`data_readable/`)

These files are what the web app works with. They are **generated** – step 2 of the pipeline
(`build_tracker_data.py`) writes them from the downloaded wiki data in `../raw/` and the rules in
`../mapping.toml`; step 3 (`build_icons.py`) adds `sprites.json` and the icon sheets. Do not edit
them by hand: the next build overwrites them (this README is kept).

The app loads the same files, minified, from `web/public/data/` (and the sheets from
`web/public/icons/`). These indented copies only exist to read them and to see changes in diffs.

Data and images come from the [Terraria Wiki](https://terraria.wiki.gg/) (CC BY-NC-SA 4.0).

## Contents

- [Conventions](#conventions)
- [Files](#files) – an overview of all files
- [`items.json`](#itemsjson)
- [List files](#list-files) – categories, vendors, events, biomes, times, milestones, platforms, difficulties
- [`subcategories.json`](#subcategoriesjson) · [`obtain.json`](#obtainjson) · [`versions.json`](#versionsjson) · [`rarities.json`](#raritiesjson) · [`coins.json`](#coinsjson)
- [`shops.json`](#shopsjson)
- [`drops.json`](#dropsjson)
- [`bosses.json`](#bossesjson) · [`containers.json`](#containersjson) · [`conditions.json`](#conditionsjson)
- [`recipes.json`](#recipesjson)
- [`extractinator.json`](#extractinatorjson)
- [`sets.json`](#setsjson)
- [`meta.json`](#metajson)
- [`bestiary.json`](#bestiaryjson)
- [`missing_items.json`](#missing_itemsjson)
- [`sprites.json`](#spritesjson)

## Conventions

- **ids** are lower-case slugs of a name (`"eye-of-cthulhu"`, `"crafting-material"`), unique
  within their file. Other files refer to entries by these ids.
- **Item keys** are the game's internal item names (`"CopperShortsword"`). They are the stable
  key of an item everywhere – also in progress files (checked / ignored items).
- **`icon`** is a URL of a wiki image (`https://terraria.wiki.gg/images/…`), or a `data:` URL for
  the platform icons. The app loads them from sprite sheets (see `sprites.json`).
- **`count`** in a list file (categories, biomes, …) is the number of items (bestiary entries in
  `bestiary.json`) in that entry, over all platforms and difficulties. The app counts again for a
  playthrough; the build uses it for reports and sorting.
- Fields that would be empty, `false` or `null` are often **left out**, e.g. an item without
  damage has no `damage` field.
- Platform ids: `desktop` (PC), `console`, `mobile`, `oldgen` (old-gen console), `3ds`,
  `japanese` (Japanese console). Difficulty / game mode ids: `classic`, `expert`, `master`,
  `journey`; drop chances use the modes `normal`, `expert`, `master`.

## Files

| File | Content |
|---|---|
| [`items.json`](#itemsjson) | every item with its groups, availability, stats and milestone |
| [`categories.json`](#list-files) / [`subcategories.json`](#subcategoriesjson) | the "Categories" filter |
| [`obtain.json`](#obtainjson) | the "Obtained by" filter (how an item is obtained) |
| [`vendors.json`](#list-files) | NPCs that sell items ("Sold by") |
| [`shops.json`](#shopsjson) | the shop rows of the vendors, with their conditions |
| [`drops.json`](#dropsjson) | drop sources (enemies, bags, containers) and every drop |
| [`bosses.json`](#bossesjson) | bosses by stage, with the drop sources that count for them |
| [`containers.json`](#containersjson) | container groups of the "Found in" filter |
| [`events.json`](#list-files) / [`biomes.json`](#list-files) / [`times.json`](#list-files) | events, biomes, time of day |
| [`conditions.json`](#conditionsjson) | conditions of drops and shop rows (moon phases, after a boss, …) |
| [`milestones.json`](#list-files) | the "Progression" milestones, in playthrough order |
| [`versions.json`](#versionsjson) | game updates ("Added in") |
| [`rarities.json`](#raritiesjson) | rarity tiers |
| [`platforms.json`](#list-files) / [`difficulties.json`](#list-files) / [`coins.json`](#coinsjson) | platforms, difficulties, coin values |
| [`recipes.json`](#recipesjson) | crafting recipes, stations, ingredient groups, shimmer |
| [`extractinator.json`](#extractinatorjson) | what the Extractinator and the Chlorophyte Extractinator give |
| [`sets.json`](#setsjson) | armor and vanity sets |
| [`meta.json`](#metajson) | data version and the change log of data updates |
| [`bestiary.json`](#bestiaryjson) | the bestiary entries and their types |
| [`missing_items.json`](#missing_itemsjson) | item ids known only from recipes |
| [`sprites.json`](#spritesjson) | where each icon is in the sprite sheets (`icons/`) |

---

## `items.json`

A list of all items (one entry per item id), sorted by id.

**Identity and links**

| Field | Meaning |
|---|---|
| `key` | internal name, the item's unique key (`"CopperShortsword"`) |
| `id` | the game's item id |
| `name` | display name |
| `internalName` | internal name as the wiki gives it (missing for a few items) |
| `page` | the wiki page the item is on (shared pages: `"Chairs"`, `"Pirate set"`, …) |
| `url` | link to that page |
| `icon` | the item's image |
| `tooltip` | in-game tooltip text |

**Groups** – ids into the list files; an item can be in several of each.

| Field | Meaning |
|---|---|
| `categories` | `categories.json` ids (Weapons, Vanity, Furniture, …) |
| `subcategories` | `subcategories.json` ids (Broadswords, Head, Chairs, …) |
| `obtain` | `obtain.json` ids: how it is obtained (Crafted, Dropped by enemies, …) |
| `set` | `sets.json` id of the armor or vanity set it belongs to |
| `vendors` | `vendors.json` ids: NPCs that sell it (not counting rows only in special world seeds) |
| `events` | `events.json` ids: events in which it can be obtained (enemies, drops, shop rows) |
| `biomes` | `biomes.json` ids: biomes of the enemies that drop it, and of its shop rows |
| `times` | `times.json` ids (`day` / `night`): only dropped by enemies that spawn then |
| `conditions` | `conditions.json` ids it can **only** be obtained under (e.g. Leaf Wings: night, after Plantera) |

**Availability**

| Field | Meaning |
|---|---|
| `platforms` | platform ids the item exists on |
| `platformsKnown` | `true` if the wiki lists the platforms; `false` = assumed on all platforms |
| `introduced` | the Desktop patch that added it (`"1.4.0.1"`) |
| `version` | the game update it belongs to (`versions.json` id, e.g. `"1.4.0"`) |
| `minDifficulty` | `"expert"` / `"master"`: only obtainable from this difficulty on |
| `hardmode` | a Hardmode item (the wiki says so; `[hardmode] pre_hardmode` in `mapping.toml` corrects it) |
| `hardmodeOnly` | only exists in Hardmode (wiki tag "hardmode only") |
| `unobtainable` | cannot be obtained in the game (ignored by default in new playthroughs) |
| `eventOnly` | only obtainable during events |
| `milestone` | the earliest milestone it can be obtained at (`milestones.json` id) |
| `milestoneVia` | why, e.g. `"Crafted – needs Chlorophyte Ore"`, `"Dropped by Plantera"` |
| `recipeOnly` | not in the wiki's item table, built from its recipe (no stats, rarity, prices) |

**Kind**

| Field | Meaning |
|---|---|
| `banner` | an enemy banner |
| `questFish` | an Angler quest fish |
| `consumable` | used up when used |
| `placeable` | can be placed in the world |
| `placedWidth` / `placedHeight` | size when placed, in tiles |
| `autoswing` | auto-reuse |
| `bodySlot` | armor slot: `helmet` / `shirt` / `pants`, vanity: `social helmet` / `social shirt` / `social pants` |

**Economy**

| Field | Meaning |
|---|---|
| `rarity` | rarity tier (`rarities.json` id) |
| `buy` | price at a vendor, in copper coins (100 copper = 1 silver, see `coins.json`) |
| `sell` | sell value, in copper coins |
| `research` | how many are needed to research it in Journey mode |
| `stack` | maximum stack size |

**Stats** – as the wiki lists them.

| Field | Meaning |
|---|---|
| `damage` / `damageType` | damage and its class (`melee`, `ranged`, `magic`, `summon`, …) |
| `critical` | critical strike chance, % |
| `knockback` | knockback |
| `velocity` | projectile speed |
| `useTime` | use time in ticks (60 = one second) |
| `mana` | mana cost |
| `defense` | defense |
| `pickaxePower` / `axePower` / `hammerPower` | tool power |
| `toolSpeed` | tool use speed (ticks) |
| `fishingPower` / `baitPower` | fishing power / bait power, % |
| `rangeBonus` | extra (or less) tile reach |
| `healLife` / `healMana` | health / mana restored |
| `buff` / `debuff` | buff given / debuff inflicted (name) |

---

## List files

`categories.json`, `vendors.json`, `events.json`, `biomes.json`, `times.json`,
`milestones.json`, `platforms.json` and `difficulties.json` are lists of the same shape:

| Field | Meaning |
|---|---|
| `id` | the id items refer to |
| `name` | display name |
| `icon` | image (an item, NPC, map icon, …) |
| `head` | `vendors.json` only: the NPC's head as on the map (`Map Icon Merchant.png`), shown in the filters and the table; `icon` (full body) in the detail panel |
| `count` | items in it (not in `difficulties.json`) |

The order is the order shown in the app; `milestones.json` is in playthrough order (World
creation → … → Moon Lord), and its `count` is the number of items with that milestone.

## `subcategories.json`

Like the list files, plus:

| Field | Meaning |
|---|---|
| `parent` | the `categories.json` id it belongs to |
| `fallback` | `true` for the "Other …" entry of a category: its items that fit no other subcategory |

## `obtain.json`

Like the list files, plus `fallback`: `true` for "Other" – items with no other obtain method, and
`parent`: a sub-option ("Extractinator" and "Chlorophyte Extractinator" under "Extractinators");
items list the parent and their sub-options.

## `versions.json`

Like the list files: `id` is the update (`"1.4.4"`), `name` with its title (`"1.4.4 · Labor of
Love"`), `icon` the item that stands for it, `count` the items it added.

## `rarities.json`

Like the list files, but `id` is the rarity number of the game (`-1` Gray, `0` White … `11`
Purple, `-11` Quest, `-12` Expert, `-13` Master); `icon` is the wiki's coloured name image.

## `coins.json`

| Field | Meaning |
|---|---|
| `id` / `name` / `icon` | the coin |
| `value` | its value in copper coins (Platinum 1,000,000, Gold 10,000, Silver 100, Copper 1) |

## `shops.json`

An object: item key → list of **shop rows** (from the vendor pages of the wiki). Items sold
without any condition by a vendor have a row with only `vendor`.

| Field | Meaning |
|---|---|
| `vendor` | `vendors.json` id |
| `text` | the wiki's condition text, e.g. `"In Hardmode, during night, in a Jungle."` |
| `conditions` | `conditions.json` ids found in the text (incl. world seeds and moon phases) |
| `events` / `biomes` | event / biome ids found in the text |
| `moons` | moon phases, `1` (full moon) to `8` |

A row whose conditions include a world seed (`seed-…`) only exists in special world seeds: it
is shown in the item details, but counts for no filter.

## `drops.json`

| Field | Meaning |
|---|---|
| `sources` | object: source id → drop source |
| `items` | object: item key → list of drops of that item |
| `groups` | object: group id → drop group (items of a source that drop together) |
| `areas` | the layers of containers with other items per layer, in order (`"Underground"`, `"Cavern"`, `"Cavern (lava layer)"`; `[drop_areas]` in `mapping.toml`) |

**Drop source** (`sources`)

| Field | Meaning |
|---|---|
| `id` / `name` | the source |
| `kind` | `npc` (enemy, boss, critter, town NPC), `bag` (treasure bag) or `container` (chest, crate, tree, …) |
| `url` | its wiki page |
| `icon` | its image |
| `npcId` | the game's NPC id (enemies) |
| `group` | containers: their `containers.json` id |
| `biomes` / `events` / `times` | where / during what / when the enemy spawns |
| `platforms` | only for sources the wiki marks as exclusive to some versions (e.g. the old-gen Shadow Hammer): the platform ids |

**Drop** (`items`)

| Field | Meaning |
|---|---|
| `source` | the drop source id |
| `rate` | the chance as the wiki shows it, e.g. `"1% · Expert: 1.99%"` |
| `chance` | the chance in % per game mode, e.g. `{"normal": 1, "expert": 1.99}` |
| `quantity` | the amount as the wiki shows it, e.g. `"1–3 · Expert: 2–6"` |
| `quantities` | the amount per game mode, e.g. `{"normal": "1–3"}` |
| `modes` | the game modes the drop exists in (`normal`, `expert`, `master`) |
| `conditions` / `events` / `biomes` | what the drop is bound to (e.g. `seed-remix`, `blood-moon`) |
| `note` | extra text, e.g. `"if wind speed ≥ 20 mph"`, `"In I am error worlds"` |
| `npcIds` | only these variants of the source drop it (NPC ids), e.g. the Torch Zombie |
| `variants` | the variants of the source the drop is for, as the wiki names them (`"Pre-Hardmode variant"`, `"Dark Lamia"`), or a container's layer (`"Underground"`, one of `areas`); missing = every variant / layer |
| `group` | the drop group it is in (`groups` id), e.g. `"plantera-1"`; or the group per game mode (`{"normal": "angry-bones-1", "expert": "angry-bones-2"}`) when the wiki lists the treasure bag's / Expert group apart |

**Drop group** (`groups`) – from the drop lists of the wiki pages, not the Drops table

| Field | Meaning |
|---|---|
| `text` | the wiki's text, e.g. `"One of the following 8 items will always be dropped"`, `"Only in Corrupt worlds"` |
| `amount` | the amount of the item that is dropped (groups without text), e.g. `"1–3"` |
| `chance` | the chance of the group (groups without text), e.g. `"1/12"`: with this chance, one of its items |
| `pick` | how many of its items drop (`1`, `2`); missing = a condition, all of them can drop |
| `size` | its number of items (an item dropped with another, like Rockets with the Grenade Launcher, counts once) |

## `bosses.json`

| Field | Meaning |
|---|---|
| `stages` | the boss groups: `pre-hardmode`, `hardmode`, `event` (`id`, `name`, `icon`) |
| `bosses` | the bosses: `id`, `name`, `stage`, `icon` (map icon), `count` (items), `sources` – the drop sources that count for the boss (the boss, its parts, its treasure bag) |
| `ignoreItems` | item keys that do not count as boss drops (coins, potions, hearts – every boss drops them) |

## `containers.json`

The groups of the "Found in" filter:

| Field | Meaning |
|---|---|
| `id` / `name` / `icon` | the group (Chests, Crates, Trees, Other) |
| `sources` | the container source ids in it (`drops.json` sources of kind `container`) |
| `count` | items found in them |

## `conditions.json`

| Field | Meaning |
|---|---|
| `groups` | condition groups: `id`, `name`, `filter` (`true` = shown in the "Conditions" filter) – time of day, moon phase, after a boss, weather; progress, world seed and special are only shown |
| `conditions` | the conditions: `id` (e.g. `night`, `moon-1`, `after-plantera`, `seed-remix`), `name`, `group`, `icon` (moon phases), `count` (items) |

## `recipes.json`

| Field | Meaning |
|---|---|
| `recipes` | list of recipes: `result` (item key), `amount`, `stations` (all needed, e.g. `["Work Bench", "Ecto Mist"]`), `ingredients` (`item` – an item key or an "Any …" group name – and `amount`), `platforms` (only on these; missing = all) |
| `stations` | object: station name → `items` (item keys that provide it, stronger ones included), `icon`; or `condition: true` for something that needs no item (By Hand, Water, Lava, Honey, Snow Biome, Ecto Mist, Demon Altar) |
| `groups` | object: "Any …" ingredient group (`"Any Wood"`) → `items` (item keys), `icon` |
| `shimmer` | shimmer transmutations: `item` (item key) or `group` (an "Any …" group, e.g. `"Any Fruit"`) → `result` (item key), `amount` |

## `extractinator.json`

From the tables of the wiki pages "Extractinator" and "Chlorophyte Extractinator".

| Field | Meaning |
|---|---|
| `machines` | `id` (`extractinator`, `chlorophyte-extractinator`), `name`, `item` (its item key) |
| `results` | what they give, see below |

**Result** (`results`)

| Field | Meaning |
|---|---|
| `machine` | the machine id |
| `item` | the item key of the result |
| `inputs` | item keys that give it (any of them), e.g. Silt Block and Slush Block |
| `input` | the wiki's name of the input(s), e.g. `"Silt Block / Slush Block"`, `"Glowing Moss"` |
| `chance` / `quantity` | e.g. `"0.3333%"` / `"1–16"`; no chance for conversions |
| `phase` | `prehardmode` / `hardmode`: only in such worlds (the Chlorophyte Extractinator's ores) |
| `conversion` | `true`: the input always becomes this item (Copper Ore → Tin Ore, Hive → Honey Block) |

## `sets.json`

Armor and vanity sets: the items of a wiki page whose name ends in "armor" or "set", at least 2
(`[sets]` in `mapping.toml` adds or excludes pages). A list of:

| Field | Meaning |
|---|---|
| `id` / `name` | the set, named like its wiki page (`"Pirate set"`, `"Hallowed armor"`) |
| `url` | its wiki page |
| `kind` | `armor` (most pieces are armor) or `vanity` (developer sets too) |
| `items` | the item keys of its pieces |

## `meta.json`

| Field | Meaning |
|---|---|
| `dataVersion` | the day the wiki data was downloaded (step 1, `raw/download_info.json`), e.g. `"2026-09-28"` |
| `gameVersion` | the newest game version in the data, e.g. `"1.4.5"` |
| `updates` | the change log, oldest first: per data version the items `added` (keys), `removed` (`key`, `name`) and `renamed` (old key → new key). Written by `compare_data.py`; the app uses it to move the checkmarks of renamed items in progress files along and to show what changed |

## `bestiary.json`

| Field | Meaning |
|---|---|
| `types` | entry types: `town`, `critter`, `enemy`, `boss` (`id`, `name`, `icon`, `count`) |
| `entries` | the entries, in the in-game order |

**Entry**

| Field | Meaning |
|---|---|
| `id` | internal NPC name – also the key in the world file's bestiary |
| `n` | number in the in-game bestiary |
| `name` / `page` / `url` / `icon` | name, wiki page and image |
| `type` | entry type id |
| `stars` | rarity stars in the bestiary |
| `npcId` | the game's NPC id |
| `biomes` / `times` / `events` | where / when / during what it appears |
| `version` | the update that added it (`versions.json` id) |
| `platforms` | platform ids it exists on |

## `missing_items.json`

Item ids that appear in the wiki's recipes but not in its item table (a list, usually empty):
`id`, `name`, `icon` – so a world file containing them can still name them.

## `sprites.json`

Written by `build_icons.py`: the images the app shows are packed into sprite sheets, so the app
does not load thousands of single images. Animated GIFs are their first frame; large images are
scaled down (enemies, bosses and critters to at most 64 × 64 px, in sheets of their own).

| Field | Meaning |
|---|---|
| `sheets` | the sheet images: `file` (path, with a content hash), `w`, `h` (pixels) |
| `icons` | object: wiki file name (as in the icon URLs, e.g. `"Copper_Shortsword.png"`) → `[sheet index, x, y, width, height]` |

Images that are not in it are loaded from the wiki: only the animated rarity names (and the
GIFs of the easter eggs).
The `icons/` folder next to this README holds copies of the sheets.
