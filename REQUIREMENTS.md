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
- **G4a** An "About" dialog (ⓘ button at the top right, and "License & credits" in a one-line note at the
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
- **G8** A few easter eggs (Terraria references; deliberately not listed here). They never block
  the app or change data, are short, show no motion with "reduced motion", use only own texts and
  the wiki's images, and can be turned off in the settings ("Easter eggs", on by default).
  Seasonal ones can be tested with `?date=YYYY-MM-DD` or `?date=YYYY-MM-DDTHH:MM` in the URL:
  everything seasonal then uses that date and time (only what is shown; nothing is saved).
  Seasonal ones follow the clock while the app stays open: the date is checked once a minute, and
  a change (a special day, the night after midnight) shows without reloading.
  The completion ones can be shown with `?egg=bestiary` and `?egg=credits`.

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
- **D18b** Vanity subcategories: Head, Body and Legs (the wiki's equipment slot: social helmet /
  shirt / pants), Accessories, Music boxes, Monoliths & sky effects (the wiki's "Monoliths"
  page) – together every vanity item – plus Boss masks (the "Masks" page) and Voice
  accessories (the "Voice accessories" page), which are also in Head / Accessories.
- **D18c** Armor and vanity sets: the pieces of a set share a wiki page whose name ends in "armor"
  or "set" ("Hallowed armor", "Pirate set", "Yoraiz0r's set"); such a page with at least 2 items
  is a set (185; `[sets]` in `mapping.toml` adds or excludes pages). A set is an armor set when
  most of its pieces are armor, else a vanity set (developer sets too). `sets.json`: id, name,
  wiki link, kind, items; items get `set`. Category "Sets" with the subcategories "Armor sets"
  and "Vanity sets" (the items keep their other categories). Detail panel: collapsible section
  "Set: Pirate set" with "2 / 3 obtained", armor / vanity set, the wiki link and every piece
  (clickable rows, obtained marked, the current item highlighted). No set bonus yet (not in the
  Cargo tables).
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
- **D8a** "Obtained by" comes from the wiki's tags and from our own data: drops (enemies →
  Dropped by enemies, boss treasure bags, chests → Found in chests & pots, crates and grab bags,
  shaking trees → Collected in the world), shimmer transmutations ("Shimmer transformation"),
  critters ("Caught with a Bug Net"), the Extractinators (B6), and by name: music boxes
  ("Recorded (Music Box)"), grave markers of the page "Tombstones" ("Player death"; the golden
  ones when dying with at least 10 gold coins – from the start, though pirates drop them too), other forms of an item – Shellphone
  and Chaos Cylinder modes, "(Inactive)" versions ("Other form of an item"). Methods with
  `filter = false` are only shown with the item (detail panel, table), not as a filter option:
  Poo "Using a toilet (well fed)". Every obtainable
  item has at least one method: the rest (world items like Fallen Star, items the wiki has not
  tagged yet, about 30) are under "Other". Critters whose name differs from their NPC (butterflies, ducks, scorpions,
  jellyfish) come from their shared wiki page. The wiki tags the loot of boss treasure bags as
  "bag loot" too: an item "From boss treasure bags" is only "From grab bags & crates" if a
  crate or grab bag really holds it (a drop row; `[obtain.treasure-bag] replaces`). Developer
  items (D18a) are "From boss treasure bags".
- **D8b** Everything that says how and when an item is obtained is read off one list of its
  sources (`trackerdata/sources.py`), collected when all the data is read: its drop rows
  (enemies, treasure bags, containers), shop rows, vendors the Items table names without a shop
  row, reward pages (CO4a), shimmer and Extractinator results, name rules, and the methods only
  the wiki's tags name. From it: "Obtained by" (D8a), vendors (CO1), events and "Event only"
  (EV2, EV4, CO4), biomes and time of day (BI), conditions (CO3), `minDifficulty` (D7) and the
  milestone (MS2) – so they cannot disagree. For all of them: rows only in special seeds count
  for nothing (CO6); containers, crafting, world items, fishing, quest rewards and vendors
  without a shop row are sources without a restriction; a tag naming a kind of drop row
  ("Dropped by enemies", "Found in chests & pots", the bags) says nothing more for an item that
  has drop rows – without rows it is a source nothing more is known about (no restriction).
- **D7** Items with rarity Expert (-12) or Master (-13) that can only be obtained from drops or
  treasure bags get `minDifficulty` `expert` / `master`. Items that can also be crafted or
  bought are not restricted.
- **D18b** Pickups that are used up on touch and never reach the inventory (Heart, Star, their
  seasonal variants Candy Apple, Candy Cane, Soul Cake, Sugar Plum, and the Nebula boosters) are
  left out of the items (`[pickups]` in `mapping.toml`), together with their drop rows.
- **D19** Unobtainable items (the wiki's `unobtainable` field, tag or category "Unobtainable
  items") only belong to the obtain method "Unobtainable"; other labels the wiki gives them (e.g.
  "Dropped by enemies" for presents that were dropped until 1.2.2) are dropped. A list in
  `mapping.toml` (`[unobtainable] obtainable`) can override the wiki for single items.
- **D20** When a drop, recipe or ingredient names an item that exists several times (same name,
  different id), obtainable items are preferred (e.g. "Ogre Mask": the vanity mask, not the unused
  variant). A kind in brackets picks its item: the drop rows of "Constellation (painting)" belong
  to the painting, not to the whip; the shop row "Princess Dress (Clothier)" to the dress of the
  page "Princess set (Clothier)", not to the Goodie Bag costume.
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

## DU – Data updates

Downloading the wiki data again (steps 1–3) updates everything the tables and pages hold; what
needs a decision is reported, and parsers that read page text must not silently lose data.

- **DU1** Update report: `compare_data.py` (step 4) compares the newly built data with the
  previous one (the committed `web/public/data`, `git show HEAD:…`) and writes a Markdown report
  (`pipeline/update_report.md`, not committed):
  - items added and removed; renamed ones (same item id, different key) listed apart – they
    break progress files
  - per item: changes of categories, subcategories, "Obtained by", milestone and its reason,
    vendors, events, biomes, time of day, conditions, event only, minimum difficulty,
    unobtainable (a list per kind, item names)
  - counts per data file before / after (items, drops, sources, recipes, shop rows, bestiary
    entries, drop groups, Extractinator results, sets, …)
  - the warnings of step 2 in one list (unmapped raw values, items without category, unknown
    names, rules that match nothing, unmatched drop groups, …): step 2 also writes them to a file
    (`pipeline/build_warnings.json`) instead of only to the log
  The report is read before committing new data. While working on the pipeline: `--base-dir`
  compares with a folder of earlier data instead of a git revision (the change log of DU4 is
  not written then), `--full` names every item of a change instead of the first 12.
- **DU2** Parser sanity checks: each part read from page text (shops of the vendor pages,
  Bestiary/List, "Any …" ingredient groups, platform icons from MediaWiki:Common.css, NPC IDs,
  drop groups, Extractinator tables, Strange Plant rewards) has a minimum in `mapping.toml`
  (`[sanity]`, about 90 % of the last download: shop rows ≥ 700, drop group pages ≥ 80, results
  per Extractinator ≥ 50, bestiary entries ≥ 500, …; `build_warnings.json` has the counts). Below it, step 2 stops with an error naming the part, the count and
  the minimum (a changed wiki template, not a silently smaller data set). `--no-sanity` builds
  anyway, e.g. to look at the result.
- **DU3** Data version: step 1 writes the download date (`raw/download_info.json`); step 2 writes
  `meta.json` with it as `dataVersion` ("2026-10-02") and the newest game version. The About
  dialog shows them ("Item data: downloaded 2026-10-02, game version 1.4.5"). Progress files
  remember the data version they last used (`dataVersion`, optional – older files have none).
- **DU4** Change log: step 4 adds an entry to `meta.json` `updates` for the new data version
  (replacing one of the same version): items added (keys), removed (key and name) and renamed
  (old key → new key: same item id; plus `[renamed_items]` in `mapping.toml` for renames the
  report cannot detect). Step 2 keeps the `updates` of the existing `meta.json`.
- **DU5** Opening a progress file (or continuing from the backup) with an older data version:
  - renamed keys are replaced in every playthrough (checked, ignored, last changed), so the
    checkmarks move along
  - a dialog "Item data updated" lists what changed since the file's data version: renamed items
    (kept), new items, and the file's checked / ignored items that no longer exist (their keys
    stay in the file in case they come back, but count nowhere). Files without a data version
    only get the last part. No dialog when nothing concerns the file.
  - the file's `dataVersion` becomes the current one (the file has unsaved changes then); new
    files get the current one.

## IC – Icons

- **IC1** Every wiki image the app shows – item and filter icons, enemies, bosses and critters
  (bestiary, drop sources) – is packed into sprite sheets served with the app instead of being
  loaded one by one from the wiki: fewer requests, no load on wiki.gg, and icons do not break
  when the wiki renames a file. Animated GIFs become their first frame (still images); icons
  larger than 128 × 64 px (wide ones are the rarity name images) and enemies / bosses / critters
  larger than 64 × 64 px (shown at 32 px) are scaled down. Enemies, bosses and critters have
  sheets of their own, loaded only where they are shown. Links to the wiki stay only for the
  animated rarity names (Expert, Master) and the easter eggs, which keep their GIFs (bees, the
  rare bunny, the critter parade). The data has no placed / equipped item images (unused).
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

- **F1** The user can create a new progress file or open one from disk.
- **F2** Save: in Chrome/Edge the app writes directly back to the opened file (File System
  Access API). In other browsers "Save" downloads the file.
- **F2a** Download mode (no File System Access API): the browser may rename a download
  (e.g. `name(1).json`) without telling the page, so the app never claims to know the file.
  Every download gets the date and time in its name (`terraria-progress_2026-09-30_14-32.json`;
  the base name of an opened file is kept, older timestamps and `(1)` suffixes removed), so the
  newest file is easy to find. The file button and "Continue where you left off" show
  "Browser copy" (the state kept in the browser); the tooltip names the last download or the
  opened file.
- **F3** "Save as" is always available.
- **F4** Unsaved changes are shown in the UI, and the browser warns before the tab is
  closed with unsaved changes.
- **F5** A backup of the current state is kept locally in the browser (IndexedDB) after
  every change. On startup the app offers to restore it if it is newer than the last save.
- **F6** The file is JSON with a format `version` (currently 1). Loaded files are validated;
  files of another version are rejected with a message (once the format changes in a released
  version, older files will be converted when loaded). Item keys the app does not know are kept,
  not dropped.
- **F7** File content:
  ```
  {
    version,
    playthroughs: [{
      id, name, platform, difficulty, gameVersion, createdAt, updatedAt,
      checked: [itemKey],
      ignored: [itemKey],
      changedAt: { itemKey: isoTime },           // last check/uncheck/ignore/un-ignore
      bestiary: [entryId], bestiaryChangedAt: { entryId: isoTime },
      completedAt: { "<group>/<id>" | "bestiary:<group>/<id>": isoTime },   // FL17
      world: { name, guid, fileName, width, height, worldSurface, lastSyncedAt } | null,
      player: { name, fileName, lastSyncedAt } | null,
      areas: [{ id, name, x1, y1, x2, y2 }]      // tile coordinates
    }]
  }
  ```
  The selected playthrough is not in the file but remembered in the browser (switching
  playthroughs is no change to the file); older files with `activePlaythroughId` are read once as a
  fallback, otherwise the first playthrough is selected.

- **F8** Autosave (off by default; switch in the File menu, remembered in the browser, PR1): only
  where the file is written in place (Chrome/Edge) and only once the file exists on disk (after
  the first manual save / when opened). While there are unsaved changes it saves every 2
  minutes, and also when the tab is hidden or the page is closed. It never shows a dialog: if
  the browser has no write permission in this session (e.g. after a reload) autosave pauses;
  next to the label "File" the header shows "Saved 14:05" (a file icon with a check – a file on
  this computer, nothing is uploaded), "Autosave paused" or "Autosave failed" (both clickable:
  ask for permission / retry), or "save once first".
## P – Playthroughs

- **P1** A file holds any number of playthroughs.
- **P2** The user can create (name, platform, difficulty, game version – in a dialog), switch
  to, rename (inline in the header) and delete (with confirmation) playthroughs.
- **P6** The "New playthrough" dialog can optionally attach a world right away: the file is read
  immediately (name, size, chests shown), the difficulty is set from the world's game mode and
  an empty name is filled with the world name. On create the world is attached (and remembered
  like with "Attach world") and the areas dialog opens.
- **P5** The header has three parts: the logo on the left, the labeled controls centered, and
  the small buttons on the right (GitHub, theme, About, settings – LS1; logo and buttons vertically
  centered). The centered part
  holds File and a box with everything that belongs to the active playthrough – Playthrough (switch,
  new, edit, delete; the button shows the name and the icons of platform, difficulty and game
  version, their names on hover; in the settings they can be shown as three separate dropdowns),
  Player, World, one sync button for both, and the overall Progress.
- **P3** Each playthrough has one platform. Only items available on that platform are shown
  and counted.
- **P4** Platform, difficulty and game version can be changed later; checked state of items is
  kept even for items that are hidden by the new settings.
- **P4a** "Edit playthrough…" (playthrough menu) opens the same dialog as
  "New playthrough", filled with the active playthrough: name, platform, world (keep, change or
  detach), player file (keep, change or detach – PL3), difficulty, game version and the resulting
  item count; "Save". A player chosen here is attached on Create / Save; without a new world the
  sync dialog opens on its Player section.

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
- **I6a** Search mode inside the search field (items and bestiary; also used by the chest
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
- **I14** The dates are stored in the progress file (`changedAt`, F7).
- **I16** Table columns can be resized by dragging the right edge of their header (minimum
  60 px, the name column 160 px); a double-click on the edge restores the default width, "Reset
  widths" in the Columns menu all of them. Checkbox, icon and the last column have a fixed width.
- **I17** Icons in the table: "Dropped by" and "Found in" show each source's icon with its chance
  (best first), "Sold by" the vendor's head and name (the shop conditions on hover), "Obtained
  by", "Events", "Biome" and "Platforms" icons only, "Difficulty" the Expert / Master icon with
  "Expert+" / "Master only". Names on hover; after 3 (sources, vendors) or 6 entries "+N", the
  full list on hover. Sorting and searching are unchanged (by the names / the best chance).
- **I15** Column presets ("View": favorites as buttons, all in a dropdown – LS2): Overview,
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
  at the same height, so the list below does not jump (can be switched off in the settings).
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
  included; a parent shown because a subentry matched can be selected too). Enter selects the highlighted option (or
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
- **FL11** "Move completed filters" (in the menu next to the filter search, FL19; on by default): options at 100 % over
  the whole playthrough (not the current filters and search) move to the "Completed" section,
  above "Hidden". Completed options stay usable and follow the filter search; their counts follow
  the current filters like everywhere (greyed out without matching items). A completed option
  takes its sub-options along. The groups Progression and Crafting are no collections: their
  options stay in their group (like FL15, FL16).
- **FL12** Both sections list their options under the name of their group, are collapsed by
  default and only appear when they have options. Hidden options and the completed toggle are
  remembered in the browser (PR1); hidden options separately for items and bestiary, the
  completed toggle for both.
- **FL13** "Open all / close all" button next to the filter search: opens or closes every filter
  group and the "Completed" / "Hidden" sections; single groups can still be toggled afterwards.
- **FL14** Every group header also shows how many of its options are completed, e.g. "✓ 2/18"
  (top-level options over the whole playthrough, like FL11; hidden ones left out; green when
  all are complete).
- **FL15** Group "Almost done" (items and bestiary): the options closest to completion – 3, 5
  (default), 10 or 20, chosen in its header (remembered in the browser, one setting for both).
  Each row has a × that leaves the option out of "Almost done" only (it stays in its group; the
  next one fills up; a toast with Undo); while options are left out, "↺ N" in the header brings
  them all back (remembered in the browser, per sidebar). The options are shown as
  duplicates of the options in their groups (same selection; the group name is shown with each).
  Ranked by percentage, ties by fewer missing; only options with at least 5 items, at least one
  obtained and not complete; hidden options and the groups Progression and Crafting are left
  out; subgroups count. Computed over the whole playthrough (not the current filters), so the
  list does not change while filtering. It is a group like the others (open/closed remembered,
  reorderable in the settings) and starts at the top, also for a saved group order.
- **FL16** "Filter complete!": when checking or ignoring items (by hand, bulk actions or a world
  sync; bestiary entries too) brings filter options to 100 % over the whole playthrough, a
  toast at the top centre in the style of Terraria's achievement pop-up (option icon, gold
  title, dark blue panel) and a 3 s burst of pixel confetti in the game's confetti colours.
  Changes within 0.4 s give one toast per kind – item filters and bestiary filters separately
  ("12 item filters complete!", "3 bestiary filters complete!", the first three named, "+9
  more"). Not on loading a file, switching playthroughs or changing settings; hidden options
  and the groups Progression and Crafting are left out; a sub-option completed together with its
  parent is part of it (not counted or named separately, like the "Completed" section of FL11).
  Setting "Celebrate completed filters"
  (on by default); no confetti with reduced motion.
- **FL17** The time a filter option was completed is kept per playthrough in the progress file
  (`completedAt`): set when the option reaches 100 % over the whole playthrough (item and
  bestiary filters, hidden ones too), removed when it is no longer complete. Shown in the
  "Completed" section next to the option ("today, 14:05") and in the tooltip of every completed
  option ("Completed today, 14:05").

- **FL18** Group "Sources & sets": filter by any NPC, container or set – too many for a sidebar
  list (about 800), so the group shows only the picked ones, and "+ Add an NPC, container or
  set…" opens a searchable list (sections NPCs – bestiary entries; Containers & bags – chests,
  crates, grab bags, trees; Sets – D18c), each with icon, name, kind and "obtained / total".
  - an NPC's items: its drops (its variant's, like the NPC card), its treasure bag's contents and
    its shop; a container's: what it contains; a set's: its pieces. In the playthrough's
    difficulty, without rows only in special seeds (CO6)
  - picked entries are options like the others (progress, select / unselect, chips) and stay in
    the group until removed with their × (always shown); remembered per playthrough with the other view settings (PR)
  - not in "Almost done", "Completed" or the completion toasts (like Progression and Crafting)
  - "Show its items in the table" in the NPC card, the source card and the "Set" section: picks
    the entry, clears the other filters and the search, selects only it and switches to the
    Items collection
- **FL19** The options of the filter list are in a menu (☰) next to the filter search, also in
  the phones' filter dialog: "Only filters with matches" (off by default, remembered in the
  browser: options without items for the current filters and search are left out instead of
  grayed out; selected ones stay; "Almost done" keeps its list by absolute progress and only
  leaves out those of its options without matches, no others fill up), "Move completed filters" (FL11), "Hide filters" (the edit
  mode with the eye per option) and "Open / Close all filter groups". The button is highlighted
  while "Only filters with matches" or "Hide filters" is on.

## LS – Layout and settings

- **LS0** The top bar groups its fields in cards: File, the playthrough box (P) and the View
  switch (items / bestiary) each in their own card.
- **LS1** Top right, four small icon buttons: GitHub (link to the repository), theme (cycles light →
  dark → system, the icon shows the current one), About (ⓘ, G4a) and settings (⚙, opens the
  settings dialog).
- **LS2** List header in three rows: search (with the Fuzzy / Exact switch inside the field);
  Show (all / missing / …), progress of the filtered items and bulk actions; views. The views
  are a dropdown with all presets; a star in the dropdown marks a view as favorite (default
  Overview, Where to get it, Progression) – favorites are also shown as buttons next to it.
- **LS3** Settings dialog (⚙ → Settings…), everything remembered in the browser (PR1):
  - Appearance: theme; density (compact – default – or comfortable: compact has lower table
    rows, smaller icons and tighter filter options; the explanation below the row, over the full
    width)
  - Item list: order of the views; "Dim items not available yet" (MS8)
  - Filter sidebar: reorder the filter groups (items and bestiary; single options are hidden in
    the sidebar itself, FL10); progress bars of the single options on / off
  - Detail panel: show / hide and reorder its sections
  - Other: celebrate completed filters (FL16), easter eggs (G8)
  - each part of the dialog in its own bordered box
  - "Reset all settings"
  Always shown, without a setting: the bestiary progress in the top bar, the progress of the
  filtered items and the filter bar (also without active filters, so the list does not move).
  Platform, difficulty and game version are icons in the playthrough button and changed in the
  playthrough dialog.

- **LS4** Views are customizable: a view has a name, its columns **in order**, and a sorting.
  In the views dropdown every view has ✎ (edit) and ☆ (favorite); below the list "New view…"
  and, while the columns are "Custom", "Save current table as view…". The edit dialog: name,
  columns (ordered list with ↑↓ and remove, "Add column" grouped like the Columns menu), sorting
  (a column or none, ascending / descending), favorite, "Take current table"; built-in views get
  "Restore default" (only when changed), own views "Delete". The table shows the columns in the
  order of the applied view (columns added via the Columns menu come after them). The order of
  the views in the dropdown is set in the settings (↑↓). Stored in the browser; changed built-in
  views only keep their differences, so unchanged ones follow updates of the app.

- **LS5** The filter sidebar and the docked detail panel can be resized by dragging their inner
  edge (sidebar 260–560 px, default 352; detail panel 320–760 px, default 448; each at most 45 %
  of the window). Remembered in the browser; double-click on the edge resets, arrow keys on the
  focused edge change it in steps. The detail panel's buttons stay on one line: in a narrow
  panel they show only their icon ("Obtained" keeps its text longest).
## MO – Phones

Below 640 px width (phones) the layout changes; tablets and desktops stay as they are (G3).

- **MO1** Slim top bar (one row): logo, the playthrough button,
  the Items / Bestiary switch and a menu (☰); the overall item progress as a thin line under
  the bar. The menu holds what the desktop top bar shows besides: File (with the autosave
  status), Player, World, the sync button, the item and bestiary progress bars, settings, About,
  theme and GitHub.
- **MO2** Compact list header: row 1 the search field ("Search…"), then Filters, sorting and
  bulk actions as icon buttons (the number of active filters as a badge); row 2 Show (all /
  missing / …) and the filtered numbers. The filter bar only with active filters. Views and
  columns do not apply to the cards.
- **MO3** Items as cards instead of the table: per item a row with the checkbox, icon, name and a
  second line (first category, "obtained by" as short names, available after); tapping it opens
  the detail sheet. Obtained items marked like in the table (green), ignored ones faded.
  Sorting (the sort button): name (or relevance while searching), rarity, added in, available after, last
  changed. Virtualized like the table; Enter from the search opens the first card (S4). The
  density setting applies to the cards too (also the bestiary's, MO5): comfortable 60 px with a
  32 px icon, compact 48 px with a 24 px icon and smaller text (about 14 instead of 11 cards on
  a phone screen).
- **MO4** The detail panel is a full-screen sheet with the back button (already the overlay on
  narrow screens, ID). Touch: a swipe from left to right goes back to the previous item like the
  back button; on the first item it closes the sheet (the sheet follows the finger; past a third
  of its width or with a quick flick, otherwise it springs back).
- **MO5** Bestiary as cards too: checkbox (unlocked), icon, name, second line type and where /
  when; on the right the drops progress. Tapping opens the NPC card.
- **MO6** Touch (any device with a coarse pointer, also tablets): comfortable density by default
  (as long as the layout was never changed in the settings); keyboard hints (shortcut keys, ↵ / ↑↓ hint bar)
  hidden, also the dashed highlight of the search's match (filters, rows, cards, the NPC
  suggestion); buttons that are only icons (× of "Sources & sets", eye, sort, …) at least 36 px; on
  the cards, information that the table only shows on hover is written out.
- **MO7** On-screen keyboard: text inputs use 16 px on touch screens (iOS zooms into smaller ones
  when they get the focus); dialogs do not move the focus into their first input on touch
  screens (the keyboard would open while the dialog appears; except the source picker, whose
  search is its purpose); on phones dialogs sit near the top and scroll inside, their close
  button sticks to the top and their footer (Create, Save, …) to the bottom (below 768 px); the
  Filters dialog keeps its title and close button above the scrolling filters; the page shrinks
  with the keyboard on Android (`interactive-widget=resizes-content`; iPhones – Safari and
  Chrome – keep the page size, hence the sticky buttons).
- **MO8** Toasts stay clickable while a dialog or sheet is open (they switch off the page outside
  themselves), and a tap on a toast does not close the dialog: e.g. "Undo" after hiding a filter
  in the Filters dialog.

## PR – Remembered view settings

- **PR1** Stored in the browser (localStorage), not in the progress file: visible table columns,
  their widths, the table's column sorting, and the option order (default / A–Z) per filter group,
  and which filter groups are open or closed. They are restored on the next visit. Settings that
  no longer apply (e.g. a removed column) are ignored.
- **PR2** Per playthrough the browser also remembers what the list showed: selected filters,
  search, "Show" switch, items or bestiary, and the item in the detail panel. It is restored
  when the playthrough becomes active again – on the next visit or after switching playthroughs.

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

- **B5** Drop groups: many bosses, chests, crates and grab bags drop one item of a group
  ("One of the following 8 items will always be dropped" – Plantera's weapons; Orca: Diving
  Helmet 5 % or Shark Fin 95 %), or a group with a chance of its own ("1/12, then one of these
  14" – the voice accessories in a Gold Chest, 1/168 each). The Cargo Drops table does not have
  this; the page sources do: `|:group:start|<text>` … `|:group:end` (each row with its chance) or
  `|:group:start|<amount>|<chance>` … (rows without a chance) in the drop lists. About 112 pages
  (wiki search `insource:"group:start"`; the treasure bags are on their boss's page).
  - step 1 downloads the source of these pages (found by the search) into `raw/drop_groups.json`
  - step 2 reads the groups and attaches them to the drop rows of the same page and item
    (`group` in `drops.json`; its text, amount, chance, how many of its items drop and their
    number in `groups`). The same group listed twice (per layer, normal and treasure bag) counts
    once; an item in several groups takes the one that fits the row's game mode, amount, source
    (all items of the group dropped by it, same variant) and chance (the Ogre's tiers). Where the
    wiki lists the bag's group apart, the group is given per game mode. Containers with other
    items per layer (Gold Chest: Underground, Cavern, lava layer; Frozen Chest) have one Drops row
    per item with the chances per layer in notes; these rows are split into one drop per layer
    (`[drop_areas]` in `mapping.toml`, the layer as variant), and a group under a layer's page
    heading belongs to that layer. Rows that still fit several groups (Shadow Chest potions;
    Toy Sled of both Ice Mimics) stay without a group; step 2 names these pages
  - "Contains" shows one block per place of the item (Gold Chest: caverns, Dungeon, Pyramid) and
    in it one list per layer ("In every layer" last), like the variants of an NPC
  - NPC cards and "Contains" show the rows of a group together in a framed block with the wiki's
    text or "1/12: one of these 14" and how many of them are obtained; groups that are
    conditions ("Only in Corrupt worlds") are framed too. "Dropped by" in the item card notes
    "one of 8" (the full text as tooltip)
  - expected drops and "at least once" stay as they are (each item's own chance is correct)
- **B6** Extractinator: what the Extractinator and the Chlorophyte Extractinator turn blocks into.
  Not in the Cargo tables; the pages "Extractinator" and "Chlorophyte Extractinator" (their
  source, step 1 like the vendor pages) have tables in "Possible conversions": per input (Silt /
  Slush, Desert Fossil, Glowing Moss, junk, Poo) the results with chance and amount, some only in
  Pre-Hardmode or Hardmode ("Hardmode only": Cobalt … Titanium Ore); and "Special conversions":
  an input always becomes another item (Hive → Honey Block; with the Chlorophyte Extractinator
  about 50 swaps: Copper ↔ Tin Ore, Demonite ↔ Crimtane, Shadow Scale ↔ Tissue Sample, the
  biome blocks, Dungeon bricks).
  - step 2 writes `extractinator.json` (machines, and per result: machine, input items, chance,
    amount, Pre-Hardmode / Hardmode only, conversion); unknown item names are reported
  - "Obtained by" gets "Extractinators" with the sub-options "Extractinator" and "Chlorophyte
    Extractinator" (`[obtain]` entries with `parent`)
  - milestones (MS): a result counts from the latest of its machine, its input and its phase
    ("Hardmode only": Wall of Flesh). The Chlorophyte Extractinator counts from "All three
    mechanical bosses" (Chlorophyte needs a Pickaxe Axe / Drax from Hallowed Bars); its own item
    too (the wiki tags it "plunder", which made it a plain Hardmode item)
  - item card: collapsible section "From the Extractinator": machine, input (opens its card),
    chance and amount, Pre-Hardmode / Hardmode only; conversions as "Converts Demonite Ore"
  - the machines' item cards: collapsible "Results": one list per input, like "Contains"
  - table column "Obtained by" shows the Extractinator icons; no expected drops (no kills)

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
  also written `{{shop_row|…}}`; downloaded with the other page sources; the vendor list is
  `[vendors]` in `mapping.toml`).
  Each shop row gives the item, the vendor and the condition as text, e.g. "In Hardmode, during
  night, in a Jungle, when Plantera has been defeated." Items of the shops that the Items table
  does not tag with the vendor get the vendor too.
- **CO2** Condition texts of shop rows and drop rows are mapped to condition ids with the links
  and phrases in `mapping.toml`; negated parts ("before defeating …", "except in Remix worlds",
  "but not …") give no id. Drop rows: the chance text and the notes of the custom column (both
  `<span class="note">` and `<div class="note-text">`, e.g. Green Cap "(Only if name is
  Andrew)", Chain Knife "(In Remix worlds)"); "In regular worlds" is the default and dropped.
  A note on one of several chances ("3.33% · 3.11% (Hardmode)": the Present's other chance in
  Hardmode) is no condition of the row. Bosses named as alternatives ("when either the Eater of
  Worlds, Brain of Cthulhu, Skeletron, or Wall of Flesh have been defeated") give the earliest
  of them (the order of `[milestones]`), not the one next to "defeated".
  The build reports unmapped links. Types:
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
  the conditions of its sources in that group. Containers, crafting, fishing, world items and
  vendors without a shop row are unrestricted sources (D8b); rows only in special seeds do
  not count. E.g. Leaf Wings → Night, after Plantera; Glowstick (Merchant at night,
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
- **CO6** Rows only in special world seeds (shop rows and drop rows with a seed condition, e.g.
  the Princess's stock "In Celebration Mk 10 and Zenith worlds", "I am error" chests, Remix
  drops) – and drops for worlds without a structure, which replace it (the Jungle Temple's items
  from Plantera "when the Jungle Temple is not present", Dungeon bricks from the Eater of Worlds,
  a Hellforge from Skeletron; their condition ids start with "seed-" too) – are shown in the
  detail panel, but count for no filter and no milestone: no vendor,
  obtain method, event, biome, time of day, condition, boss or container. A wiki tag that only
  these rows explain is dropped too (e.g. "Found in chests & pots" of the Chain Knife). A row
  that also describes the regular case in a sentence without a seed ("Always available. Only
  … in worlds with For the Worthy.", "In a Jungle. Anywhere in worlds with …") is a regular row
  with the conditions of those sentences.

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
    Dungeon → Skeletron, in the Jungle Temple → Plantera (`[milestone_biomes]`); town NPCs →
    their move-in; other enemies → Start
  - shop rows: the later of the vendor's move-in (`[vendors.*] milestone`, e.g. Cyborg →
    Plantera) and the row's conditions (after a boss, Hardmode)
  - recipes: the latest of the crafting stations (the earliest item providing each) and the
    ingredients ("Any …" groups: their earliest item); shimmer: the source item (of a group
    like "Any Fruit" the earliest), and the boss of its note (RC4). Items whose only sources go
    in a circle (Obsidian from Obsidian Walls and back) or that have no source data count from
    Start; what needs them keeps its other requirements (the Obsidian Shield its Cobalt Shield)
  - containers: `[milestone_sources]` (e.g. Shadow Chest → Skeletron, biome chests →
    Plantera), else Start; rows only in special seeds do not count. The Extractinators: the
    machine, one of the inputs, and Hardmode for the results only then
  - Strange Plant rewards: the conditions of their heading; fishing, quest rewards, player
    death → Start. Fishing in lava → Eater of Worlds / Brain of Cthulhu (`[milestone_items]`,
    and the Obsidian Crate in `[milestone_sources]`): it needs lava bait, caught with a
    Lavaproof Bug Net (Hellstone Bars), or a lavaproof hook, which comes from the lava crates
    (the Hotline Fishing Hook only in Hardmode) – Obsidian Crate and its contents, Flarefin
    Koi, Obsidifish, Demon Conch, Bottomless Lava Bucket, Lava Absorbant Sponge, the lava
    critters. Not counted: the Golden Bug Net, a rare Angler reward, catches the bait too
  - methods only the wiki's tags or a name rule give, without data of ours ("Collected in the
    world", "Caught with a Bug Net", "Other form of an item"; "Dropped by enemies", chests and
    bags without a drop row) → Start, but only for items the data has no
    source for: the tags are per wiki page, also for items they do not hold for (every
    chandelier is "collected in the world"), so a later source in the data (a recipe, a vendor,
    a drop) counts instead – Steampunk Chest → any mechanical boss, the Dungeon's paintings →
    Skeletron. Items for which the tag holds anyway have a rule in `[milestone_items]` (Ice
    Block, Demonite Ore, Sunflower → Start; Lihzahrd Chest → Plantera)
  - minimum: Hardmode items (the wiki's flag) → Wall of Flesh, whatever their sources say – the
    source stays the reason ("Fished, in Hardmode", "From boss treasure bags, in Hardmode");
    `[milestone_items]` (name patterns) for what the
    data does not know, e.g. mining: Hellstone → evil boss, Hardmode ores → Wall of Flesh,
    Chlorophyte Ore → all three mechanical bosses, Meteorite → evil boss (a meteor lands only
    after the Eater of Worlds / Brain of Cthulhu; the Meteor Head too, `[milestone_sources]`); enemies in the wiki's category "Hardmode-only
    NPCs" → Wall of Flesh (by name or wiki page); `[milestone_sources]` for enemies that appear
    later than their biome says (post-Plantera Dungeon enemies, Old One's Army tier 2, the Solar
    Eclipse enemies after Plantera, the cultists at the Dungeon after Golem) and for
    exceptions to the category (pre-Hardmode enemies on a shared page, missing ones)
  A shop row for players who have an item ("… a Nail Gun in their inventory") needs that item
  (Nail → Plantera, Portal Gun Station → Moon Lord); a reward page can count from a milestone
  (`[obtain.*] milestone`: Strange Plants only grow in Hardmode).
  The build writes `milestones.json` (with item counts) and reports (DU1) the Hardmode items
  whose sources *in the data* (drop rows, shop rows, recipes, …) say earlier: there a gate is
  missing in `mapping.toml` – or the flag is wrong. A rule in `[milestone_items]` decides it:
  `= "wall-of-flesh"` (the flag holds: Balla Hat, after the Frost Legion) or a later milestone.
  Where the flag is wrong, `[hardmode] pre_hardmode` in `mapping.toml` takes it from the item
  (no "Hardmode" badge either): Defender's Forge (the Tavernkeep sells it without a
  condition), Spectre Goggles, Bewitching Table, Gothic Brick Wall, three paintings.
- **MS3** Filter group "Progression" (replaces Pre-Hardmode / Hardmode): the milestones with
  icons. A switch in the group: "up to" (default, cumulative – a milestone contains every item
  available by then, e.g. Skeletron includes King Slime's) or "exactly" (only what becomes
  available at that milestone). The switch is remembered in the browser (PR1).
- **MS4** Detail panel: "Available after: <milestone>" with the reason (e.g. "Crafted – needs
  Chlorophyte Ore", "Sold by the Cyborg", "Dropped by Plantera"; without more precise data the
  obtain method's name as in "Obtained by", e.g. "Collected in the world"; "…, in Hardmode" when only
  the wiki's Hardmode flag puts it there). Table column "Available after"
  (first of group Source, with the milestone icon, the reason on hover), sorted in milestone
  order.
- **MS5** Progress of the loaded world: the world file stores which bosses were defeated
  (`downed…` flags, Hardmode, the Old One's Army tiers). A milestone counts as reached when its
  boss is defeated (Eater of Worlds / Brain of Cthulhu: either; Wall of Flesh: Hardmode; any /
  all three mechanical bosses; Duke Fishron / Empress of Light: either). Eater of Worlds and
  Brain of Cthulhu share one flag: the world's evil decides (both in a "drunk world").
  Read again with every load / reload of the world; nothing is saved.
- **MS6** With a loaded world, the Progression group marks reached milestones (icon, tooltip
  "Reached in <world>") and highlights the next one; the Bosses group marks defeated bosses,
  event bosses included (Pumpking, Ice Queen, Martian Saucer, the pillars, Old One's Army, …).
- **MS7** Option "Available now" at the top of the Progression group (only with a loaded
  world): the items whose milestone is reached in the world – also when bosses were defeated
  out of order. Works like the other options (counts, progress, combinable); without a loaded
  world it is ignored. Not celebrated as completed and no completion date (it changes with the
  world). Limitation: an item has one milestone (the latest of what it needs, in the usual
  order), so "available now" can be slightly early when bosses were skipped.
- **MS8** Setting "Dim items not available yet" (Layout, off by default): with a loaded world,
  item rows whose milestone is not reached are dimmed in the list. Also switched in the filter
  group Progression, under "Available up to / exactly at" (greyed out without a loaded world).

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
  values) and details (item id, internal name, platforms). The platform images of a tooltip
  ("Right click to open / L2 to open (PlayStation) / …" on crates and bags) are shown as small
  icons, as on the wiki (static files in `web/public/icons/platforms/`; the pipeline turns the
  known images into `{icon:<id>}` markers); the Tooltip column shows their names.
- **ID3** The name column of the table shows the name (opens the detail panel) and, aligned at
  its right edge in every row, "Find in chests" and "Open on the wiki"; the last column only
  has "Ignore". Expert/Master-only items (about 100) show the wiki's Expert or Master icon right
  after their name (tooltip "Expert & Master only" / "Master only") instead of a column of their
  own; the "Difficulty" column is in no view any more, only in the Columns menu (for sorting).

## ND – NPC details

- **ND1** The detail panel shows other cards than items, in the same panel, history and back
  button (ID): an **NPC card** for every bestiary entry, a **source card** for drop sources that
  have neither a bestiary entry nor an item (trees, boss parts). Drop sources that are items
  (treasure bags, crates, chests) open their item card.
  Rows that open another card (drops, "Dropped by" / "Found in", "Sold by", shop) are clickable as
  a whole, not only their name – except when text in them was selected (copying a chance) or the
  click was on a link of their own.
- **ND2** NPC card: icon, name, type, bestiary number and stars, wiki link, the "Unlocked"
  checkbox (bestiary progress of the playthrough – also when opened from an item); where and
  when it appears (biomes, time of day, events); with a loaded world its kills. **Drops**: every
  item it drops with chance and amount for the playthrough's difficulty, game modes, conditions
  (rows only in special seeds with their seed), obtained items marked, with a loaded world the
  expected drops. Bosses: the drops of all their parts, and the contents of their treasure bag as
  an extra section. Drops of an enemy's variants (the wiki's notes: Pre-Hardmode / Hardmode Mimic,
  Dark / Light Lamia, Zombie variants, Old One's Army tiers; rows without a note can be named in
  `[drop_variants]`) are listed per variant, so the chances of each add up; drops of every variant
  come last. The item card names the variant under "Dropped by". A drop source belongs to the
  entry of the same name, else to the entry with its NPC id (a source of a page with variants
  carries the id of the page's first NPC row: "Zombie" would be Zombie (Sweater)); an entry
  without a source of its own (Zombie (Female), Scarecrow (Pumpkin Head), Diabolist (Red)) gets
  the source named like its wiki page, without the rows the wiki binds to other variants (Torch
  only for the Torch Zombie). The bestiary's "Drops" column uses the same. **Sells** (town NPCs that are vendors): every item of their shop with its
  condition (moon phases as icons), obtained items marked. Other entries on the same wiki page
  (variants) are listed.
- **ND3** Item card: a section "Contains" for items that are drop sources (treasure bags,
  crates, chests): their drops like ND2.
- **ND4** Everything that refers to an NPC or a source opens its card: the sources in "Dropped
  by" / "Found in", the vendors in "Sold by"; items in an NPC card open their item card. The
  view does not change: from an item one stays in the item collection, in the bestiary one stays
  in the bestiary.
- **ND5** The bestiary list opens the NPC card when a row is clicked (not the checkbox or link),
  docked like the item details (overlay on narrow screens). Column "Drops": how many different
  items the entry drops and how many of them are obtained (e.g. "5 / 12"), sortable.

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
- **S3** Keyboard shortcuts: the key left of 1 (§ on Swiss/German keyboards, ` on US ones – by
  its position) or "/" jumps to the item search (bestiary search in the bestiary view), Shift +
  that key to the filter search. The text is selected, so typing replaces it. Not while typing in
  another field or with a dialog or menu open. The key is shown in the empty, unfocused field
  (its label from the keyboard layout where the browser knows it). Escape clears the search, a
  second Escape leaves the field.
- **S4** While something is searched, the first row of the list (in its sort order) is outlined
  and Enter opens its card in the detail panel; ↑/↓ move through the matches (wrapping around,
  the row is scrolled into view). A line under the field names it ("↵ open Night's Edge · ↑↓ 2
  of 117"), like the filter search. Item list and bestiary.
- **S5** NPCs in the item search: an "NPCs" switch in the field (next to Fuzzy / Exact; on by
  default, remembered in the browser; the placeholder then says "Search items or NPCs by
  name…"). While something is searched, the best-matching bestiary entry (its name contains every
  searched word; the same name first, then names starting with it, then shorter names) is shown
  under the field with icon and type, plus "N more NPCs – show in the bestiary" (switches to the
  bestiary with the same search). A click opens the NPC card in the detail panel. With the
  keyboard it comes before the item rows: Enter opens it, ↓ goes on to the items. Shown while the
  field has the focus.
- **S6** A click on a row of the item list or the bestiary gives the table the keyboard: ↑/↓
  move the dashed highlight from that row, Enter opens the highlighted card, Escape or leaving
  the table ends it.

## W – World file

- **W1** A world file (`.wld`) can be attached to a playthrough. The file is read locally
  and never uploaded; only its name, GUID and size are stored in the progress file.
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
- **W6a** The world's name is set in italics wherever it appears in texts (dialog titles,
  playthrough dialog, messages) – not on the World button in the header.
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
- **W10** Steam Cloud files: Terraria's cloud saves are in Steam's folder
  (`C:\Program Files (x86)\Steam\userdata\<number>\105600\remote\players` / `…\worlds`), which
  Chrome and Edge do not open with the file picker of the File System Access API (a system
  folder). The World and Player menus (Chrome/Edge) offer two entries: "Attach non-Steam Cloud
  world" (the normal picker) and "Attach Steam Cloud world" (the classic file dialog,
  `<input type="file">`); the explanation and the path are in their hover texts. A file chosen
  the classic way cannot be read again by itself, like in Firefox and Safari: the playthrough
  remembers that (in the browser), and reconnecting / reloading / syncing opens the classic
  dialog again. Choosing a file the normal way switches back. The playthrough dialog (P6, PL3)
  offers both too: two buttons "Non-Steam Cloud…" / "Steam Cloud…" (with the hover texts) and
  "Change…" with both in a menu, with one sentence on how they differ.
- **W11** Changes in the game: a loaded world (and player) is a copy from the time it was read.
  - "Sync with world…", "Sync with player…" and the quick sync button (W8) read the file again
    before the sync dialog opens: the remembered file without a dialog (Chrome/Edge; the
    browser may ask for read access once per session), otherwise the file dialog (classic
    files, Firefox/Safari). Cancelling the dialog does not open the sync. Unchanged files (same
    modification time) are not parsed again.
  - The World / Player menus always offer "Reload {file}" for an attached file the app can read
    again (also while it is loaded).
  - Coming back to the tab (it becomes visible / gets the focus), the app checks whether a
    loaded, remembered file has changed (only with read access already granted, nothing is
    parsed) and shows a toast "World changed in the game" (or player, or both) with a "Sync"
    button; once per change.

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
- **CS5** The area selection (areas, displays, only player chests) is remembered per playthrough
  in the browser, like the sync dialog's. Default: the playthrough's own areas (Full World if it
  has none), only player chests, displays included.

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
  show in their own section and do not count for the crafting filter. The note of the Shimmer
  page (the row's `resulttext`) is its condition: "#note_post_moon_lord" → after Moon Lord (the
  Bottomless Shimmer Bucket, Rod of Harmony, Terraformer), "#note_post_golem" → after Golem,
  "#note_moon_3" → a moon phase (the Luminite brick variants); shown under the item in the
  Shimmer section ("after Moon Lord", "Full moon"). Unknown notes are reported.
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
  World menu ("Sync with world…") and the sync button in the top bar (the bestiary toolbar has
  none).
- **BE6** Separate view: "Items | Bestiary" switch in the header. The bestiary view has its own
  filters (Type, Biome, Time of day, Events, Added in – faceted like FL3/FL4), its own search,
  Show all / missing / unlocked, and a table: in-game number (default order), icon, name, type,
  biomes, stars, kills in the attached world, unlocked checkbox, wiki link, last changed.
- **BE7** Header: a second progress bar for the bestiary below the item progress.
- **BE8** Progress file: `bestiary` (unlocked entry ids) and `bestiaryChangedAt` per
  playthrough (F7).

## BL – Expected drops ("bad luck")

- **BL1** With a loaded world, the kill counts of its bestiary give the expected number of drops
  per item: Σ kills × chance over all enemies that drop it (chance of the playthrough's
  difficulty) × the average quantity per drop (3–5 → 4; the first number or range of the wiki's
  text), and the chance to have got it at least once: 1 − Π (1 − p)^kills (per drop, not per
  item).
- **BL2** Drop sources are matched to bestiary entries by NPC id, by name and by wiki page (all
  variants of an enemy count, e.g. every Zombie). Drops the wiki binds to one variant (Torch:
  Torch Zombie, Gel: Slimed Zombie) keep its NPC ids (`npcIds` in `drops.json`) and count only
  that variant's kills; variants without an entry of their own are skipped. Treasure bags use the kills of their boss
  (the highest of its parts, e.g. The Twins). Sources without bestiary data (Shadow Orbs,
  slimes with an item inside, …) are left out.
- **BL3** Column "Expected drops" (only offered while a world is loaded): `2.4× · 91%`, sorted by
  the chance; empty for items no enemy drops. Drops bound to a condition, event or biome are
  counted with every kill (the world does not record where or when an enemy died) and are
  marked "≈". A missing item with a chance of 95 % or more is highlighted (amber). The tooltip
  lists every source: kills × chance = expected.
- **BL4** Built-in view "Bad luck" (expected drops, in chests, drops, conditions, events, biome,
  available after; sorted by the chance): only selectable while a world is loaded.
- **BL5** Detail panel: each enemy drop source shows its kills in the loaded world.
- **BL6** The amount of the item in the chests the player placed, whole world – the same chests as
  "craftable from your chests" (RC) – is part of the "Owned" column (PL5); empty for none.

## PL – Player file

Status: parser done (PL1, PL2), app integration in progress (PL3–PL5).

- **PL1** Parser package: a self-contained package in this repo, `packages/terraria-player-file/`
  (own `package.json`, no imports from the app, own tests, MIT license), used by the web app like
  an external library. Written from scratch (no code from the decompiled game or other tools).
  Once stable and after surviving a Terraria update it may move to its own repository and be
  published on npm (accounts and package name by the repo owner).
  The format is documented in the package's `FORMAT.md` (worked out from the test characters,
  each field marked verified / plausible / unknown), the approach in its `README.md`.
- **PL2** Reading: `.plr` files are decrypted in the browser (Web Crypto AES-CBC with the game's
  fixed key) and parsed in a Web Worker; nothing is uploaded. Supported: the 1.4.x formats up to
  1.4.5; older or unknown newer versions give a clear error (or, where possible, what could be
  read and what is missing, like the world file W7). Result: name, difficulty (incl. Journey),
  game version / file version (1.4.5 = 326), and per item id + stack + prefix:
  - inventory (50 slots, coins, ammo); the trash slot is not saved by the game
  - equipment: armor, accessories, vanity, dyes; misc equipment (pet, light pet, minecart, mount,
    hook) and their dyes; the 3 equipment loadouts
  - storages: Piggy Bank, Safe, Defender's Forge, Void Vault (40 slots each)
  - permanent upgrades used: Life Crystals, Life Fruit, Mana Crystals (from max life / mana),
    Demon Heart, Vital Crystal, Aegis Fruit, Arcane Crystal, Galaxy Pearl, Gummy Worm, Ambrosia,
    Artisan Loaf, Torch God's Favor, Minecart Upgrade Kit
  - Journey research (item → amount researched), read now, used later (v2)
  Test files: the owner's characters for development; for the package's own tests fresh, clean
  characters (one Journey, one Classic) with items in every storage and a few used upgrades.
- **PL3** Attach a player to a playthrough (one per playthrough for now), like the world (W): in
  the playthrough dialog (P4a, also when creating one; above the world) and in the "Player" field
  in the header (before "World"), with a menu: attach / choose another file, reload
  (Chrome/Edge remember the file), sync, detach; a quick button reconnects an attached player that
  is not loaded. "Continue where you left off" also reloads a remembered player file. The
  progress file stores a reference per playthrough (name, file name, last sync – F7),
  not the contents; the parsed player is kept for the session only. Files of unsupported game
  versions give a clear message.
- **PL4** Sync (SY): the sync dialog also opens with only a player loaded. Section "Inventory" (next to "Chests" and "Bestiary"):
  checkboxes per storage (inventory incl. coins and ammo, equipment / misc slots / loadouts, Piggy
  Bank, Safe, Defender's Forge, Void Vault) and "permanent upgrades used", all on by default; the
  list of items to be checked can be deselected like the world's. Used permanent upgrades count
  as obtained (Life Crystal, Life Fruit, Mana Crystal, Demon Heart, Torch God's Favor, Artisan
  Loaf, Vital Crystal, Aegis Fruit, Arcane Crystal, Galaxy Pearl, Gummy Worm, Ambrosia). The
  player never unchecks anything; with a player loaded, the world's "checked but not found"
  list leaves out what the player has, in any storage, and the used permanent upgrades.
- **PL5** Column "Owned" (BL6): the amount in the player's chests (whole world)
  plus, with a player loaded, everything on the player; the tooltip splits it up ("12 in chests ·
  3 in the Void Vault · 1 in the inventory"). Offered while a world or a player is loaded; the
  "Bad luck" view (needs a world) shows it.

## v2 / later

- **Area map stage 2:** draw the actual world (block, wall and liquid colors) behind the
  schematic map (AM): own tile reader writing colors straight into a pixel buffer (the library's
  per-tile objects need too much memory), a map color table (license to check if taken from a
  tool like TEdit), tiled/scaled canvas (Safari canvas size limit) and caching per world.
  Extras: chest search hits and sync results on the map.
- **Clickable events, biomes and conditions** in the details (ND): open a card of the event /
  biome (its enemies, items, vendors) or apply the filter.
- **Cloud storage for the progress file:** open and save the progress file in Dropbox (first)
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
- **Drop groups – open cases (B5):** rows that fit several groups stay without one: the
  Shadow Chest's potions (the same potion in two groups of the chest) and the Toy Sled of both
  Ice Mimics (one Drops row for both variants, a group per variant) – could be solved with a
  group per variant or a manual mapping. The obtained counter of a group block counts its rows,
  so alternatives per world ("Silver / Tungsten Bar") give "0 / 4" under "one of these 2" –
  count rows of one alternative once. The NPC search's "N more" counts plain name matches, the
  bestiary's fuzzy search may find one or two more.
- **Set bonuses** (D18c): scrape the set bonus of each armor set from its page and show it in the
  "Set" section.
- **Player file extras (PL):** Journey research – column with the progress ("37/100"), filter
  "fully researched / not yet", optional sync of researched items; chest search also finds items
  on the player (inventory, banks, loadouts – no map marker); several players per playthrough
  (all characters, or friends in multiplayer).
- **Extended end credits (G8):** more blocks in the credits of a completed playthrough, each only
  when its data is there (a block without data is left out):
  - top 5 enemies killed (kill counts of the loaded world's bestiary)
  - top 3 days with the most items / bestiary entries checked (Playthrough.changedAt /
    bestiaryChangedAt)
  - with a loaded world (and player): top 3 blocks owned by count, top 5 other items owned by
    count (chests plus player, like the "Owned" column)
  - more ideas: the first item checked, the longest streak of days with progress, the busiest
    hour of the day, coins owned in total, Angler quests completed and play time (player file),
    the bosses in the order of their first defeat
