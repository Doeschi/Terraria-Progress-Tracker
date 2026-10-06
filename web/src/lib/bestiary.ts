import Fuse from 'fuse.js'
import type { FilterGroup, Searcher } from './filtering'
import type { Playthrough } from './saveFile'
import type { BestiaryEntry, GameData } from './types'
import type { LoadedWorld, WorldBestiary } from './world'
import { versionRanks } from './availability'
import { plural } from './format'

// The bestiary: which entries exist in a playthrough, its filter groups and
// what the world file says is unlocked.

// also the order of the filter groups
export const BESTIARY_GROUP_KEYS = ['type', 'biome', 'time', 'event', 'version'] as const
export type BestiaryGroupKey = (typeof BESTIARY_GROUP_KEYS)[number]
export type BestiarySelection = Record<BestiaryGroupKey, string[]>

export const emptyBestiarySelection = (): BestiarySelection => ({
  type: [],
  biome: [],
  time: [],
  event: [],
  version: [],
})

export type BestiaryViewMode = 'all' | 'missing' | 'unlocked'

/** Entries of the playthrough's platform and game version. */
export function entriesForPlaythrough(
  data: GameData,
  pt: Pick<Playthrough, 'platform' | 'gameVersion'>,
): BestiaryEntry[] {
  const ranks = versionRanks(data)
  const maxRank = pt.gameVersion ? (ranks.get(pt.gameVersion) ?? Infinity) : Infinity
  return data.bestiary.entries.filter(
    (e) => e.platforms.includes(pt.platform) && (ranks.get(e.version) ?? 0) <= maxRank,
  )
}

/** The bestiary exists from the version of its first entries on. */
export function bestiaryExists(data: GameData, gameVersion: string | null): boolean {
  if (!gameVersion) return true
  const ranks = versionRanks(data)
  const first = Math.min(...data.bestiary.entries.map((e) => ranks.get(e.version) ?? Infinity))
  return (ranks.get(gameVersion) ?? Infinity) >= first
}

export function buildBestiaryGroups(data: GameData): FilterGroup<BestiaryGroupKey>[] {
  const count = (ids: (e: BestiaryEntry) => string[]) => {
    const m = new Map<string, number>()
    for (const e of data.bestiary.entries) for (const id of ids(e)) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }
  const used = <T extends { id: string }>(list: T[], counts: Map<string, number>) =>
    list.filter((x) => counts.has(x.id)).map((x) => ({ ...x, count: counts.get(x.id)! }))
  return [
    { key: 'type', label: 'Type', entries: data.bestiary.types },
    {
      key: 'biome',
      label: 'Biome',
      multi: true,
      entries: used(
        data.biomes,
        count((e) => e.biomes),
      ),
    },
    {
      key: 'time',
      label: 'Time of day',
      multi: true,
      entries: used(
        data.times,
        count((e) => e.times),
      ),
    },
    {
      key: 'event',
      label: 'Events',
      multi: true,
      entries: used(
        data.events,
        count((e) => e.events),
      ),
    },
    {
      key: 'version',
      label: 'Added in',
      entries: used(
        data.versions.map((v) => ({ ...v, count: 0 })),
        count((e) => [e.version]),
      ),
    },
  ]
}

export function bestiaryEntryGroups(e: BestiaryEntry): Record<BestiaryGroupKey, string[]> {
  return { type: [e.type], biome: e.biomes, time: e.times, event: e.events, version: [e.version] }
}

/** Entry ids the world has unlocked: enemies killed, critters seen, NPCs talked to. */
function worldUnlocked(b: WorldBestiary): Set<string> {
  const ids = new Set<string>([...b.seen, ...b.talked])
  for (const [id, kills] of Object.entries(b.kills)) if (kills > 0) ids.add(id)
  return ids
}

/**
 * What the world says about an entry: kills, "talked to" or "seen" (text null: nothing).
 * `value` sorts: kills, then 0.5 for seen / talked to, 0 for nothing.
 */
export function worldState(b: WorldBestiary, id: string): { text: string | null; value: number } {
  const kills = b.kills[id] ?? 0
  if (kills > 0) return { text: plural(kills, 'kill'), value: kills }
  if (b.talked.includes(id)) return { text: 'talked to', value: 0.5 }
  if (b.seen.includes(id)) return { text: 'seen', value: 0.5 }
  return { text: null, value: 0 }
}

export interface BestiaryDiff {
  /** unlocked in the world, not checked in the playthrough */
  toCheck: BestiaryEntry[]
  /** checked in the playthrough, not unlocked in the world */
  toUncheck: BestiaryEntry[]
}

/** Differences between the playthrough and the world's bestiary (entries of the playthrough only). */
export function bestiaryDiff(
  data: GameData,
  pt: Pick<Playthrough, 'platform' | 'gameVersion' | 'bestiary'>,
  world: LoadedWorld,
): BestiaryDiff | null {
  if (!world.bestiary) return null
  const inWorld = worldUnlocked(world.bestiary)
  const checked = new Set(pt.bestiary)
  const entries = entriesForPlaythrough(data, pt)
  return {
    toCheck: entries.filter((e) => inWorld.has(e.id) && !checked.has(e.id)),
    toUncheck: entries.filter((e) => checked.has(e.id) && !inWorld.has(e.id)),
  }
}

export function createBestiarySearch(entries: BestiaryEntry[]): Searcher<BestiaryEntry> {
  const fuse = new Fuse(entries, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'id', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  })
  return { fuse, items: entries, names: (e) => [e.name, e.id] }
}
