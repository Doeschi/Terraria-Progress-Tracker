import { DROP_MODES, type Difficulty, type Drop, type DropMode, type GameData, type Item } from './types'

// Drops of an item that exist in a playthrough's difficulty, and the bosses
// they come from. Journey worlds can use every mode (difficulty slider).

const MODES: Record<Difficulty, DropMode[]> = {
  classic: ['normal'],
  expert: ['expert'],
  master: ['master'],
  journey: ['normal', 'expert', 'master'],
}

/** Drops of the item that exist in this difficulty, highest chance (for it) first. */
export function dropsFor(data: GameData, item: Item, difficulty: Difficulty): Drop[] {
  const modes = MODES[difficulty]
  return (data.drops.get(item.key) ?? [])
    .filter((d) => d.modes.some((m) => modes.includes(m)))
    .sort((a, b) => (chanceFor(b, difficulty) ?? -1) - (chanceFor(a, difficulty) ?? -1))
}

/** The game mode whose chances apply; Journey shows Normal (its slider can use all). */
function primaryMode(difficulty: Difficulty): DropMode {
  return difficulty === 'journey' || difficulty === 'classic' ? 'normal' : difficulty
}

/** Chance of a drop in this difficulty (falls back to the drop's first mode). */
export function chanceFor(drop: Drop, difficulty: Difficulty): number | undefined {
  const c = drop.chance
  if (!c) return undefined
  return c[primaryMode(difficulty)] ?? c[drop.modes[0]]
}

export function quantityFor(drop: Drop, difficulty: Difficulty): string | undefined {
  const q = drop.quantities
  return q?.[primaryMode(difficulty)] ?? q?.[drop.modes[0]] ?? drop.quantity
}

/** Chances of the other modes when they differ, e.g. "Normal 1%" next to Expert 1.99%. */
export function otherChances(drop: Drop, difficulty: Difficulty): string | undefined {
  const main = chanceFor(drop, difficulty)
  const others = DROP_MODES.filter((m) => m !== primaryMode(difficulty))
    .map((m) => [m, drop.chance?.[m]] as const)
    .filter(([, v]) => v !== undefined && v !== main)
  if (!others.length) return undefined
  return others.map(([m, v]) => `${m[0].toUpperCase()}${m.slice(1)} ${v}%`).join(' · ')
}

/** drop source id -> boss ids it counts for */
export function bossesBySource(data: GameData): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const boss of data.bosses) for (const s of boss.sources) map.set(s, [...(map.get(s) ?? []), boss.id])
  return map
}

/** Bosses an item drops from in this difficulty (generic drops like coins count for none). */
export function itemBosses(
  data: GameData,
  item: Item,
  difficulty: Difficulty,
  bySource: Map<string, string[]>,
): string[] {
  if (data.bossIgnoreItems.has(item.key)) return []
  const ids = new Set<string>()
  for (const d of dropsFor(data, item, difficulty)) for (const b of bySource.get(d.source) ?? []) ids.add(b)
  return data.bosses.filter((b) => ids.has(b.id)).map((b) => b.id)
}

/** Modes a drop is limited to, as short text ("Expert+", "Master only"); undefined = all modes. */
export function modeLabel(modes: DropMode[]): string | undefined {
  if (modes.length === 3) return undefined
  if (modes.length === 1) return `${modes[0][0].toUpperCase()}${modes[0].slice(1)} only`
  if (!modes.includes('normal')) return 'Expert & Master'
  return modes.map((m) => m[0].toUpperCase() + m.slice(1)).join(' & ')
}
