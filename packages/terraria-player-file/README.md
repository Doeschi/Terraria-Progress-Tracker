# terraria-player-file

Read Terraria player files (`.plr`) in the browser or in Node: inventory, equipment and loadouts,
Piggy Bank, Safe, Defender's Forge and Void Vault, permanent upgrades, Journey research and the
character's statistics (play time, deaths, Angler quests, golf score, tax money).

> **Status: in development, not published yet.** Reads Terraria 1.4.5 player files (file
> version 326, [FORMAT.md](FORMAT.md)), tested against the test characters. The package lives
> in the [Terraria Progress Tracker](https://github.com/Doeschi/Terraria-Progress-Tracker)
> repository for now and will move to its own repository once it is stable.

## Why

There is no maintained JavaScript reader for current player files: the existing
[terraria-player-parser](https://github.com/cokolele/terraria-player-parser) stopped at
1.3.5.3 (2019), before the Void Vault, loadouts and Journey research existed.

## API

```js
import { readPlayerFile } from 'terraria-player-file'

const player = await readPlayerFile(arrayBuffer) // the .plr file's bytes
player.name            // "test_char_journey"
player.difficulty      // "journey"
player.inventory       // [{ slot: 0, id: 3509, stack: 1, prefix: 0, favorited: false }, ...]
player.coins, player.ammo // the coin and ammo slots (0-3)
player.voidVault       // same item shape, also piggyBank, safe, defendersForge
player.equipment       // armor, accessories, vanity, dyes; also player.misc and player.loadouts
player.held            // items in the game's temporary slots when it saved (e.g. on the cursor)
player.upgrades        // life crystals and fruit, mana crystals, Demon Heart, Aegis Fruit, ...
player.research        // { Wood: 30, CopperPickaxe: 1, ... } (internal item names)
player.playTime        // seconds played; also deaths { pve, pvp }, anglerQuests, golfScore, taxMoney
```

`allItems(player)` lists every item with where it is (`inventory`, `held`, `voidVault`, `loadout:2`, …).
Empty slots are left out of all lists. Other file versions throw an `UnsupportedVersionError`
(`{ allowUnknownVersion: true }` tries the newest known layout anyway); a layout that does not
fit throws a `FormatError` with the byte offset instead of returning wrong data.

- Works in the browser (Web Crypto, no Node APIs) and in Node 20+.
- No dependencies.
- Unknown or unsupported file versions give a clear error instead of wrong data.
- Item ids are the game's numeric ids; names are not included (the item list is up to the app).

## How the format was worked out

Re-Logic publishes no specification of the player file. This package is written from scratch
in three steps:

1. **A starting map** of the format: the field order known from earlier versions (general
   knowledge of the format and the MIT-licensed
   [terraria-player-parser](https://github.com/cokolele/terraria-player-parser) for 1.3.5.3).
2. **Test characters with exactly known contents** ([test/fixtures](test/fixtures/README.md)):
   a Journey and a Classic character made only for this, with items of unusual stack sizes and
   prefixes in known slots of every inventory, equipment slot and storage, used Life and Mana
   Crystals, and partly finished Journey research.
3. **Checking every section against them:** the decrypted bytes are searched for these exact
   values (e.g. item 8 – Torch – with stack 37 in the tenth hotbar slot). That shows where each
   section really starts and how large its records are; every difference to the starting map is
   corrected in [FORMAT.md](FORMAT.md).

Each field in the spec is marked as verified, plausible (only default values seen) or unknown –
nothing is guessed silently. The test characters stay in the repository as the package's test
suite, so every future change is checked against them.

**No code from the game or from other tools is used.** Writing an own reader for a file format
is common practice; the game's (decompiled) code is not copied.

### New Terraria versions

When an update changes the format:

1. Make a fresh test character in the new version, set up like the existing ones.
2. Compare it with the spec; the first misread value shows where the format changed.
3. Update FORMAT.md and the parser for the new file version, add the character to the tests.

## Development

```sh
npm install
npm test   # builds and checks the test characters
```

## License

[MIT](LICENSE). Terraria is a trademark of Re-Logic; this project is not affiliated with
Re-Logic.
