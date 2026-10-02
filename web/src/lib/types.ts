// Shapes of the static JSON files written by pipeline/build_tracker_data.py.

export const PLATFORM_IDS = ['desktop', 'console', 'mobile', 'oldgen', '3ds', 'japanese'] as const
export type PlatformId = (typeof PLATFORM_IDS)[number]

export const DIFFICULTIES = ['classic', 'expert', 'master', 'journey'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface Item {
  key: string
  id: number
  name: string
  internalName?: string
  page: string
  url: string
  icon?: string
  categories: string[]
  subcategories: string[]
  obtain: string[]
  vendors: string[]
  events: string[]
  /** biomes where enemies that drop the item spawn */
  biomes: string[]
  /** "night" / "day": dropped by enemies that only spawn then */
  times: string[]
  /** filterable conditions (conditions.json ids) of its sources: enemies that only spawn then,
   * drops and shop rows with the condition */
  conditions: string[]
  platforms: PlatformId[]
  platformsKnown: boolean
  /** Desktop patch that added the item, e.g. "1.4.0.1" */
  introduced?: string
  /** game update the item belongs to, e.g. "1.4.0" (id in versions.json) */
  version?: string
  /** only obtainable from this difficulty on */
  minDifficulty?: 'expert' | 'master'
  /** only obtainable during events (see `events`) */
  eventOnly?: boolean
  /** earliest milestone (milestones.json id) and why, e.g. "crafted – needs Chlorophyte Ore" */
  milestone?: string
  milestoneVia?: string
  /** not in the wiki's Items table, built from its recipe (no stats, rarity or prices) */
  recipeOnly?: boolean
  hardmode: boolean
  hardmodeOnly: boolean
  unobtainable: boolean
  banner: boolean
  questFish: boolean
  rarity?: number
  buy?: number
  sell?: number
  research?: number
  stack?: number
  consumable: boolean
  placeable: boolean
  autoswing: boolean
  damage?: number
  damageType?: string
  critical?: number
  knockback?: number
  velocity?: number
  useTime?: number
  mana?: number
  defense?: number
  bodySlot?: string
  pickaxePower?: number
  axePower?: number
  hammerPower?: number
  toolSpeed?: number
  fishingPower?: number
  baitPower?: number
  rangeBonus?: number
  healLife?: number
  healMana?: number
  placedWidth?: number
  placedHeight?: number
  buff?: string
  debuff?: string
  tooltip?: string
}

export interface GroupEntry {
  id: string
  name: string
  icon?: string
  /** vendors: their head (map icon), for the filters and the table; `icon` is the full body */
  head?: string
  count: number
  parent?: string
  /** "Other …" subcategory: the parent's items that fit no other subcategory */
  fallback?: boolean
}

export interface PlatformEntry {
  id: PlatformId
  name: string
  count: number
  /** the wiki's platform icon (data URI) */
  icon?: string
}

export interface VersionEntry {
  id: string
  name: string
  count: number
  /** icon of an item added in the update */
  icon?: string
}

export interface RarityEntry {
  id: number
  name: string
  count: number
  icon?: string
}

export interface CoinEntry {
  id: 'platinum' | 'gold' | 'silver' | 'copper'
  name: string
  /** value in copper coins */
  value: number
  icon?: string
}

export const DROP_MODES = ['normal', 'expert', 'master'] as const
export type DropMode = (typeof DROP_MODES)[number]

/** Something that drops items: an enemy/boss, a treasure bag, or a container (chest, crate, tree, …). */
export interface DropSource {
  id: string
  name: string
  kind: 'npc' | 'bag' | 'container'
  /** containers only: their group (containers.json id), e.g. "chest" */
  group?: string
  icon?: string
  /** its wiki page */
  url?: string
  npcId?: number
  /** where / when the enemy spawns (biomes.json / times.json ids) */
  biomes?: string[]
  times?: string[]
}

export interface Drop {
  source: string
  /** full display text, e.g. "1–3 · Expert: 2–6" */
  quantity?: string
  /** full display text, e.g. "1% · Expert: 1.99%" */
  rate?: string
  /** chance in percent per game mode (only the modes the drop exists in) */
  chance?: Partial<Record<DropMode, number>>
  /** quantity per game mode, e.g. { normal: "1–3", expert: "2–6" } */
  quantities?: Partial<Record<DropMode, string>>
  /** game modes the drop exists in */
  modes: DropMode[]
  /** conditions (conditions.json ids), events and biomes the drop is bound to */
  conditions?: string[]
  events?: string[]
  biomes?: string[]
  /** extra condition text, e.g. "if wind speed ≥ 20 mph" */
  note?: string
  /** only these variants of the source drop it (NPC ids), e.g. the Torch Zombie */
  npcIds?: number[]
  /** the variants of the source it is for, as the wiki names them, e.g. "Pre-Hardmode variant",
   * "Dark Lamia" (missing: every variant) */
  variants?: string[]
  /** the drop group it is in (DropGroup id), or the group per game mode when the wiki lists the
   * treasure bag's group apart (B5) */
  group?: string | Partial<Record<DropMode, string>>
}

/** Items of a source that drop together (B5): "One of the following 8 items will always be
 * dropped", "1/12: one of these 14", or a condition ("Only in Corrupt worlds"). */
export interface DropGroup {
  /** the wiki's text */
  text?: string
  /** amount of the item that is dropped, and the chance of the group */
  amount?: string
  chance?: string
  /** how many of its items are dropped (missing: a condition, all of them can drop) */
  pick?: number
  /** number of items */
  size: number
}

/** An item in a vendor's shop and when it is sold. */
export interface ShopRow {
  vendor: string
  /** the wiki's condition text, e.g. "In Hardmode, during night, in a Jungle." */
  text?: string
  conditions?: string[]
  events?: string[]
  biomes?: string[]
  /** moon phases 1 (full) - 8 */
  moons?: number[]
}

export interface ConditionGroup {
  id: string
  name: string
  /** part of the "Conditions" filter (else only shown) */
  filter: boolean
}

export interface ConditionEntry {
  id: string
  name: string
  group: string
  icon?: string
  count: number
}

/** A group of containers ("Found in" filter): Chests, Crates, Other containers, Trees. */
export interface ContainerGroup {
  id: string
  name: string
  icon?: string
  /** drop source ids, by name */
  sources: string[]
  count: number
}

export interface BossStage {
  id: string
  name: string
  icon?: string
}

export interface Boss {
  id: string
  name: string
  stage: string
  icon?: string
  /** drop sources that count for the boss (itself, parts, treasure bag) */
  sources: string[]
  count: number
}

/** One ingredient: an item, an "Any …" group, or (not matched) just a name. */
export interface Ingredient {
  item?: string
  group?: string
  name?: string
  amount: number
}

export interface Recipe {
  result: string
  amount: number
  /** all required, e.g. ["Work Bench", "Ecto Mist"] */
  stations: string[]
  ingredients: Ingredient[]
  /** only on these platforms (missing = all) */
  platforms?: PlatformId[]
}

export interface Station {
  /** items that provide the station (stronger ones included) */
  items?: string[]
  icon?: string
  /** environment condition or world object - needs no item */
  condition?: boolean
}

export interface IngredientGroup {
  items: string[]
  icon?: string
}

/** Shimmer transmutation: item (or group / unmatched name) -> result */
export interface Shimmer {
  item?: string
  group?: string
  name?: string
  result: string
  amount: number
}

export interface RecipeData {
  recipes: Recipe[]
  /** result key -> recipes */
  byResult: Map<string, Recipe[]>
  /** item key -> recipes using it (directly or through a group) */
  usedIn: Map<string, Recipe[]>
  stations: Map<string, Station>
  groups: Map<string, IngredientGroup>
  /** item key -> what it turns into */
  shimmerFrom: Map<string, Shimmer[]>
  /** result key -> what turns into it */
  shimmerTo: Map<string, Shimmer[]>
}

export type BestiaryTypeId = 'town' | 'critter' | 'enemy' | 'boss'

/** One bestiary entry; variants ("Zombie (Female)") are entries of their own, as in-game. */
export interface BestiaryEntry {
  /** internal NPC name, also the key in the world file's bestiary */
  id: string
  /** same as id (set when loading; generic filter code keys by `key`) */
  key: string
  /** number in the in-game bestiary */
  n: number
  name: string
  page: string
  url: string
  icon?: string
  type: BestiaryTypeId
  stars?: number
  npcId?: number
  /** biomes.json / times.json / events.json ids */
  biomes: string[]
  times: string[]
  events: string[]
  /** game update (versions.json id) */
  version: string
  platforms: PlatformId[]
}

export interface BestiaryType {
  id: BestiaryTypeId
  name: string
  icon?: string
  count: number
}

/** Sprite sheets of the small wiki icons (sprites.json, pipeline/build_icons.py). */
export interface Sprites {
  sheets: { file: string; w: number; h: number }[]
  /** wiki file (URL part after /images/) -> [sheet, x, y, width, height] */
  icons: Map<string, [number, number, number, number, number]>
}

export interface GameData {
  items: Item[]
  itemsByKey: Map<string, Item>
  /** Numeric item id -> items. Not unique: old-gen/3DS items reuse some ids. */
  itemsById: Map<number, Item[]>
  categories: GroupEntry[]
  subcategories: GroupEntry[]
  obtain: GroupEntry[]
  vendors: GroupEntry[]
  events: GroupEntry[]
  biomes: GroupEntry[]
  times: GroupEntry[]
  platforms: PlatformEntry[]
  /** game updates, oldest first */
  versions: VersionEntry[]
  rarities: Map<number, RarityEntry>
  /** highest value first */
  coins: CoinEntry[]
  dropSources: Map<string, DropSource>
  /** item key -> drops, highest chance first */
  drops: Map<string, Drop[]>
  /** drop groups by id */
  dropGroups: Map<string, DropGroup>
  /** layers of containers with other items per layer (Gold Chest: Underground, Cavern, …), in order;
   * their drops name them as variants */
  dropAreas: string[]
  bossStages: BossStage[]
  bosses: Boss[]
  /** generic drops (coins, healing potions) that never count for a boss */
  bossIgnoreItems: Set<string>
  containerGroups: ContainerGroup[]
  /** progression milestones in order (Start … Moon Lord) */
  milestones: GroupEntry[]
  /** item key -> the shop rows that sell it */
  shops: Map<string, ShopRow[]>
  conditionGroups: ConditionGroup[]
  conditions: Map<string, ConditionEntry>
  recipes: RecipeData
  bestiary: { types: BestiaryType[]; entries: BestiaryEntry[] }
  /** difficulty -> icon of the wiki */
  difficultyIcons: Partial<Record<Difficulty, string>>
  sprites: Sprites
  /** items the wiki's item list lacks, known from its recipes (id -> name, probable icon) */
  missingItems: Map<number, { id: number; name: string; icon?: string }>
}
