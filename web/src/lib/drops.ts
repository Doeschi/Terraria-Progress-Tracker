import {
  DROP_MODES,
  type Difficulty,
  type Drop,
  type DropGroup,
  type DropMode,
  type GameData,
  type Item,
} from './types'

// Drops of an item that exist in a playthrough's difficulty, and the bosses
// they come from. Journey worlds can use every mode (difficulty slider).

const MODES: Record<Difficulty, DropMode[]> = {
  classic: ['normal'],
  expert: ['expert'],
  master: ['master'],
  journey: ['normal', 'expert', 'master'],
}

/** Whether a drop exists in this difficulty. */
export const inDifficulty = (drop: Drop, difficulty: Difficulty) =>
  drop.modes.some((m) => MODES[difficulty].includes(m))

/** "dropped": by enemies, bosses and treasure bags; "found": in containers (chests, crates, trees, …). */
export type DropKind = 'dropped' | 'found'

/** Whether a drop comes from a container or from an enemy / treasure bag. */
export function dropKind(data: GameData, drop: Drop): DropKind {
  return data.dropSources.get(drop.source)?.kind === 'container' ? 'found' : 'dropped'
}

/** Drops of the item that exist in this difficulty, highest chance (for it) first; optionally of one kind. */
export function dropsFor(data: GameData, item: Item, difficulty: Difficulty, kind?: DropKind): Drop[] {
  const modes = MODES[difficulty]
  return (data.drops.get(item.key) ?? [])
    .filter((d) => d.modes.some((m) => modes.includes(m)) && (!kind || dropKind(data, d) === kind))
    .sort((a, b) => (chanceFor(b, difficulty) ?? -1) - (chanceFor(a, difficulty) ?? -1))
}

/** Rows only in special world seeds ("I am error" chests, Remix drops): shown in the detail panel,
 * but they count for no filter, table column or expected drops (CO6). */
export const seedOnly = (d: Drop) => !!d.conditions?.some((c) => c.startsWith('seed-'))

/** The item's drops in this difficulty without the rows only in special seeds. */
export function regularDrops(data: GameData, item: Item, difficulty: Difficulty, kind?: DropKind): Drop[] {
  return dropsFor(data, item, difficulty, kind).filter((d) => !seedOnly(d))
}

/** Containers (source ids) the item is found in, in this difficulty. */
export function itemContainers(data: GameData, item: Item, difficulty: Difficulty): string[] {
  return [...new Set(regularDrops(data, item, difficulty, 'found').map((d) => d.source))]
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

/** The drop group a drop is in, in this difficulty (B5). */
export function groupOf(drop: Drop, difficulty: Difficulty): string | undefined {
  const g = drop.group
  if (!g || typeof g === 'string') return g
  return g[primaryMode(difficulty)] ?? g[drop.modes[0]]
}

/** Heading of a drop group: the wiki's text, else "1/12: one of these 14 (1–3 each)" or "Only one
 * of these 3" (rows with their own chances that exclude each other). */
export function groupText(group: DropGroup): string {
  if (group.text) return group.text
  const text = group.chance ? `${group.chance}: one of these ${group.size}` : `Only one of these ${group.size}`
  return group.amount && group.amount !== '1' ? `${text} (${group.amount} each)` : text
}

/** Short note of a drop's group for the item card: "one of 8", "1/12: one of 14", "two of 10",
 * or the condition ("Only in Corrupt worlds"). */
export function groupNote(group: DropGroup): string {
  if (!group.pick) return group.text ?? ''
  const what = `${group.pick === 2 ? 'two' : 'one'} of ${group.size}`
  return group.chance ? `${group.chance}: ${what}` : what
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
  for (const d of regularDrops(data, item, difficulty)) for (const b of bySource.get(d.source) ?? []) ids.add(b)
  return data.bosses.filter((b) => ids.has(b.id)).map((b) => b.id)
}

/** Modes a drop is limited to, as short text ("Expert+", "Master only"); undefined = all modes. */
export function modeLabel(modes: DropMode[]): string | undefined {
  if (modes.length === 3) return undefined
  if (modes.length === 1) return `${modes[0][0].toUpperCase()}${modes[0].slice(1)} only`
  if (!modes.includes('normal')) return 'Expert & Master'
  return modes.map((m) => m[0].toUpperCase() + m.slice(1)).join(' & ')
}
