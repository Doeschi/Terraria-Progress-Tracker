# Terraria Progress Tracker – Requirements

Status: v1 implemented, plus game version and difficulty (V, DF). IDs are used to refer to requirements in discussions and commits.

## Tech stack

Vite + TypeScript, React 19, Tailwind CSS v4 + shadcn/ui, Zustand (state), TanStack Virtual
(item list), Fuse.js (fuzzy search), browser-fs-access (files), Zod (save-file validation),
`terraria-world-file` (world parsing, in a Web Worker). Hosted on GitHub Pages, deployed by
GitHub Actions.

## G – General

- **G1** Everything runs in the browser. No backend, no analytics, no tracking data is sent
  anywhere. The only outgoing requests are for the app files and for item icons from
  terraria.wiki.gg (sent with `referrerpolicy="no-referrer"`).
- **G2** Modern UI with dark and light mode (follows system setting, can be switched).
- **G3** Desktop first, but usable on tablets and phones.
- **G4** Credits the Terraria Wiki as data and icon source (CC BY-NC-SA 4.0) with a link.
- **G4a** An "About" dialog (ⓘ in the top bar, and "License & credits" in a one-line note at the
  bottom of the filter sidebar) with the data source and its license (also for the generated data
  and sprite sheets), the code license (MIT) and repository, the trademark note, the libraries
  used and the AI notice.
- **G5** Deployed to GitHub Pages by a GitHub Actions workflow on push to `main`.
- **G6** UI language: English.
- **G7** Start page: a short tagline and the main features as a list with icons (items, filters
  with progress, crafting recipes, drops & bosses, bestiary, sync with your world; counts from the data),
  then the actions. "Continue where you left off" is a larger card with the file name, active
  playthrough, time of the last change ("today, 14:05") and an "unsaved changes" marker. Below,
  three notes with icons centered on their text: privacy, data source / license / unofficial
  fan project (G4), and that the app was built with the help of AI (Claude by Anthropic).
## D – Data

- **D1** Repository layout: `pipeline/` (download + build scripts, `mapping.toml`, `raw/`),
  `web/` (the app). The build script writes to `web/public/data/`.
- **D2** `items.json` is written minified for the app.
- **D3** Platforms offered: desktop, console, mobile, old-gen console, 3DS, Japanese console
  (all Exclusive-table platforms). A `platforms.json` with ids, display names and item counts
  is generated.
- **D4** Items are identified by their stable `key` (internal name). The numeric item `id`
  is only used to match world-file items (see W5).
- **D5** The wiki's `History` table (Desktop patches, English) gives each item the patch that
  introduced it (`introduced`, e.g. `1.4.0.1`) and the game update it belongs to (`version`,
  e.g. `1.4.0`). `versions.json` lists the updates with display names from `mapping.toml`.
- **D6** Items on shared wiki pages ("Lamps", "Paintings") use the earliest sentence that names
  the item together with "added"/"introduced", otherwise the page's introduction. Because item
  ids grow with every update, a shared-page item whose id belongs to a later update is moved to
  that update (never to an earlier one).
- **D9** Rarity and coin icons come from the image lists of the wiki pages "Rarity" and "Coins"
  (read via the API during download, `raw/page_images.json`). The build writes `rarities.json`
  (level, name, item count, icon) and `coins.json` (coin, value in copper, icon). The table shows
  rarity as the wiki's colored name image and prices as amounts with coin icons.
- **D10** The wiki's `Drops` and `NPCs` tables give drop sources per item (`drops.json`):
  sources (id, name, kind `npc` / `bag` / `container`, icon, NPC id) and per item the drops
  (source, game modes Normal/Expert/Master, quantity and chance as full text – e.g. "1% · Expert:
  1.99%" – and per game mode, since 300 drops have other chances or amounts in Expert/Master). Drop rows name
  items as text; they are matched by name, without a disambiguation suffix ("… (item)"), by wiki
  page ("Vampire set") and as furniture set ("Golden furniture"). Unmatched names are reported.
- **D10a** Enemy banners (every 50 kills) are missing from the `Drops` table; the `bannername` of
  the `NPCs` table links 287 of 292 banners to their enemy. They become drops of the enemy with
  the rate "Banner" (no chance), so "Dropped by", biome, event, conditions and milestone follow
  from where and when the enemy spawns (e.g. Alien Hornet Banner → Lunar Events, Lunatic
  Cultist). Banners marked unobtainable are left out.
- **D11** Which source kinds are used is set in `mapping.toml` (`[drops] include_kinds`): enemies/bosses,
  boss treasure bags and containers (chests, crates, lock boxes, grab bags, shaking trees).
- **D11a** Container sources get a group from `mapping.toml` (`[containers]`, matched by name):
  Chests, Crates, Trees (shaking a tree) and Other containers (lock boxes, Goodie Bag, Present,
  Geode, …). Sources that are no item themselves (e.g. "Gold Chest (Dungeon)", "Shaking Forest
  tree") get the icon of the item without the suffix or of a configured item (the tree's wood).
  Container drops do not add events, biomes or times of day, and an item found in a container is
  not "only obtainable during events".
- **D12** Bosses are curated in `mapping.toml` (`[bosses]`, `[boss_stages]`): name, stage
  (pre-Hardmode, Hardmode, event), map icon and the drop sources that count for the boss (the
  boss, its parts, its treasure bag). Written to `bosses.json`.
- **D13** The wiki's `Equipinfo` table (from the game code) lists for equippable items which
  player values they change (e.g. `moveSpeed`, `accRunSpeed`, `noFallDmg`). The build adds them
  as `equip:<field>` keys that `mapping.toml` rules can match (case-insensitive, wildcards).
- **D14** Accessory subcategories: Movement, Wings, Defense & survival, Combat, Summoning,
  Informational, Fishing, Building & mining, Luck & coins, Music boxes and Other accessories.
  They are based on the `equip:` keys plus wiki tags/types and a few name rules; an item can be
  in several (e.g. Lucky Horseshoe: Movement and Luck & coins). `only_in_parent` keeps armor
  pieces with the same effects out of the accessories.
- **D16** Furniture subcategories, one per furniture type: Paintings, Statues, Trophies & relics,
  Music boxes, Chairs, Tables, Work benches, Sofas & benches, Toilets, Beds, Doors, Chests,
  Dressers, Bookcases, Pianos, Clocks, Sinks, Bathtubs, Lamps, Lanterns, Chandeliers, Candles &
  candelabras, Torches & campfires, Platforms, Cages & jars, Decorations, Enemy banners, Other
  banners and Other furniture. They come from the wiki page an item is on (`page:<name>` keys,
  e.g. all chairs are on "Chairs"). Banners are furniture subcategories, not a category.
- **D18** Crafting material subcategories: Bars, Ores, Gems, Souls, Fragments, Enemy drops,
  Critters, Potion ingredients, Threads & cloth – and, for items that are mainly something else
  but used in recipes, Blocks & walls, Furniture & stations and Equipment – plus Other.
  "Enemy drops" uses the Drops table (`drop:npc`, not for blocks/furniture/equipment),
  "Critters" the NPCs table (`npc:critter`). The build runs the mapping twice so rules can use
  drop information (`drop:npc`, `drop:boss`).
- **D18a** Category "Developer items" (not an obtain method – they come from treasure bags): the
  items the wiki tags as developer items, plus the developer wings, which sit on the shared
  "Wings" page without that tag and are matched by developer name ("Red's *", …; Jim's Cap is
  no developer item). No subcategory per developer: treasure bags always give the full set.
- **D17** Mapping rules can remove an entry again with `exclude` (e.g. "Other banners" excludes
  items tagged as enemy banner).
  Subcategories can also use `with_categories` / `without_categories` (the item's other
  categories) and `only_in_parent`.
- **D15** Every category with subcategories has an "Other …" subcategory (`fallback`) for its
  items that fit no other subcategory; it is always listed last (also when sorted A–Z).
- **D8** Obtain methods are named as *how* an item is obtained ("Crafted", "Found in chests &
  pots", "Collected in the world", …) so they are not mistaken for categories.
- **D7** Items with rarity Expert (-12) or Master (-13) that can only be obtained from drops or
  treasure bags get `minDifficulty` `expert` / `master`. Items that can also be crafted or
  bought are not restricted.
- **D19** Unobtainable items (the wiki's `unobtainable` field, tag or category "Unobtainable
  items") only belong to the obtain method "Unobtainable"; other labels the wiki gives them (e.g.
  "Dropped by enemies" for presents that were dropped until 1.2.2) are dropped. A list in
  `mapping.toml` (`[unobtainable] obtainable`) can override the wiki for single items.
- **D20** When a drop, recipe or ingredient names an item that exists several times (same name,
  different id), obtainable items are preferred (e.g. "Ogre Mask": the vanity mask, not the unused
  variant).
- **D21** The build warns about items marked unobtainable that still have a current source (drop,
  recipe, vendor), so wiki mistakes become visible.
- **D22** Items the wiki's Items table lacks but its Recipes table names with an id (45 in 1.4.5:
  new doors and candelabras, Magic Shimmer Dropper, Trusty Chillet) are tracked like other items:
  name, id, icon and recipe from the Recipes table, obtained by crafting, game update from the
  item id, and page, categories, platforms and placement flags from a similar item set in
  `mapping.toml` (`[recipe_items]`, name pattern -> template item). They have no stats, rarity
  or prices; the detail panel says so. Recipe items without a template are reported and stay in
  `missing_items.json`. When the wiki adds such an item to the Items table, the next build uses
  that instead (same key from the name).
- **D23** Icons are direct links to the wiki's image files. An image field naming several files
  ("King Slime Relic.png / King Slime Relic (placed).png") uses the first as icon and a
  "(placed)" one as placed image. `check_icons.py` checks all linked images through the wiki API
  in batches (no downloads) and saves image files that are only redirects (direct link = 404) to
  `raw/image_redirects.json`; the build then links their targets.

## IC – Icons

- **IC1** Small icons (PNG, at most 128 × 64 px – wide ones are the rarity name images) are packed into sprite sheets served with the app
  instead of being loaded one by one from the wiki: fewer requests, no load on wiki.gg, and
  icons do not break when the wiki renames a file. Larger images (placed / equipped images, NPC
  sprites) and animated GIFs stay links to the wiki. Not included: bestiary images, placed and
  equipped item images.
- **IC2** `pipeline/build_icons.py` (step 3) collects the icon links of the generated data,
  downloads missing files into a local cache (`pipeline/icons_cache/`, not committed; same
  User-Agent as the download, a few requests in parallel, `--refresh` revalidates cached files),
  and packs them into sheets (`web/public/icons/sheet-<n>.<hash>.png`, 1024 px wide, the hash in
  the name so updates are not held back by caches) plus `web/public/data/sprites.json`
  (sheet sizes and, per wiki file, sheet and position). A copy goes to `pipeline/data_readable/`
  (`sprites.json` indented, the sheets in `icons/`).
- **IC3** The app shows an icon from its sheet when `sprites.json` has it (same size rules as
  before: native size, scaled down to fit the box, pixelated), otherwise it loads it from the
  wiki.

## F – Save file

- **F1** The user can create a new tracking file or open one from disk.
- **F2** Save: in Chrome/Edge the app writes directly back to the opened file (File System
  Access API). In other browsers "Save" downloads the file.
- **F3** "Save as" is always available.
- **F4** Unsaved changes are shown in the UI, and the browser warns before the tab is
  closed with unsaved changes.
- **F5** A backup of the current state is kept locally in the browser (IndexedDB) after
  every change. On startup the app offers to restore it if it is newer than the last save.
- **F6** The file is JSON with a format `version`. Loaded files are validated; older
  versions are migrated. Item keys the app does not know are kept, not dropped.
- **F7** File content:
  ```
  {
    version,
    playthroughs: [{
      id, name, platform, difficulty, gameVersion, createdAt, updatedAt,
      checked: [itemKey],
      ignored: [itemKey],
      changedAt: { itemKey: isoTime },           // last check/uncheck/ignore/un-ignore
      bestiary: [entryId], bestiaryChangedAt: { entryId: isoTime },   // v4
      world: { name, guid, fileName, width, height, worldSurface, lastSyncedAt } | null,
      areas: [{ id, name, x1, y1, x2, y2 }]      // tile coordinates
    }],
    activePlaythroughId
  }
  ```

- **F8** Autosave (off by default; switch in the File menu, remembered in the browser, PR1): only
  where the file is written in place (Chrome/Edge) and only once the file exists on disk (after
  the first manual save / when opened). While there are unsaved changes it saves every 2
  minutes, and also when the tab is hidden or the page is closed. It never shows a dialog: if
  the browser has no write permission in this session (e.g. after a reload) autosave pauses;
  next to the file name the header shows "Saved 14:05", "Autosave paused" or "Autosave failed"
  (both clickable: ask for permission / retry), or "save once first".
## P – Playthroughs

- **P1** A file holds any number of playthroughs.
- **P2** The user can create (name, platform, difficulty, game version – in a dialog), switch
  to, rename (inline in the header) and delete (with confirmation) playthroughs.
- **P6** The "New playthrough" dialog can optionally attach a world right away: the file is read
  immediately (name, size, chests shown), the difficulty is set from the world's game mode and
  an empty name is filled with the world name. On create the world is attached (and remembered
  like with "Attach world") and the areas dialog opens.
- **P5** The header has three parts: the logo on the left, the labeled controls centered, and
  the labeled theme switch on the right, followed by a GitHub icon (link to the repository) and
  an ⓘ button for "About" (G4a) (logo and theme vertically centered). The centered part
  holds File and a box with everything that belongs to the active playthrough – Playthrough,
  Platform, Difficulty, Game version, World and the overall Progress. Platform, difficulty and
  version are changed directly there, without a dialog.
- **P3** Each playthrough has one platform. Only items available on that platform are shown
  and counted.
- **P4** Platform, difficulty and game version can be changed later; checked state of items is
  kept even for items that are hidden by the new settings.

- **P7** A new playthrough starts with all unobtainable items (D19) ignored, so they do not count
  towards progress; they can be un-ignored like any other item. Existing playthroughs are not
  changed.
## I – Items

- **I1** Items are shown in a virtualized table with icon (loaded lazily from the wiki) and name.
- **I2** Each item can be checked (obtained) and unchecked.
- **I3** Each item can be ignored (per playthrough). Ignored items are hidden from the list
  and do not count towards any progress. (Hidden and ignored are the same thing.)
- **I4** A view switch shows: all, obtained, missing, or ignored items. From "ignored" items
  can be un-ignored.
- **I5** Each item has a link that opens its wiki page in a new tab.
- **I6** Without a sorted column, items are ordered by name (or by relevance while searching).
- **I6a** Search mode next to the search field (items and bestiary; also used by the chest
  search): "Fuzzy" (default, typos allowed – Fuse.js) or "Exact" (the text must appear in the
  name or internal name, case-insensitive; exact name first, then names starting with it, then
  matches at a word start, then anywhere). Remembered in the browser (PR1).
- **I8** Each item shows the patch that added it and an "Expert" / "Master" badge if it is only
  obtainable in that difficulty.
- **I10** The table has a column for every useful item field (categories, how to obtain, sold by,
  rarity, version, prices, combat, tool, use and placement stats, tooltip, …). A "Columns" menu
  shows/hides them (grouped, with Defaults / All / None); the selection is remembered in the
  browser. Checkbox, icon and name stay pinned while scrolling sideways, the header stays on top.
- **I11** Table columns sort by clicking the header (first click: numbers high to low, text A–Z;
  second click reverses; third click restores the list order). Empty values always sort last.
- **I12** There is no separate list view; the table is the only item view.
- **I13** For every item the time of its last change (checked, unchecked, ignored, un-ignored –
  by hand, bulk action or world sync) is saved per playthrough. It is shown in the table column
  "Last changed" (group "Tracking", visible by default, always the last column, first click
  sorts newest first) and as
  tooltip of the checkbox. Setting an item to the state it already has keeps its date.
- **I14** Save format v3 adds these dates; older files are migrated without dates.
- **I16** Table columns can be resized by dragging the right edge of their header (minimum
  60 px, the name column 160 px); a double-click on the edge restores the default width, "Reset
  widths" in the Columns menu all of them. Checkbox, icon and the last column have a fixed width.
- **I15** Column presets are always-visible quick buttons above the table ("View"): Overview,
  Where to get it, Progression (sorted by "Available after"), Weapons, Mining & tools, Armor &
  accessories, Potions & food, Fishing, Building & furniture, Trading, Technical. A preset sets
  the visible columns and, for most, a sort order (e.g. Weapons: damage high to low). "Available
  from" is part of Overview, Where to get it, Progression, Weapons, Mining & tools, Armor &
  accessories and Fishing; "Conditions" of Where to get it, Progression and Trading. The active preset is highlighted; after a manual
  change in the Columns menu the view counts as "Custom". Presets are defined in
  `web/src/components/table/presets.ts`.
- **I7** Bulk actions for the currently visible items: check all, uncheck all, ignore all
  (with confirmation).

## FL – Filters and progress

- **FL1** Filter groups, in this order: Progression (milestones, MS3), Categories (with
  their subcategories nested below), Obtained by, Crafting (RC6), Sold by, Found in (B3b), Bosses, Events, Biome, Time of day, Rarity (shown
  with the wiki's rarity images, in in-game order) and Added in (game update). The same order is
  used in the active-filter bar.
- **FL2** Every filter entry shows its icon, name, `obtained / total` and percentage, plus a
  progress bar.
- **FL3** Multiple entries can be selected. Within a group they are combined with OR, across
  groups with AND.
- **FL4** Totals only count items available in the playthrough (platform, difficulty, game
  version) that are not ignored. Entry counts
  are faceted: they respect the search and the selections of all *other* filter groups.
- **FL4a** Options without matching items under the current filters or search stay in place,
  grayed out (no jumping sidebar); only options without any items in the playthrough (e.g. an
  update not in the selected game version) are left out.
- **FL5** The overall progress of the playthrough is always visible.
- **FL6** Active filters are shown and can be cleared individually or all at once ("Clear all"
  right after the last filter). Without filters and search the bar shows "No filters active"
  at the same height, so the list below does not jump.
- **FL7** The options of the groups categories (incl. subcategories), obtained by, sold by and
  events can be switched between the default order (as in `mapping.toml`) and A–Z.

- **FL8** Every filter group shows its own progress in its header (obtained / total, percentage,
  a bar on its own line below the name, the same length for every group): the items that are in at least one of its options, faceted like the options (the
  other groups' selections and the search count, the group's own selection does not). Groups
  that cover every item (categories, rarity, added in) show the filtered overall progress.
- **FL9** "Find a filter": a search field at the top of the sidebar (items and bestiary) filters
  the groups and options by name, matching at word starts ("wing" → Wings, not Glowing
  Mushroom). A matching group shows all its options; a matching option keeps its parent, a
  matching parent keeps its children; matching children are shown expanded. Groups without a
  match are hidden; the field stays visible while scrolling; Escape or × clears it.
- **FL9a** Keyboard in the filter search: the first match is highlighted (dashed frame) with a hint
  "↵ select <name> · ↑↓ 1 of n". ↑/↓ move between the matches in screen order ("Completed"
  included; parents shown only for context are skipped). Enter selects the highlighted option (or
  unselects it if it is already selected) and clears the search, keeping the focus, so filters
  can be chained ("snow ↵ night ↵"). Escape clears the search. If the matching options have no
  items with the current selection, the sidebar says so instead of staying empty.
- **FL10** Hiding filters: an edit mode (eye button next to the filter search, with a hint line
  and "Done") shows an eye at the start of every option – far from the subentry arrow, so hiding
  cannot happen by a misclick. Hiding moves the option to the "Hidden" section at the bottom of
  the sidebar (a parent takes its children along; single children can be hidden too) and shows a
  message with "Undo". Hidden options still work as filters from there and can be shown in their
  group again (eye, always available in "Hidden"; the section opens in edit mode). The filter
  search (FL9) ignores hidden options.
- **FL11** "Move completed filters" (toggle next to the filter search): options at 100 % in the
  current context move to the "Completed" section, above "Hidden". Completed options stay
  usable and follow the filter search.
- **FL12** Both sections list their options under the name of their group, are collapsed by
  default and only appear when they have options. Hidden options and the completed toggle are
  remembered in the browser (PR1); hidden options separately for items and bestiary, the
  completed toggle for both.
- **FL13** "Open all / close all" button next to the filter search: opens or closes every filter
  group and the "Completed" / "Hidden" sections; single groups can still be toggled afterwards.
- **FL14** Every group header also shows how many of its options are completed, e.g. "✓ 2/18"
  (top-level options with items in the current context, hidden ones left out; green when all
  are complete).
## PR – Remembered view settings

- **PR1** Stored in the browser (localStorage), not in the tracking file: visible table columns,
  their widths, the table's column sorting, and the option order (default / A–Z) per filter group. They are
  restored on the next visit. Settings that no longer apply (e.g. a removed column) are ignored.

## B – Bosses and drops

- **B1** Filter group "Bosses": stages (Pre-Hardmode, Hardmode, Event bosses; icons: Suspicious
  Looking Eye, Mechanical Skull, Pumpkin Moon Medallion) with their
  bosses nested below (expanded by default), with map icons and progress. Selecting a stage
  counts all its bosses. Event minibosses and the Lunar Pillars are included.
- **B1a** Generic drops almost every boss has (coins, healing potions) do not count for the boss
  filter; the list is `[drops] boss_ignore_items` in `mapping.toml`. Their drops still show in
  the item's detail panel.
- **B2** Only drops that exist in the playthrough's difficulty count (e.g. in Classic the treasure
  bag contents do not, the boss's own drops do; Journey counts all modes).
- **B3** Table column "Dropped by" (group Source, part of the "Where to get it" preset): the
  sources of the playthrough's difficulty with their chance *in that difficulty* (Classic and
  Journey: Normal chances); sorting uses the best of these chances.
- **B3a** Table column "Found in" (group Source, "Where to get it" preset): the containers with
  their chance, like B3; "Dropped by" only lists enemies, bosses and treasure bags.
- **B3b** Filter group "Found in" (after Sold by): the container groups (Chests, Crates, Other
  containers, Trees) with their containers nested below (collapsed), with icons and progress,
  e.g. everything from Skyware Chests. Only container drops of the playthrough's difficulty count.
- **B3c** The detail panel shows container drops in their own section "Found in" (below "Dropped
  by"), with quantity and chance like the drops.
- **B4** Nested filter groups work generally (a parent and its own children are never selected
  together), so further grouped sources can be added the same way.

## EV – Events

- **EV1** The "Events" filter group lists game events as a flat list that can be sorted (default
  order / A–Z, FL7): invasions (Goblin Army, Pirate Invasion, Frost Legion, Martian Madness,
  Old One's Army), moon events (Blood Moon, Solar Eclipse, Pumpkin Moon, Frost Moon), Lunar
  Events, weather (Rain, Windy Day, Sandstorm, Blizzard) and seasons (Halloween, Christmas).
  Each has an icon (a representative item) and progress. Slime Rain and Starfall are left out
  for now: no item is obtainable only there (slimes also spawn outside Slime Rain, Fallen Stars
  are no drop).
- **EV2** An item belongs to an event if it can be obtained *during* the event:
  - it is dropped by an enemy that only spawns during the event – from the `environment` of the
    wiki's `NPCs` table (e.g. "Pirate Invasion", "Snow biome+Blizzard"); an enemy counts only
    if every spawn alternative requires the event,
  - or the drop itself is limited to the event (e.g. a chance "during Halloween"),
  - or the item is tagged for the event on the wiki (e.g. seasonal shop items, Old One's Army).
- **EV3** Main bosses (pre-Hardmode and Hardmode stages) do not make their drops event items
  (e.g. Deerclops → Blizzard, Moon Lord → Lunar Events); event bosses (Pumpking, Flying
  Dutchman, …) do.
- **EV4** Items that can *only* be obtained during events (all drop sources are event enemies and
  the item cannot be crafted, bought or found otherwise) are marked "Event only" in the table
  and the detail panel.
- **EV5** Which spawn conditions and drop conditions belong to which event is set in
  `mapping.toml` (`[events.*] environments` / `drop_conditions`). The former entries "Night" and
  "After Martian Madness" are removed.

## BI – Biomes and time of day

- **BI1** Filter group "Biome" (flat, sortable): Forest & surface, Underground & caverns, Desert,
  Snow, Jungle, Jungle Temple, Corruption, Crimson, Hallow, Ocean, Dungeon, Underworld, Space,
  Glowing Mushroom, Granite & Marble caves, Spider Nest, Graveyard, Meteorite. An item belongs to
  a biome if an enemy that drops it spawns there (not exclusive). Surface and underground
  variants of a biome are combined (e.g. Corruption = surface, underground, corrupted desert).
- **BI2** The spawn locations come from the `environment` of the `NPCs` table, grouped into
  biomes in `mapping.toml` (`[biomes.*] environments`). Main bosses (own filter), enemies
  that only spawn during events (Events filter) and town NPCs are left out – a town NPC's
  environment is where it is found before moving in (e.g. the Stylist in a Spider Nest). "Bonus drop" sources
  ("Blue Slime (bonus drop)") use the spawn data of the normal enemy.
- **BI3** Replaced by the "Conditions" group (CO3): Day and Night are conditions there.
- **BI4** Table columns "Biome" and "Time of day" (group Source; Biome is part of the "Where to
  get it" preset), and in the detail panel each drop source shows where and when it spawns.
- **BI5** Enemies without spawn data on the wiki (e.g. the new 1.4.5 slime variants) give no
  biome.

## CO – Conditions (vendors and drops)

- **CO1** Vendor shops come from the vendor pages (`{{shop row|item|condition}}` in their source,
  downloaded with the other page sources; the vendor list is `[vendors]` in `mapping.toml`).
  Each shop row gives the item, the vendor and the condition as text, e.g. "In Hardmode, during
  night, in a Jungle, when Plantera has been defeated." Items of the shops that the Items table
  does not tag with the vendor get the vendor too.
- **CO2** Condition texts of shop rows and drop rows are mapped to condition ids with the links
  and phrases in `mapping.toml`; negated parts ("before defeating …", "except in Remix worlds",
  "but not …") give no id. The build reports unmapped links. Types:
  - Time of day: Day, Night; moon phases 1–8 (from `{{moons|…}}`, with the wiki's moon icons)
  - Progress: after a boss (the bosses of the Bosses filter, plus "any mechanical boss" / "all
    mechanical bosses"); Hardmode / Pre-Hardmode only (shown, not filtered – see Progression)
  - Weather: wind speed ≥ 20 mph (e.g. kites)
  - Events and biomes: go into the existing Events and Biome groups (EV, BI)
  - Special cases (group "Special", not filterable, but shown in the "Conditions" column like
    the others): no altar placed in the world, NPC named Jim, item in the inventory, bestiary
    ≥ N %, golf score over N, another NPC present, multiplayer, world without a Dungeon /
    Jungle Temple, wave 15 and up, … (text patterns in `mapping.toml`; bestiary %, golf score
    and NPC names get their number / name)
  - World seeds, Hardmode / Pre-Hardmode, platforms: shown only in the detail panel
- **CO3** Filter group "Conditions" (replaces "Time of day"), nested: Time of day (Day, Night),
  Moon phase (8 phases), After a boss (the bosses, any / all mechanical bosses), Weather (Windy).
  An item belongs to a condition only if it can *only* be obtained under it: within a condition
  group (time of day, moon phase, boss, weather) every source must be restricted – shop rows,
  drops (an enemy that only spawns at night counts as a night source) – and the item belongs to
  the conditions of its sources in that group. Containers, crafting, fishing, other obtain
  methods and vendors without a shop row are unrestricted sources; shop rows only in special
  seeds do not count. E.g. Leaf Wings → Night, after Plantera; Glowstick (Merchant at night,
  Skeleton Merchant by day, enemies any time) → none. Events and Biome keep "can be obtained
  during / in" (EV2, BI1).
- **CO4** Events and Biome also count shop rows and drop conditions, e.g. Leaf Wings → Jungle,
  Throwing Knife (Merchant, Blood Moon) → Blood Moon. "Event only" (EV4) also considers shop
  rows: an item sold only during events (and not obtainable otherwise) is event-only.
- **CO4a** The wiki tags the Dye Trader's rewards for Strange Plants as "quest rewards" like the
  Angler's. They get their own "Obtained by" entry "Strange Plant reward" (33 dyes) from the
  "Rewards" section of the Dye Trader page (`[obtain.strange-plant]` `page` / `section` /
  `replaces`); its headings ("After defeating [[Plantera]]") are the conditions of the reward
  (CO3), e.g. Wisp Dye → after Plantera. "Angler quest reward" keeps the Angler's 43 items.
- **CO5** Detail panel: "Sold by" lists each vendor with icon and its condition text (moon
  phases as icons). Drop rows show their condition names below the source. Table column "Sold
  by" shows the vendors with short condition names; "Time of day" becomes "Conditions" (moon
  phases as the wiki's moon icons, the name on hover).

## MS – Milestones ("available after")

- **MS1** Milestones in a typical order, configurable in `mapping.toml` (`[milestones]`): World creation,
  King Slime, Eye of Cthulhu, Eater of Worlds / Brain of Cthulhu, Queen Bee, Deerclops,
  Skeletron, Wall of Flesh (Hardmode), Queen Slime, any mechanical boss, all three mechanical
  bosses, Plantera, Golem, Duke Fishron / Empress of Light, Lunatic Cultist, Moon Lord. Optional
  bosses sit where they are usually fought. Icons: the bosses' map icons.
- **MS2** Every item gets its earliest milestone: the earliest of its sources, computed until
  nothing changes (recipes depend on other items), but never earlier than its minimum:
  - boss drops and treasure bags: the boss's milestone (mechanical bosses: any mechanical boss;
    Lunar Pillars: Lunatic Cultist); event enemies: the event's milestone (`[milestones.*]
    events`, e.g. Pumpkin Moon → Plantera, Martian Madness → Golem); enemies spawning in the
    Dungeon → Skeletron, in the Jungle Temple → Plantera; other enemies → Start
  - shop rows: the later of the vendor's move-in (`[vendors.*] milestone`, e.g. Cyborg →
    Plantera) and the row's conditions (after a boss, Hardmode)
  - recipes: the latest of the crafting stations (the earliest item providing each) and the
    ingredients ("Any …" groups: their earliest item); shimmer: the source item
  - containers: `[container_milestones]` (e.g. Shadow Chest → Skeletron, biome chests →
    Plantera), else Start; rows only in special seeds do not count
  - Strange Plant rewards: the conditions of their heading; other obtain methods (fishing,
    quest rewards, …) → Start
  - minimum: Hardmode items → Wall of Flesh; `[milestone_items]` (name patterns) for what the
    data does not know, e.g. mining: Hellstone → evil boss, Hardmode ores → Wall of Flesh,
    Chlorophyte Ore → all three mechanical bosses; `[milestone_sources]` for enemies that
    appear later than their biome says (post-Plantera Dungeon enemies)
  The build writes `milestones.json` (with item counts) and lists Hardmode items whose sources
  say Start, to find missing rules.
- **MS3** Filter group "Progression" (replaces Pre-Hardmode / Hardmode): the milestones with
  icons. A switch in the group: "up to" (default, cumulative – a milestone contains every item
  available by then, e.g. Skeletron includes King Slime's) or "exactly" (only what becomes
  available at that milestone). The switch is remembered in the browser (PR1).
- **MS4** Detail panel: "Available after: <milestone>" with the reason (e.g. "Crafted – needs
  Chlorophyte Ore", "Sold by the Cyborg", "Dropped by Plantera"; without more precise data the
  obtain method's name as in "Obtained by", e.g. "Collected in the world"). Table column "Available after"
  (first of group Source, with the milestone icon, the reason on hover), sorted in milestone
  order.

## ID – Item detail panel

- **ID0** On wide screens (≥ 1024 px) the panel is docked right of the table, not an overlay: the
  table stays scrollable and usable, clicking another row (anywhere except checkbox, buttons and
  links) shows that item, and the selected row is highlighted. The panel has a close button. On
  narrow screens it slides in as an overlay instead.
- **ID1** Clicking an item (row or name) in the table shows a detail panel with: icon, name, rarity image,
  badges (Hardmode, Expert/Master only, added in), obtained checkbox, ignore, "Find in chests"
  (with a loaded world), wiki link and the last-changed date.
- **ID2** Sections: tooltip, "What it is" (categories), "How to get it" (obtain methods, vendors,
  events), "Dropped by" (source icon, name, boss, quantity and chance of the playthrough's
  difficulty, the other modes' chances small below when they differ, game modes; drops not in
  the playthrough's difficulty are greyed out and listed last), stats (all combat, tool, use/placement and economy
  values) and details (item id, internal name, platforms).
- **ID3** The name column of the table shows the name (opens the detail panel) and, aligned at
  its right edge in every row, "Find in chests" and "Open on the wiki"; the last column only
  has "Ignore". Expert/Master-only items (about 100) show the wiki's Expert or Master icon right
  after their name (tooltip "Expert & Master only" / "Master only") instead of a column of their
  own; the "Difficulty" column is in no view any more, only in the Columns menu (for sorting).

## V – Game version

- **V1** Each playthrough has a game version: one of the game updates (1.0 … 1.4.5) or
  "Latest" (default), which follows new data automatically.
- **V2** Items added after the selected update are neither shown nor counted. Items without a
  known version are always included.
- **V3** The version refers to Desktop patches; console and mobile releases roughly follow them.
- **V4** Every update has a name and an icon (an item added in it), set in `mapping.toml`
  `[versions.*]`: official names from 1.3 on (e.g. "Rounding Out the Journey", "An Eye For An
  Eye"), descriptive names for 1.0–1.2, which have none. Shown in the "Added in" filters (items
  and bestiary) and the game version pickers; long names are truncated with a tooltip.

## DF – Difficulty

- **DF1** Each playthrough has a difficulty: Classic, Expert, Master or Journey.
- **DF2** Classic hides Expert- and Master-only items, Expert hides Master-only items, Master and
  Journey (difficulty slider up to Master) include everything.
- **DF3** Loading a world sets the difficulty from the world's game mode; the user is told when
  it changes. It can still be changed manually in the playthrough dialog.
- **DF4** Files from before this feature (format v1) are migrated to Master and "Latest", so
  nothing that was counted before disappears.
- **DF5** Difficulties are shown with the wiki's game-mode icons (page "Difficulty",
  `difficulties.json`): in both difficulty pickers, the world line of the new-playthrough dialog
  and the "Expert & Master" / "Master only" badges of the item detail panel.
- **DF6** The platform and game version pickers show icons too: the wiki's platform icons (taken
  from its CSS for `{{eicons}}`, `platforms.json`) and the update icons (V4; "Latest" uses the
  newest update's icon). Icons taller or wider than their box are scaled down to fit and are
  centered with the text.

## S – Search

- **S1** A search bar filters the list with fuzzy search on the item name.
- **S2** Search combines with the active filters.

## W – World file

- **W1** A world file (`.wld`) can be attached to a playthrough. The file is read locally
  and never uploaded; only its name, GUID and size are stored in the tracking file.
- **W1a** After a world is attached (first time, or a different world; also from the "New
  playthrough" dialog), the areas dialog with the map opens right away to set up areas. It has a
  "Continue: sync with world" button; however it is closed (button, X, Escape), the first sync
  follows: the sync dialog (SY7) with the differences for items and bestiary. Reloading the same
  world does not open the areas dialog. The areas dialog opened from the World menu just closes.
- **W2** The world file has to be selected again each session (in Chrome/Edge the app can
  remember it and only asks for permission).
- **W3** Parsing runs in a Web Worker and only reads the header and chest sections. A
  progress indicator is shown.
- **W4** If a loaded world's GUID differs from the one attached to the playthrough, the user
  is warned and can re-attach.
- **W5** Chest items are matched by numeric item id to items available on the playthrough's
  platform. Ids that match no item are reported.
- **W6** Unsupported or corrupted files show a clear error message.
- **W7** Worlds newer than the parser's known format are supported as long as the chest section
  is unchanged (the end of the header is not validated). Tile entities (displays) are read by the
  app itself, including the 1.4.5 Item Flask; if they cannot be read, the world still loads and
  only the display scan is disabled, with a warning.
- **W8** Next to the World menu in the header a small quick button: with a loaded world it opens
  "Sync with world…" (items and bestiary); with an attached but not loaded world it reconnects
  it (reloads the remembered file, otherwise asks for the file again; shown in amber). Without
  an attached world there is no button (the menu says "Attach world").
- **W9** "Continue where you left off" also reloads the world file of the active playthrough if
  the browser remembers it (Chrome/Edge; the browser may ask once for read access). No file
  picker opens: without a remembered file, or if access is denied, the world stays "not loaded"
  and the reconnect button (W8) is shown.
## A – Areas

- **A1** Each playthrough has a list of areas (rectangles in the world).
- **A2** A default area "Full World" covers the whole world. It cannot be edited or deleted.
- **A3** Areas can be created, renamed, edited and deleted.
- **A4** Coordinates are entered in the units the in-game Compass and Depth Meter show
  (feet east/west of the world center, feet above/below the surface), with the resulting
  tile coordinates shown. 1 tile = 2 ft.
- **A5** A chest is inside an area if its position (top-left tile) is inside the rectangle
  (borders included).

## AM – Area map (stage 1: schematic)

- **AM1** The areas dialog shows a schematic map of the attached world: the world outline with
  its depth layers (space, surface, underground, caverns, underworld – from the world header),
  a marker for the spawn point (no dungeon marker), every chest (and display) as a dot, and the
  areas as rectangles. Hovering shows the in-game coordinates (compass / depth) and tile position; chest
  dots show their name.
- **AM2** Pan (drag in pan mode) and zoom (mouse wheel, buttons, "fit"). Works with mouse and touch.
- **AM3** In draw mode, dragging on the map draws a new area; afterwards it is named in the area
  form (coordinates prefilled and still editable).
- **AM4** Selecting an area (on the map or in the list) highlights it; it can be moved by dragging
  and resized by its corner and edge handles. Changes are saved when the drag ends. "Full
  World" is shown as the world outline and cannot be changed.
- **AM5** Chests and displays need the loaded world file; without it the map shows only the
  layers and areas, with a hint to load the world.

## PC – Player-placed chests

- **PC1** A chest counts as player-placed if it has a name (natural chests never do) or belongs to
  a group: at least N containers (default 3) whose neighbours are within D tiles (default 20).
  Displays (item frames, mannequins, …) always count as player-placed. Everything else counts
  as natural (world generation loot).
- **PC2** D and N can be changed (map toolbar, "Detection"); stored in the browser. Map, sync and
  chest search use the same rule.
- **PC3** The map has a switch "Player chests / All chests" (default: player chests; the counts
  include chests only); natural chests are hidden in player mode. The map toolbar is grouped with
  small labels – "Tool" (draw / pan), "Zoom" and, separated by a line, "Chests shown on the map"
  (the switch and the detection settings), which only changes the display.
- **PC6** Wording: the UI speaks of "player chests" (not "your chests") in the areas dialog, the
  map, the detection settings and the area selection of sync and chest search.
- **PC4** Sync and chest search have the option "Only player-placed chests" (default on), so loot
  in untouched natural chests does not count as obtained.
- **PC5** Limits: a single unnamed chest placed by the player (e.g. at a hellevator) counts as
  natural; natural chests close together would count as player chests.

## SY – Sync with world

- **SY1** A "Sync with world" button opens a dialog where one or more areas are selected.
  Default: all of the playthrough's own areas, or Full World if it has none. The selection
  (areas, displays, only player chests) is remembered per playthrough in the browser (PR1) and
  restored on the next visit; areas deleted since are dropped, and if none are left the default
  applies again.
- **SY2** The app scans all chests in the selected areas and shows a diff:
  - **To be checked:** items found in chests that are not checked yet. Each has a checkbox
    (selected by default) and there is a select/deselect-all toggle.
  - **Checked but not found:** checked items that are in none of the scanned chests. Each
    has a checkbox to uncheck it, plus an "uncheck all" action.
- **SY3** Nothing changes until the user presses "Apply". "Cancel" discards everything.
- **SY4** Ignored items and items not available in the playthrough (platform, difficulty,
  version) are left out of both lists.
- **SY4a** Option to also scan item frames, weapon racks, mannequins, hat racks and plates.
- **SY5** For each found item the dialog shows in how many chests it was found and the total
  stack.
- **SY6** The dialog shows a summary (chests scanned, items to check, items to uncheck).
- **SY7** One sync dialog for everything from the world: sections "Items" (SY1–SY6) and
  "Bestiary" (BE5), each with its number of differences. One "Apply" applies the selected
  changes of both; the footer summarises both. In every list a ticked checkbox means "apply
  this change" (for "Checked but not found": uncheck the item; off by default).

- **SY8** The area selection (sync and chest search) has two blocks: "Areas to scan" – "Full
  World" (the entire world) set apart from the areas of the playthrough, with a "Manage areas…"
  button that opens the areas dialog; its "Back to sync" / "Back to chest search" button returns
  – and "Options" (only player chests, include displays).
- **SY9** A third tab "Unknown items" lists the item ids of the scanned containers that the item
  data does not know: amount, the containers with name and position, and – if known – the name
  and icon from `missing_items.json` (recipe items without a template, see D22), or a hint when the id is higher than every known id (newer game version).
## CS – Chest search

- **CS1** A chest search view lets the user select one or more areas and search for an item
  (fuzzy, same as S1).
- **CS2** Results list every chest that contains the item: chest name, position (in-game
  units and tiles), and stack size.
- **CS3** Chest search can also be opened from an item in the list and the detail panel ("Find in
  chests"). The button is always shown; without a loaded world it is greyed out and its tooltip
  says to attach the world file, or – if one is attached but not loaded in this session – to
  reload it.
- **CS4** The results of an item show the world map (read-only: pan and zoom, no area editing)
  with every container the item is in highlighted; the other containers are dimmed, the searched
  areas shown faintly. Hovering or clicking a result emphasises its container (clicking also
  centers and zooms the map on it); clicking a marker selects its result.

## RC – Crafting recipes

- **RC1** Data from the wiki's `Recipes` Cargo table, current recipes only (legacy recipes of
  old-gen/3DS pages are left out). A recipe has a result (item and amount), one or more crafting
  stations (all required, e.g. "Work Bench and Ecto Mist") and ingredients with amounts. Recipes
  limited to some platforms (`version` column) only count on those platforms.
- **RC2** Ingredient groups ("Any Wood", "Any Iron Bar", …): the items per group come from the
  wiki page "Alternative crafting ingredients" (item ids). Items of a group can be mixed.
  Ingredients that match no item or group are shown as text and are never available.
- **RC3** Stations are mapped to the items that provide them in `mapping.toml` (`[stations.*]`),
  including stronger stations (e.g. Iron Anvil = Iron Anvil, Lead Anvil, Mythril Anvil,
  Orichalcum Anvil; Work Bench = every work bench). Environment conditions (By Hand, Water,
  Honey, Lava, Snow Biome, Ecto Mist, Demon Altar) need no item.
- **RC4** Shimmer transmutations (station "Shimmer") are kept apart from crafting recipes: they
  show in their own section and do not count for the crafting filter.
- **RC5** Detail panel, collapsible sections (open/closed is remembered, PR1):
  - "Crafting": every recipe for the item – result amount, stations, ingredients with amounts and
    icons; ingredients the playthrough has obtained are marked.
  - "Used in": recipes that use the item directly or through a group, as a compact list of
    results (icon, name, amount of this item).
  - "Shimmer": what the item turns into / what turns into it.
  Ingredients, stations and results can be clicked to show that item.
- **RC6** Filter group "Crafting" (after Obtained by) with three entries:
  - "Has a recipe" – items with at least one crafting recipe on the playthrough's platform,
  - "Craftable with obtained items" – a recipe whose ingredients (for groups: any member) are all
    checked in the playthrough,
  - "Craftable from your chests" – a recipe whose ingredients are in the player-placed chests
    (PC) of the attached world in the needed amounts (group members added up); only shown when a
    world is loaded.
  Only direct crafting counts (no intermediate steps).
- **RC7** Toggle "Stations required" in the Crafting group (remembered, PR1): when on, a recipe
  only counts as craftable if one item of each station is obtained (checked) – for "from your
  chests" also if it is in a chest. When off, stations are ignored.

## BE – Bestiary

- **BE1** Data: the wiki page "Bestiary/List" gives all entries in the in-game order (name, variant
  such as "Zombie (Female)", stars, biome / time / event filters, and the entry's internal name
  from its text key `npc_<Name>`). The page "NPC IDs" maps internal names to NPC ids, pages and
  images; the `NPCs` table gives the type. Every in-game variant is its own entry, exactly as in
  the game.
- **BE2** Entry types: Town NPCs, Critters, Enemies, Bosses (from the `NPCs` type).
- **BE3** Availability like items: only entries of the playthrough's platform (Exclusive table;
  the bestiary exists on Desktop, Console and Mobile) and game version (NPC id ranges from the
  history of "NPC IDs", at least 1.4.0 – the bestiary was added then). For older game versions
  the view says that the bestiary does not exist yet.
- **BE4** Tracking: per playthrough, an entry is unlocked or not (the detail levels from further
  kills are not tracked). Entries can be checked manually.
- **BE5** World file: the world stores the bestiary (kills, seen critters, talked-to NPCs). The
  sync dialog's "Bestiary" section (SY7) compares it with the playthrough: "To be checked"
  (unlocked in the world, not checked) and "To be unchecked" (checked, not unlocked in the
  world), each entry with what the world says (kills / seen / talked to) and selectable. The
  dialog opens on this section after re-loading the world when the bestiary differs; for a
  newly attached world (areas dialog first) a message offers it. It can also be opened from the
  World menu ("Sync with world…") and the bestiary toolbar.
- **BE6** Separate view: "Items | Bestiary" switch in the header. The bestiary view has its own
  filters (Type, Biome, Time of day, Events, Added in – faceted like FL3/FL4), its own search,
  Show all / missing / unlocked, and a table: in-game number (default order), icon, name, type,
  biomes, stars, kills in the attached world, unlocked checkbox, wiki link, last changed.
- **BE7** Header: a second progress bar for the bestiary below the item progress.
- **BE8** Tracking file v4: `bestiary` (unlocked entry ids) and `bestiaryChangedAt` per
  playthrough.

## v2 / later

- **Area map stage 2:** draw the actual world (block, wall and liquid colors) behind the
  schematic map (AM): own tile reader writing colors straight into a pixel buffer (the library's
  per-tile objects need too much memory), a map color table (license to check if taken from a
  tool like TEdit), tiled/scaled canvas (Safari canvas size limit) and caching per world.
  Extras: chest search hits and sync results on the map.
- **Searchable source picker:** filter by any drop source, not only bosses – all enemies (about
  290) and containers – via a searchable picker instead of a sidebar list. The drop data
  (`drops.json` sources with kind) and the generic filter groups (B4) are prepared for it.
- **Vendor conditions:** the shop tables on the vendor wiki pages (`{{shop row|item|condition}}`)
  give when an item is sold (moon phase, night/day, Hardmode, after defeating a boss, biome …).
  First step: show the condition next to the vendor in the table ("Sold by") and the detail
  panel, moon phases with icons. Filters on these conditions: to be discussed.
- **Wiki data updates:** decide how to handle new, changed and removed items when the data is
  downloaded again. Tracking files store item keys (internal names), so renamed or removed
  items would silently drop out of a playthrough. Ideas: keep versioned snapshots of the raw
  data (or a data version in the JSON files), a diff report between two downloads (added /
  changed / removed items, renamed keys), a key-alias list for renamed items, and a notice in
  the app when checked items no longer exist in the data.
- **Milestones from the world:** read which bosses the attached world has defeated (the world
  file stores the "downed" flags) and highlight / filter "available now" (MS).
- **Cloud storage for the tracking file:** open and save the tracking file in Dropbox (first)
  and Google Drive (later), for devices without a sync client (phones, tablets). No maintained
  library covers both for a browser-only app, so a small adapter per service (sign in, find,
  load, save): Dropbox with the official `dropbox` SDK (PKCE sign-in, long-lived token, app
  folder), Google Drive with Google Identity Services + the Drive REST API (`drive.file` or the
  hidden app folder; 1-hour tokens renewed silently). Both need an app registration with the
  Pages URL as redirect (client ids in the code are fine; Dropbox starts in development mode,
  up to 500 users). Detect changes from other devices with the file's revision (Dropbox `rev`,
  Drive version) and ask before overwriting. Same autosave rules as the local file. Open
  questions: visible file or hidden app folder; File-menu entries and "Continue" for cloud
  files. (Already works today on PCs: save the file in the Dropbox / Drive sync folder.)
