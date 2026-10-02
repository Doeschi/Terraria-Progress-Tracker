import { inDifficulty, seedOnly } from './drops'
import { NPC_REF, SOURCE_REF, npcIndex } from './npcs'
import type { FilterEntry } from './filtering'
import type { Difficulty, GameData } from './types'

// Group "Sources & sets" (REQUIREMENTS FL18): any NPC (bestiary entry), container / bag or set
// as a filter option. Option ids are the detail references ("npc:<entry>", "src:<source>") and
// "set:<set id>".

export const SET_REF = 'set:'

export interface SourceEntry extends FilterEntry {
  /** shown in the picker: "Enemy", "Container", "Vanity set", … */
  kind: string
  /** the picker's sections */
  section: 'npc' | 'container' | 'set'
}

const candidateCache = new WeakMap<GameData, SourceEntry[]>()

/** Every NPC, container and set that has items, with its number of items (all difficulties). */
export function sourceCandidates(data: GameData): SourceEntry[] {
  const cached = candidateCache.get(data)
  if (cached) return cached
  const counts = new Map<string, number>()
  for (const ids of itemSources(data, null).values()) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const out: SourceEntry[] = []
  // "Enemies" -> "Enemy", "Bosses" -> "Boss", "Town NPCs" -> "Town NPC"
  const singular = (name: string) =>
    /ies$/.test(name) ? name.slice(0, -3) + 'y' : /sses$/.test(name) ? name.slice(0, -2) : name.replace(/s$/, '')
  const types = new Map(data.bestiary.types.map((t) => [t.id, singular(t.name)]))
  for (const e of data.bestiary.entries) {
    const id = NPC_REF + e.id
    if (counts.has(id))
      out.push({
        id,
        name: e.name,
        icon: e.icon,
        count: counts.get(id)!,
        kind: types.get(e.type) ?? '',
        section: 'npc',
      })
  }
  for (const s of data.dropSources.values()) {
    const id = SOURCE_REF + s.id
    if (s.kind !== 'npc' && counts.has(id))
      out.push({
        id,
        name: s.name,
        icon: s.icon,
        count: counts.get(id)!,
        kind: s.kind === 'bag' ? 'Treasure bag' : 'Container',
        section: 'container',
      })
  }
  for (const set of data.sets.values()) {
    const id = SET_REF + set.id
    out.push({
      id,
      name: set.name,
      icon: data.itemsByKey.get(set.items[0])?.icon,
      count: counts.get(id) ?? set.items.length,
      kind: set.kind === 'armor' ? 'Armor set' : 'Vanity set',
      section: 'set',
    })
  }
  candidateCache.set(data, out)
  return out
}

/** Item key -> the "Sources & sets" options it belongs to. `difficulty` null: every game mode. */
export function itemSources(data: GameData, difficulty: Difficulty | null): Map<string, string[]> {
  const index = npcIndex(data)
  const out = new Map<string, Set<string>>()
  const add = (key: string, id: string) => {
    let set = out.get(key)
    if (!set) out.set(key, (set = new Set()))
    set.add(id)
  }
  const counts = (d: { drop: Parameters<typeof seedOnly>[0] }) =>
    !seedOnly(d.drop) && (difficulty === null || inDifficulty(d.drop, difficulty))
  // NPCs: their drops, their treasure bag's contents, their shop
  for (const e of data.bestiary.entries) {
    const id = NPC_REF + e.id
    for (const d of index.dropsOfEntry.get(e.id) ?? []) if (counts(d)) add(d.item.key, id)
    const bag = index.bagOfEntry.get(e.id)
    for (const d of (bag && index.dropsOfSource.get(bag)) || []) if (counts(d)) add(d.item.key, id)
    const vendor = index.vendorOfEntry.get(e.id)
    // the item's vendors leave out shop rows only in special seeds (CO6: the Princess's Pirate
    // Staff in Celebration Mk 10 worlds)
    for (const s of (vendor && index.stock.get(vendor)) || []) if (s.item.vendors.includes(vendor!)) add(s.item.key, id)
  }
  // containers and bags
  for (const s of data.dropSources.values())
    if (s.kind !== 'npc')
      for (const d of index.dropsOfSource.get(s.id) ?? []) if (counts(d)) add(d.item.key, SOURCE_REF + s.id)
  // sets
  for (const set of data.sets.values()) for (const key of set.items) add(key, SET_REF + set.id)
  return new Map([...out].map(([k, v]) => [k, [...v]]))
}

/** Whether an option exists (has items): the "Show its items in the table" buttons. */
export function isSourceOption(data: GameData, id: string): boolean {
  return sourceCandidates(data).some((c) => c.id === id)
}
