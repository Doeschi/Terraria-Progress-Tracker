# Terraria player file format (`.plr`)

A description of the player file as written by Terraria 1.4.5 (file version 326), worked out
for this package. Re-Logic publishes no specification; everything here comes from reading test
characters with known contents (see [How this was worked out](#how-this-was-worked-out)).

**Status of each field**

| Mark | Meaning |
| --- | --- |
| ✔ | verified: a test character holds a known, non-default value and it reads correctly |
| ~ | plausible: in the expected place and the reading stays aligned, but only default values (0, empty) were seen so far |
| ? | unknown: the bytes are there, their meaning is not known yet |

Version 326 is the only version checked so far. Other versions differ (see
[Version differences](#version-differences)).

## Encryption

The whole file is encrypted with AES-128 in CBC mode, PKCS#7 padding. Key and IV are the same
16 bytes: the string `h3y_gUyZ` encoded as UTF-16 little endian. Every byte offset below refers
to the decrypted data. ✔

## Data types

All numbers are little endian.

| Type | Size | Notes |
| --- | --- | --- |
| `u8` / `bool` | 1 | bool: 0 = false, anything else = true |
| `i32` / `u32` | 4 | |
| `i64` | 8 | |
| `f32` | 4 | IEEE 754 |
| `string` | 1+ | .NET `BinaryWriter` string: length as 7-bit encoded integer (one byte up to 127), then UTF-8 bytes |
| `color` | 3 | R, G, B |

Item records come in four shapes:

| Shape | Size | Fields | Used for |
| --- | --- | --- | --- |
| `EquipItem` | 6 | `i32` id, `u8` prefix, `u8` unknown (always 0 so far) ? | armor, accessories, vanity, dyes |
| `SmallItem` | 5 | `i32` id, `u8` prefix | misc equipment and their dyes |
| `BankItem` | 9 | `i32` id, `i32` stack, `u8` prefix | Piggy Bank, Safe, Defender's Forge |
| `FullItem` | 10 | `i32` id, `i32` stack, `u8` prefix, `bool` favorited | inventory, Void Vault, loadouts |

An empty slot has id 0. Item ids are the game's numeric item ids; prefix ids are the game's
prefix ids (e.g. 77 = Wild, 73 = Brisk on accessories ✔).

## Layout

Offsets are those of the test character `journey.plr` (name of 17 characters, no spawn points,
15 research entries); sections after a variable-length field move accordingly.

### Header

| Offset | Type | Field | |
| --- | --- | --- | --- |
| 0 | `i32` | file version (326 for 1.4.5) | ✔ |
| 4 | 7 bytes | magic `relogic` | ✔ |
| 11 | `u8` | file type (3 = player) | ✔ |
| 12 | `u32` | revision (0) | ~ |
| 16 | `u64` | flags (bit 0: favorite) | ~ |
| 24 | `string` | character name | ✔ |
|  | `u8` | difficulty: 0 Classic, 1 Mediumcore, 2 Hardcore, 3 Journey | ✔ (0, 3) |
|  | `i64` | play time (ticks) | ~ |
|  | `i32` | hair style | ~ |
|  | `u8` | hair dye | ~ |
|  | `u8` | team | ~ |
|  | 2 × `u8` | hidden accessory visuals (bits) | ~ |
|  | `u8` | hidden misc visuals (bits) | ~ |
|  | `u8` | skin variant | ~ |

### Stats and permanent upgrades

| Type | Field | |
| --- | --- | --- |
| `i32`, `i32` | life, max life (100 + 20 per Life Crystal + 5 per Life Fruit) | ✔ (120, 140) |
| `i32`, `i32` | mana, max mana (20 + 20 per Mana Crystal) | ✔ (20, 40) |
| `bool` | extra accessory slot (Demon Heart) | ~ |
| `bool`, `bool` | biome torches unlocked (Torch God's Favor), biome torches in use | ~ |
| `bool` | Artisan Loaf eaten | ~ |
| 6 × `bool` | Vital Crystal, Aegis Fruit, Arcane Crystal, Galaxy Pearl, Gummy Worm, Ambrosia used | ~ |
| `bool` | Old One's Army defeated once | ~ |
| `u8` | unknown – 1 for the Journey character, 0 for the Classic one | ? |
| `i32` | tax money collected | ~ |
| `i32`, `i32` | deaths (PvE, PvP) | ~ |
| 7 × `color` | hair, skin, eyes, shirt, undershirt, pants, shoes | ~ |

The order of the upgrade flags is taken from earlier versions and has not been checked with used
upgrades yet; the unknown byte might belong to this group.

### Equipment and inventory

| Type | Field | |
| --- | --- | --- |
| 20 × `EquipItem` | armor 0–2, accessories 3–9 (3–7 normal, 8 Demon Heart slot, 9 Master Mode slot), vanity 10–19 | ✔ |
| 10 × `EquipItem` | dyes of the 10 armor / accessory slots | ✔ |
| 58 × `FullItem` | inventory: 0–49 main (0–9 hotbar), 50–53 coins, 54–57 ammo | ✔ |
| 5 × (`SmallItem` equip, `SmallItem` dye) | misc slots, each followed by its dye: 0 pet, 1 light pet, 2 minecart, 3 mount, 4 hook | ✔ |

### Storages

| Type | Field | |
| --- | --- | --- |
| 40 × `BankItem` | Piggy Bank | ✔ |
| 40 × `BankItem` | Safe | ✔ |
| 40 × `BankItem` | Defender's Forge | ✔ |
| 40 × `FullItem` | Void Vault | ✔ |
| `u8` | Void Vault settings (bits) | ~ |

### Buffs, spawn points, settings

| Type | Field | |
| --- | --- | --- |
| 44 × (`i32` type, `i32` time) | buffs | ✔ (pet and light pet buffs) |
| repeated: `i32` x, `i32` y, `i32` world id, `string` world name | spawn points, until an x of −1 | ✔ (empty list) |
| `bool` | hotbar locked | ~ |
| 13 × `bool` | hidden info accessory displays | ~ |
| `i32` | Angler quests finished | ~ |
| 4 × `i32` | d-pad radial bindings (−1 = none) | ✔ |
| 12 × `i32` | builder accessory states | ~ |
| `i32` | Tavernkeep quest log | ~ |
| `bool` | dead; if true an `i32` respawn timer follows | ~ |
| `i64` | last save time (.NET `DateTime` binary) | ~ |
| `i32` | golf score | ~ |
| `u8` | unknown (0 in both test characters) | ? |

### Journey research

| Type | Field | |
| --- | --- | --- |
| `i32` | number of entries | ✔ |
| per entry: `string`, `i32` | item internal name, amount researched | ✔ (Wood 30, Copper Pickaxe 1, Dirt Block 100) |

Entries are stored for all characters (0 entries for non-Journey ones). The game researches
some items by itself (e.g. the starting items). The internal names are the game's item names
without spaces (`CopperPickaxe`), not ids.

### After the research

| Size | Field | |
| --- | --- | --- |
| 22 bytes | not decoded yet; identical in both test characters. Probably the Journey powers (`u8` 1, `u16` power id, value – e.g. the bytes `01 0E 00 00 00 00 3F` would be power 14 with 0.5 as `f32`), the minecart upgrade flags and the selected loadout | ? |
| 3 × loadout | each: 20 × `FullItem` armor / accessories / vanity, 10 × `FullItem` dyes, 10 × `bool` hidden visuals (310 bytes) | ✔ |
| 13 bytes | not decoded yet; identical in both test characters (`01` then zeros) | ? |

The loadout that is in use is stored empty in its loadout record; its items are the equipment
above. ✔ (loadout 1 empty, loadouts 2 and 3 with the Shadewood / Ebonwood Helmet)

### Not found

- **Trash slot:** not saved. A Gel in the trash slot of `journey.plr` appears nowhere in the file,
  and the trash slot is empty after loading the character again in the game. ✔

## Version differences

Known from other readers, not checked here:

- 1.3.5.3 and older: no team byte, equipment items 5 bytes, no Void Vault, no loadouts, no
  research.
- Between 1.4.4 and 1.4.5 the part from the difficulty byte to the spawn points grew by one
  byte (from 2691 to 2692 bytes). In version 326 this part is 2723 bytes: 30 bytes more come
  from the 6-byte equipment items and 1 from the unknown byte after the upgrade flags.

## How this was worked out

1. A starting map of the format: the field order of earlier versions (general knowledge of the
   format, and the MIT-licensed [terraria-player-parser](https://github.com/cokolele/terraria-player-parser)
   that documents version 1.3.5.3).
2. Test characters with exactly known contents (`test/fixtures/`, described in their README):
   items with unusual stack sizes and prefixes in known slots of every section.
3. Searching the decrypted bytes for these exact values (e.g. item id 8 with stack 37, item id
   5010 with prefix 73) shows where each section really starts and how large its records are.
   Every difference to the starting map is corrected and documented here.

No code from the game or from other tools is used. Fields that could not be checked are marked
as such instead of being guessed.
