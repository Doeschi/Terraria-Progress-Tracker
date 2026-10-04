import type { Playthrough } from './saveFile'
import type { Difficulty, GameData, Item } from './types'
import { nameOf } from './format'

// Which items exist in a playthrough: platform, difficulty and game version.
// Items outside of it are neither shown nor counted.

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  classic: 'Classic',
  expert: 'Expert',
  master: 'Master',
  journey: 'Journey',
}

/** Terraria world game mode (header.gameMode) -> difficulty */
export const GAME_MODE_DIFFICULTY: Record<number, Difficulty> = {
  0: 'classic',
  1: 'expert',
  2: 'master',
  3: 'journey',
}

// Journey worlds can use the difficulty slider up to Master.
const ALLOWED: Record<Difficulty, Set<string>> = {
  classic: new Set(),
  expert: new Set(['expert']),
  master: new Set(['expert', 'master']),
  journey: new Set(['expert', 'master']),
}

export function versionRanks(data: GameData): Map<string, number> {
  return new Map(data.versions.map((v, i) => [v.id, i]))
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

export type AvailabilityCheck = (item: Item) => boolean

export function availabilityCheck(
  data: GameData,
  pt: Pick<Playthrough, 'platform' | 'difficulty' | 'gameVersion'>,
): AvailabilityCheck {
  const ranks = versionRanks(data)
  const maxRank = pt.gameVersion ? (ranks.get(pt.gameVersion) ?? Infinity) : Infinity
  const allowed = ALLOWED[pt.difficulty]
  return (item) =>
    item.platforms.includes(pt.platform) &&
    (!item.minDifficulty || allowed.has(item.minDifficulty)) &&
    // items without a known version are always included
    (!item.version || (ranks.get(item.version) ?? 0) <= maxRank)
}

export function itemsForPlaythrough(
  data: GameData,
  pt: Pick<Playthrough, 'platform' | 'difficulty' | 'gameVersion'>,
): Item[] {
  const available = availabilityCheck(data, pt)
  return data.items.filter(available)
}

/** Items a new playthrough starts with ignored: they do not count towards progress (and can be
 * un-ignored) - unobtainable items and other forms of an item. */
export function startsIgnored(item: Item): boolean {
  return item.unobtainable || !!item.otherForm
}

export function versionLabel(data: GameData, id: string | null): string {
  if (!id) return `Latest (${data.versions.at(-1)?.id ?? '?'})`
  return nameOf(data.versions, id)
}
