import { chanceFor, dropsFor, quantityFor } from './drops'
import type { Difficulty, Drop, GameData, Item } from './types'
import type { WorldBestiary } from './world'

// Expected drops ("bad luck"): how often an item should have dropped by now, from the kill
// counts in the world's bestiary and the drop chances.

/** A missing item with at least this chance to have dropped is highlighted. */
export const BAD_LUCK = 0.95

export interface LuckPart {
  source: string
  kills: number
  /** chance per kill, 0–1 */
  chance: number
  /** items per drop: the average of the range, e.g. 4 for "3–5" */
  quantity: number
  /** bound to a condition, event or biome: every kill is counted anyway */
  approx: boolean
}

export interface Luck {
  /** expected number of items: kills × chance × average quantity */
  expected: number
  /** chance to have got it at least once, 0–1 */
  atLeastOnce: number
  /** some source is bound to a condition, event or biome */
  approx: boolean
  parts: LuckPart[]
}

/** Kills in the world per drop source, and per bestiary entry of a source (for variant drops). */
export interface KillCounts {
  /** source id -> kills (all its variants; a treasure bag: its boss) */
  total: Map<string, number>
  /** source id -> its bestiary entries with their NPC id and kills */
  entries: Map<string, { npcId?: number; kills: number }[]>
}

/**
 * Kills per drop source (enemies and treasure bags) in the world. Enemies are matched to
 * bestiary entries by NPC id, name and wiki page (all variants count); a treasure bag - or a
 * boss part without an entry - uses the highest kills of its boss. Unmatched sources are missing.
 */
export function sourceKills(data: GameData, bestiary: WorldBestiary): KillCounts {
  const byNpcId = new Map<number, string[]>()
  const byName = new Map<string, Set<string>>()
  const add = (key: string, id: string) => byName.set(key, (byName.get(key) ?? new Set()).add(id))
  const npcIdOf = new Map<string, number | undefined>()
  for (const e of data.bestiary.entries) {
    if (e.npcId !== undefined) byNpcId.set(e.npcId, [...(byNpcId.get(e.npcId) ?? []), e.id])
    add(e.name.toLowerCase(), e.id)
    if (e.page) add(e.page.toLowerCase(), e.id)
    npcIdOf.set(e.id, e.npcId)
  }

  const total = new Map<string, number>()
  const entries = new Map<string, { npcId?: number; kills: number }[]>()
  for (const s of data.dropSources.values()) {
    if (s.kind !== 'npc') continue
    const ids = new Set([
      ...(s.npcId !== undefined ? (byNpcId.get(s.npcId) ?? []) : []),
      ...(byName.get(s.name.toLowerCase()) ?? []),
    ])
    if (!ids.size) continue
    const list = [...ids].map((id) => ({ npcId: npcIdOf.get(id), kills: bestiary.kills[id] ?? 0 }))
    entries.set(s.id, list)
    total.set(
      s.id,
      list.reduce((n, e) => n + e.kills, 0),
    )
  }
  for (const boss of data.bosses) {
    const known = boss.sources.filter((s) => total.has(s))
    if (!known.length) continue
    const most = Math.max(...known.map((s) => total.get(s)!))
    for (const s of boss.sources) if (!total.has(s)) total.set(s, most)
  }
  return { total, entries }
}

/**
 * Kills that count for a drop: only the named variants if the drop is bound to some (e.g. Torch
 * for the Torch Zombie) - undefined if none of them has an entry of its own (e.g. "Armed" variants
 * count as their base variant, which has its own row) - else all kills of the source.
 */
export function dropKills(kills: KillCounts, drop: Drop): number | undefined {
  if (drop.npcIds) {
    const ids = new Set(drop.npcIds)
    const own = (kills.entries.get(drop.source) ?? []).filter((e) => e.npcId !== undefined && ids.has(e.npcId))
    return own.length ? own.reduce((n, e) => n + e.kills, 0) : undefined
  }
  return kills.total.get(drop.source)
}

/** Expected drops of an item in this difficulty; undefined if no enemy with known kills drops it. */
export function itemLuck(data: GameData, item: Item, difficulty: Difficulty, kills: KillCounts): Luck | undefined {
  const parts: LuckPart[] = []
  for (const d of dropsFor(data, item, difficulty, 'dropped')) {
    const n = dropKills(kills, d)
    const c = chanceFor(d, difficulty)
    if (n === undefined || c === undefined) continue
    const approx = !!(d.conditions?.length || d.events?.length || d.biomes?.length || d.note)
    const quantity = averageQuantity(quantityFor(d, difficulty))
    parts.push({ source: d.source, kills: n, chance: Math.min(c, 100) / 100, quantity, approx })
  }
  if (!parts.length) return undefined
  const expected = parts.reduce((n, p) => n + p.kills * p.chance * p.quantity, 0)
  // log of the chance to have missed it every time (log1p(-1) = -Infinity: certain)
  const missLog = parts.reduce((n, p) => n + (p.kills ? p.kills * Math.log1p(-p.chance) : 0), 0)
  return { expected, atLeastOnce: 1 - Math.exp(missLog), approx: parts.some((p) => p.approx), parts }
}

/**
 * Average items per drop from the wiki's quantity text: "3–5" -> 4, "2" -> 2; the first number or
 * range counts ("~2–4", "5–14 (Underground)", "2–5 / 3–6" for other platforms), else 1.
 */
export function averageQuantity(text: string | undefined): number {
  const m = text?.match(/(\d+)\s*(?:[–-]\s*(\d+))?/)
  if (!m) return 1
  const low = Number(m[1])
  return m[2] ? (low + Number(m[2])) / 2 : low || 1
}

/** "2.4×", "0.03×", "120×" */
export function formatExpected(n: number): string {
  if (n === 0) return '0×'
  if (n >= 100) return `${Math.round(n)}×`
  if (n >= 0.1) return `${n.toFixed(1)}×`
  return `${n.toPrecision(1)}×`
}

/** "91%", "99.9%", "<1%" - never 100 % unless certain */
export function formatChance(p: number): string {
  if (p >= 1) return '100%'
  if (p > 0.99) return `${Math.min(99.9, Math.floor(p * 1000) / 10)}%`
  if (p > 0 && p < 0.01) return '<1%'
  return `${Math.round(p * 100)}%`
}
