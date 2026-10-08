import Fuse from 'fuse.js'
import type { FilterGroup, Searcher } from './filtering'
import type { Playthrough } from './saveFile'
import type { BestiaryEntry, GameData } from './types'
import type { LoadedWorld, WorldBestiary } from './world'
import type { LoadedPlayer } from './player'
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
/** The Torch God: unlocked by the character's Torch God's Favor (BE5), not recorded in the world */
const TORCH_GOD = 'TorchGod'

/** Unlocked by the entry's own kills, sightings or chats. */
const ownUnlock = (b: WorldBestiary, id: string) =>
  (b.kills[id] ?? 0) > 0 || b.talked.includes(id) || b.seen.includes(id)

/** The group of other entries that unlocks this one, all of them unlocked (`unlockedBy`, BE5). */
const unlockedVia = (b: WorldBestiary, e: BestiaryEntry) =>
  e.unlockedBy?.find((group) => group.every((id) => ownUnlock(b, id)))

/**
 * Everything unlocked in the world: by an entry's own kills, sightings and chats, through other
 * entries (the Tortured Soul by talking to the Tax Collector, one gold critter all of them) and,
 * with the attached player, the Torch God by the Torch God's Favor.
 */
function worldUnlocked(b: WorldBestiary, entries: BestiaryEntry[], player: LoadedPlayer | null): Set<string> {
  const ids = new Set<string>()
  for (const e of entries) if (ownUnlock(b, e.id) || unlockedVia(b, e)) ids.add(e.id)
  if (player?.upgrades.torchGodsFavor) ids.add(TORCH_GOD)
  return ids
}

/**
 * What the world (and the attached player) says about an entry: kills, "talked to", "seen",
 * "via Tax Collector" (text null: nothing). `value` sorts: kills, then 0.5 for the rest, 0 for
 * nothing.
 */
export function worldState(
  b: WorldBestiary,
  e: BestiaryEntry,
  byId: Map<string, BestiaryEntry>,
  player: LoadedPlayer | null,
): { text: string | null; value: number } {
  const kills = b.kills[e.id] ?? 0
  if (kills > 0) return { text: plural(kills, 'kill'), value: kills }
  if (b.talked.includes(e.id)) return { text: 'talked to', value: 0.5 }
  if (b.seen.includes(e.id)) return { text: 'seen', value: 0.5 }
  if (e.id === TORCH_GOD && player?.upgrades.torchGodsFavor) return { text: "Torch God's Favor used", value: 0.5 }
  const via = unlockedVia(b, e)
  if (via) return { text: `via ${via.map((id) => byId.get(id)?.name ?? id).join(' + ')}`, value: 0.5 }
  return { text: null, value: 0 }
}

export interface BestiaryDiff {
  /** unlocked in the world, not checked in the playthrough */
  toCheck: BestiaryEntry[]
  /** checked in the playthrough, not unlocked in the world */
  toUncheck: BestiaryEntry[]
}

/** Differences between the playthrough and the world's bestiary (entries of the playthrough only);
 * the attached player adds the Torch God (BE5). */
export function bestiaryDiff(
  data: GameData,
  pt: Pick<Playthrough, 'platform' | 'gameVersion' | 'bestiary'>,
  world: LoadedWorld,
  player: LoadedPlayer | null = null,
): BestiaryDiff | null {
  if (!world.bestiary) return null
  const checked = new Set(pt.bestiary)
  const entries = entriesForPlaythrough(data, pt)
  const inWorld = worldUnlocked(world.bestiary, entries, player)
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
