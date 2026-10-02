import type { BestiaryEntry, Drop, GameData, Item, ShopRow } from './types'

// Links between bestiary entries, drop sources, vendors and items, for the NPC cards of the
// detail panel (REQUIREMENTS ND): what an NPC drops and sells, and which card a reference opens.
//
// Detail references (useUi.detailKey): an item key, "npc:<bestiary entry id>" or
// "src:<drop source id>" (a source with neither a bestiary entry nor an item).

export const NPC_REF = 'npc:'
export const SOURCE_REF = 'src:'

export interface SourceDrop {
  item: Item
  drop: Drop
}

export interface NpcIndex {
  /** drop source id -> bestiary entry id */
  entryOfSource: Map<string, string>
  /** bestiary entry id -> its drop source ids (a boss: all its parts, without the treasure bag) */
  sourcesOfEntry: Map<string, string[]>
  /** bestiary entry id of a boss -> the drop source id of its treasure bag */
  bagOfEntry: Map<string, string>
  /** drop source id -> the items it drops */
  dropsOfSource: Map<string, SourceDrop[]>
  /** drop source id -> the item it is (treasure bags, crates, chests) */
  itemOfSource: Map<string, string>
  /** item key -> the drop sources it is ("Gold Chest": the Gold Chest in the Dungeon, …) */
  sourcesOfItem: Map<string, string[]>
  /** vendor id <-> bestiary entry id */
  entryOfVendor: Map<string, string>
  vendorOfEntry: Map<string, string>
  /** vendor id -> the items it sells, with their shop rows (none: sold without a shop row) */
  stock: Map<string, { item: Item; rows: ShopRow[] }[]>
  /** bestiary entry id -> other entries on the same wiki page (variants) */
  variants: Map<string, BestiaryEntry[]>
}

const cache = new WeakMap<GameData, NpcIndex>()

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

export function npcIndex(data: GameData): NpcIndex {
  const cached = cache.get(data)
  if (cached) return cached

  // sources -> entries: by NPC id, else by name (no shared pages: "Mimics" has several enemies)
  const entryByNpcId = new Map<number, string>()
  const entryByName = new Map<string, string>()
  for (const e of data.bestiary.entries) {
    if (e.npcId !== undefined && !entryByNpcId.has(e.npcId)) entryByNpcId.set(e.npcId, e.id)
    if (!entryByName.has(e.name.toLowerCase())) entryByName.set(e.name.toLowerCase(), e.id)
  }
  const entryOfSource = new Map<string, string>()
  for (const s of data.dropSources.values()) {
    if (s.kind !== 'npc') continue
    const id = (s.npcId !== undefined && entryByNpcId.get(s.npcId)) || entryByName.get(s.name.toLowerCase())
    if (id) entryOfSource.set(s.id, id)
  }
  const sourcesOfEntry = new Map<string, string[]>()
  for (const [source, entry] of entryOfSource) push(sourcesOfEntry, entry, source)

  // bosses: every entry of a boss gets all its parts (e.g. Retinazer: also "The Twins") and its bag
  const bagOfEntry = new Map<string, string>()
  for (const boss of data.bosses) {
    const parts = boss.sources.filter((s) => data.dropSources.get(s)?.kind === 'npc')
    const bag = boss.sources.find((s) => data.dropSources.get(s)?.kind === 'bag')
    const entries = new Set(parts.map((s) => entryOfSource.get(s)).filter((e): e is string => !!e))
    for (const entry of entries) {
      const own = sourcesOfEntry.get(entry) ?? []
      sourcesOfEntry.set(entry, [...new Set([...own, ...parts])])
      if (bag) bagOfEntry.set(entry, bag)
    }
  }

  const dropsOfSource = new Map<string, SourceDrop[]>()
  for (const [key, drops] of data.drops) {
    const item = data.itemsByKey.get(key)
    if (item) for (const drop of drops) push(dropsOfSource, drop.source, { item, drop })
  }

  // bags and containers that are items: "Treasure Bag (Plantera)", "Gold Chest (Dungeon)" -> Gold Chest
  const byName = new Map<string, Item>()
  for (const i of data.items) if (!byName.has(i.name.toLowerCase())) byName.set(i.name.toLowerCase(), i)
  const itemOfSource = new Map<string, string>()
  const sourcesOfItem = new Map<string, string[]>()
  for (const s of data.dropSources.values()) {
    if (s.kind === 'npc') continue
    const name = s.name.toLowerCase()
    const item = byName.get(name) ?? byName.get(name.replace(/\s*\([^)]*\)$/, ''))
    if (!item) continue
    itemOfSource.set(s.id, item.key)
    push(sourcesOfItem, item.key, s.id)
  }

  const entryOfVendor = new Map<string, string>()
  const vendorOfEntry = new Map<string, string>()
  for (const v of data.vendors) {
    const entry = entryByName.get(v.name.toLowerCase())
    if (!entry) continue
    entryOfVendor.set(v.id, entry)
    vendorOfEntry.set(entry, v.id)
  }
  const stock = new Map<string, { item: Item; rows: ShopRow[] }[]>()
  for (const item of data.items) {
    const rows = data.shops.get(item.key) ?? []
    const vendors = new Set([...item.vendors, ...rows.map((r) => r.vendor)])
    for (const v of vendors) push(stock, v, { item, rows: rows.filter((r) => r.vendor === v) })
  }

  const byPage = new Map<string, BestiaryEntry[]>()
  for (const e of data.bestiary.entries) push(byPage, e.page, e)
  const variants = new Map<string, BestiaryEntry[]>()
  for (const list of byPage.values())
    if (list.length > 1)
      for (const e of list)
        variants.set(
          e.id,
          list.filter((x) => x.id !== e.id),
        )

  const index = {
    entryOfSource,
    sourcesOfEntry,
    bagOfEntry,
    dropsOfSource,
    itemOfSource,
    sourcesOfItem,
    entryOfVendor,
    vendorOfEntry,
    stock,
    variants,
  }
  cache.set(data, index)
  return index
}

/** The card a drop source opens: its bestiary entry, the item it is, or a source card. */
export function sourceRef(data: GameData, sourceId: string): string {
  const index = npcIndex(data)
  const entry = index.entryOfSource.get(sourceId)
  if (entry) return NPC_REF + entry
  return index.itemOfSource.get(sourceId) ?? SOURCE_REF + sourceId
}

/** The card a vendor opens (its bestiary entry), if any. */
export function vendorRef(data: GameData, vendorId: string): string | undefined {
  const entry = npcIndex(data).entryOfVendor.get(vendorId)
  return entry ? NPC_REF + entry : undefined
}

/** Name of what a detail reference shows (back button). */
export function refName(data: GameData, ref: string): string | undefined {
  if (ref.startsWith(NPC_REF)) return data.bestiary.entries.find((e) => e.id === ref.slice(NPC_REF.length))?.name
  if (ref.startsWith(SOURCE_REF)) return data.dropSources.get(ref.slice(SOURCE_REF.length))?.name
  return data.itemsByKey.get(ref)?.name
}
