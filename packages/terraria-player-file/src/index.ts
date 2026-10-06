// Terraria player files (.plr): see FORMAT.md for the layout and how it was worked out.

import { decryptPlayerFile } from './decrypt.js'
import { FormatError, Reader } from './reader.js'

export { decryptPlayerFile } from './decrypt.js'
export { FormatError } from './reader.js'

/** File versions whose layout is verified (FORMAT.md). 326 = Terraria 1.4.5. */
export const SUPPORTED_VERSIONS: readonly number[] = [326]

export type Difficulty = 'classic' | 'mediumcore' | 'hardcore' | 'journey'

/** An item in a slot. Empty slots are left out of every list. */
export interface PlayerItem {
  /** slot within its list (0-based), e.g. 9 = the tenth hotbar slot */
  slot: number
  /** the game's numeric item id */
  id: number
  stack: number
  /** the game's prefix id, 0 = none */
  prefix: number
  /** marked as favorite (inventory and Void Vault only) */
  favorited?: boolean
}

/** Armor, accessories, vanity and dyes - the equipment in use or a saved loadout. */
export interface EquipmentSet {
  /** 0 head, 1 body, 2 legs */
  armor: PlayerItem[]
  /** 0-4 normal slots, 5 Demon Heart slot, 6 Master Mode slot */
  accessories: PlayerItem[]
  /** vanity armor, slots as in `armor` */
  vanityArmor: PlayerItem[]
  /** vanity accessories, slots as in `accessories` */
  vanityAccessories: PlayerItem[]
  /** 0-2 the armor slots, 3-9 the accessory slots */
  dyes: PlayerItem[]
}

export interface MiscSlot {
  item?: PlayerItem
  dye?: PlayerItem
}

export interface PlayerFile {
  /** file version (326 = Terraria 1.4.5) */
  version: number
  name: string
  difficulty: Difficulty
  life: number
  maxLife: number
  mana: number
  maxMana: number
  /** time played with this character, in seconds */
  playTime: number
  deaths: { pve: number; pvp: number }
  /** Angler quests finished */
  anglerQuests: number
  golfScore: number
  /** money the Tax Collector has gathered, in copper coins */
  taxMoney: number
  /** permanent upgrades used (FORMAT.md marks which of them are verified) */
  upgrades: {
    lifeCrystals: number
    lifeFruit: number
    manaCrystals: number
    demonHeart: boolean
    torchGodsFavor: boolean
    artisanLoaf: boolean
    vitalCrystal: boolean
    aegisFruit: boolean
    arcaneCrystal: boolean
    galaxyPearl: boolean
    gummyWorm: boolean
    ambrosia: boolean
  }
  /** main inventory, slots 0-49 (0-9 hotbar) */
  inventory: PlayerItem[]
  /** coin slots 0-3 */
  coins: PlayerItem[]
  /** ammo slots 0-3 */
  ammo: PlayerItem[]
  /** the equipment in use (the active loadout) */
  equipment: EquipmentSet
  misc: { pet: MiscSlot; lightPet: MiscSlot; minecart: MiscSlot; mount: MiscSlot; hook: MiscSlot }
  /** the 3 loadouts; the active one is stored empty (its items are `equipment`) */
  loadouts: EquipmentSet[]
  /** the loadout in use, 0-2 */
  selectedLoadout: number
  /**
   * Items in the game's temporary slots when it saved - on the cursor, in the slot of the Goblin
   * Tinkerer or the Guide, in the research slot. The game puts them back into the inventory when
   * the character is loaded. `slot` is the bit of the slot (FORMAT.md).
   */
  held: PlayerItem[]
  piggyBank: PlayerItem[]
  safe: PlayerItem[]
  defendersForge: PlayerItem[]
  voidVault: PlayerItem[]
  /** active buffs: buff id and remaining time in ticks */
  buffs: { id: number; time: number }[]
  spawnPoints: { x: number; y: number; worldId: number; worldName: string }[]
  /** Journey research: item internal name -> amount researched (all characters, may be empty) */
  research: Record<string, number>
}

export interface ReadOptions {
  /** try versions other than SUPPORTED_VERSIONS with the newest known layout (default false) */
  allowUnknownVersion?: boolean
}

export class UnsupportedVersionError extends Error {
  readonly version: number
  constructor(version: number) {
    super(
      `Player file version ${version} is not supported (supported: ${SUPPORTED_VERSIONS.join(', ')}). ` +
        (version > Math.max(...SUPPORTED_VERSIONS) ? 'It is newer than this reader.' : 'It is older than this reader.'),
    )
    this.name = 'UnsupportedVersionError'
    this.version = version
  }
}

const DIFFICULTIES: Difficulty[] = ['classic', 'mediumcore', 'hardcore', 'journey']
/** bytes of the value of each Journey power a character stores (FORMAT.md) */
const POWER_VALUE_SIZE: Record<number, number> = { 5: 1, 11: 1, 14: 4 }
// the game has about 6,000 items; far larger ids mean the reading went off track
const MAX_ITEM_ID = 20000
const MAX_STACK = 1_000_000

/** Read a .plr file (the raw, encrypted bytes). */
export async function readPlayerFile(data: ArrayBuffer | Uint8Array, options: ReadOptions = {}): Promise<PlayerFile> {
  return parsePlayerData(await decryptPlayerFile(data), options)
}

/** Parse already decrypted player data. */
export function parsePlayerData(bytes: Uint8Array, options: ReadOptions = {}): PlayerFile {
  const r = new Reader(bytes)
  const version = r.i32()
  const magic = String.fromCharCode(...r.bytesOf(7))
  const fileType = r.u8()
  if (magic !== 'relogic' || fileType !== 3) throw new FormatError('not a player file', 4)
  if (!SUPPORTED_VERSIONS.includes(version) && !options.allowUnknownVersion)
    throw new UnsupportedVersionError(version)
  r.u32() // revision
  r.i64() // flags (favorite)

  const name = r.string()
  const difficultyId = r.u8()
  const difficulty = DIFFICULTIES[difficultyId]
  if (!difficulty) throw new FormatError(`unknown difficulty ${difficultyId}`, r.pos - 1)
  // .NET TimeSpan ticks of 100 ns
  const playTime = Number(r.i64()) / 10_000_000
  r.i32() // hair
  r.u8() // hair dye
  r.u8() // team
  r.skip(2) // hidden accessory visuals
  r.u8() // hidden misc visuals
  r.u8() // skin variant

  const life = r.i32()
  const maxLife = r.i32()
  const mana = r.i32()
  const maxMana = r.i32()
  const demonHeart = r.bool()
  const torchGodsFavor = r.bool()
  r.bool() // biome torches in use
  const artisanLoaf = r.bool()
  const vitalCrystal = r.bool()
  const aegisFruit = r.bool()
  const arcaneCrystal = r.bool()
  const galaxyPearl = r.bool()
  const gummyWorm = r.bool()
  const ambrosia = r.bool()
  r.bool() // Old One's Army defeated
  r.u8() // unknown (FORMAT.md)
  const taxMoney = r.i32()
  const deaths = { pve: r.i32(), pvp: r.i32() }
  r.skip(7 * 3) // colors

  // equipment: 20 slots (armor, accessories, vanity), then 10 dyes - 6 bytes each
  const equipSlots = list(20, () => equipItem(r))
  const dyeSlots = list(10, () => equipItem(r))
  const equipment = equipmentSet(equipSlots, dyeSlots)

  const inventorySlots = list(58, () => fullItem(r))
  const inventory = present(inventorySlots.slice(0, 50))
  const coins = rebase(present(inventorySlots.slice(50, 54)), 50)
  const ammo = rebase(present(inventorySlots.slice(54, 58)), 54)

  // misc slots: each item followed by its dye - 5 bytes each
  const miscSlots: MiscSlot[] = []
  for (let i = 0; i < 5; i++) {
    const item = smallItem(r)
    const dye = smallItem(r)
    miscSlots.push({ ...(item.id ? { item: { ...item, slot: i } } : {}), ...(dye.id ? { dye: { ...dye, slot: i } } : {}) })
  }
  const [pet, lightPet, minecart, mount, hook] = miscSlots

  const piggyBank = present(list(40, () => bankItem(r)))
  const safe = present(list(40, () => bankItem(r)))
  const defendersForge = present(list(40, () => bankItem(r)))
  const voidVault = present(list(40, () => fullItem(r)))
  r.u8() // Void Vault settings

  const buffs: PlayerFile['buffs'] = []
  for (let i = 0; i < 44; i++) {
    const id = r.i32()
    const time = r.i32()
    if (id) buffs.push({ id, time })
  }

  const spawnPoints: PlayerFile['spawnPoints'] = []
  for (;;) {
    const x = r.i32()
    if (x === -1) break
    if (spawnPoints.length > 10_000) throw new FormatError('too many spawn points', r.pos)
    spawnPoints.push({ x, y: r.i32(), worldId: r.i32(), worldName: r.string() })
  }

  r.bool() // hotbar locked
  r.skip(13) // hidden info displays
  const anglerQuests = r.i32()
  r.skip(4 * 4) // d-pad bindings
  r.skip(12 * 4) // builder accessory states
  r.i32() // Tavernkeep quest log
  if (r.bool()) r.i32() // dead: respawn timer
  r.i64() // last save time
  const golfScore = r.i32()
  r.u8() // unknown (FORMAT.md)

  const researchCount = r.i32()
  if (researchCount < 0 || researchCount > MAX_ITEM_ID) throw new FormatError(`invalid research count ${researchCount}`, r.pos - 4)
  const research: Record<string, number> = {}
  for (let i = 0; i < researchCount; i++) {
    const item = r.string()
    research[item] = r.i32()
  }

  // items in the temporary slots: a flag per slot, then the items of the set flags
  const heldFlags = r.u8()
  const held: PlayerItem[] = []
  for (let bit = 0; bit < 8; bit++) if (heldFlags & (1 << bit)) held.push({ ...bankItem(r), slot: bit })
  // the Journey powers of the character: (true, id, value) per power, then false
  while (r.bool()) {
    const at = r.pos
    const power = r.u16()
    const size = POWER_VALUE_SIZE[power]
    if (size === undefined) throw new FormatError(`unknown Journey power ${power}; the layout differs`, at)
    r.skip(size)
  }
  r.u8() // minecart upgrade flags
  const selectedLoadout = r.i32()
  if (selectedLoadout < 0 || selectedLoadout > 2)
    throw new FormatError(`invalid loadout ${selectedLoadout}; the layout differs`, r.pos - 4)
  const loadouts: EquipmentSet[] = []
  for (let i = 0; i < 3; i++) {
    const slots = list(20, () => fullItem(r))
    const dyes = list(10, () => fullItem(r))
    r.skip(10) // hidden visuals
    loadouts.push(equipmentSet(slots, dyes))
  }

  return {
    version,
    name,
    difficulty,
    life,
    maxLife,
    mana,
    maxMana,
    playTime,
    deaths,
    anglerQuests,
    golfScore,
    taxMoney,
    upgrades: {
      // 100 base life, +20 per Life Crystal up to 400, then +5 per Life Fruit
      lifeCrystals: Math.max(0, Math.min(15, Math.floor((maxLife - 100) / 20))),
      lifeFruit: Math.max(0, Math.min(20, Math.floor((maxLife - 400) / 5))),
      manaCrystals: Math.max(0, Math.min(9, Math.floor((maxMana - 20) / 20))),
      demonHeart,
      torchGodsFavor,
      artisanLoaf,
      vitalCrystal,
      aegisFruit,
      arcaneCrystal,
      galaxyPearl,
      gummyWorm,
      ambrosia,
    },
    inventory,
    coins,
    ammo,
    equipment,
    misc: { pet, lightPet, minecart, mount, hook },
    loadouts,
    selectedLoadout,
    held,
    piggyBank,
    safe,
    defendersForge,
    voidVault,
    buffs,
    spawnPoints,
    research,
  }
}

/** Every item the player has, with where it is - e.g. for "do they own it" checks. */
export function allItems(player: PlayerFile): (PlayerItem & { where: string })[] {
  const out: (PlayerItem & { where: string })[] = []
  const add = (where: string, items: PlayerItem[]) => items.forEach((i) => out.push({ ...i, where }))
  add('inventory', player.inventory)
  add('held', player.held)
  add('coins', player.coins)
  add('ammo', player.ammo)
  const set = (where: string, s: EquipmentSet) =>
    add(where, [...s.armor, ...s.accessories, ...s.vanityArmor, ...s.vanityAccessories, ...s.dyes])
  set('equipment', player.equipment)
  for (const [key, slot] of Object.entries(player.misc)) add(`misc:${key}`, [slot.item, slot.dye].filter((x) => !!x))
  player.loadouts.forEach((l, i) => set(`loadout:${i + 1}`, l))
  add('piggyBank', player.piggyBank)
  add('safe', player.safe)
  add('defendersForge', player.defendersForge)
  add('voidVault', player.voidVault)
  return out
}

// ------------------------------------------------------------------ helpers

type RawItem = Omit<PlayerItem, 'slot'>

function list(n: number, read: () => RawItem): PlayerItem[] {
  return Array.from({ length: n }, (_, slot) => ({ ...read(), slot }))
}

function present(items: PlayerItem[]): PlayerItem[] {
  return items.filter((i) => i.id !== 0)
}

/** slot numbers counted from `from` (coins and ammo are slots 50-57 of the inventory) */
function rebase(items: PlayerItem[], from: number): PlayerItem[] {
  return items.map((i) => ({ ...i, slot: i.slot - from }))
}

function checked(item: RawItem, start: number): RawItem {
  if (item.id < 0 || item.id > MAX_ITEM_ID || item.stack < 0 || item.stack > MAX_STACK)
    throw new FormatError(`implausible item (id ${item.id}, stack ${item.stack}); the layout differs`, start)
  return item
}

/** armor, accessories, vanity, dyes: id, prefix, one unknown byte */
function equipItem(r: Reader): RawItem {
  const start = r.pos
  const id = r.i32()
  const prefix = r.u8()
  r.u8()
  return checked({ id, stack: id ? 1 : 0, prefix }, start)
}

/** misc equipment and their dyes: id, prefix */
function smallItem(r: Reader): RawItem {
  const start = r.pos
  const id = r.i32()
  const prefix = r.u8()
  return checked({ id, stack: id ? 1 : 0, prefix }, start)
}

/** Piggy Bank, Safe, Defender's Forge: id, stack, prefix */
function bankItem(r: Reader): RawItem {
  const start = r.pos
  return checked({ id: r.i32(), stack: r.i32(), prefix: r.u8() }, start)
}

/** inventory, Void Vault, loadouts: id, stack, prefix, favorited */
function fullItem(r: Reader): RawItem {
  const start = r.pos
  return checked({ id: r.i32(), stack: r.i32(), prefix: r.u8(), favorited: r.bool() }, start)
}

/** 20 equipment slots (3 armor, 7 accessories, 3 vanity armor, 7 vanity accessories) and 10 dyes */
function equipmentSet(slots: PlayerItem[], dyes: PlayerItem[]): EquipmentSet {
  const part = (from: number, to: number) => rebase(present(slots.slice(from, to)), from)
  return {
    armor: part(0, 3),
    accessories: part(3, 10),
    vanityArmor: part(10, 13),
    vanityAccessories: part(13, 20),
    dyes: present(dyes),
  }
}
