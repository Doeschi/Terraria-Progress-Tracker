import { nameOf } from './format'
import type { Drop, GameData, ShopRow } from './types'

// Names of the conditions a shop row or a drop is bound to, e.g. ["Hardmode", "Night", "Jungle",
// "Plantera"], for chips and short table cells. The shop row's full text is shown separately.

/** "Night", "Full moon", "after Plantera", … */
export function conditionLabel(data: GameData, id: string): string {
  const c = data.conditions.get(id)
  if (!c) return id
  return c.group === 'boss' ? `after ${c.name}` : c.name
}

/** Condition names; "after a boss" conditions read "after <boss>". */
export function conditionNames(
  data: GameData,
  source: Pick<ShopRow, 'conditions' | 'events' | 'biomes'> | Pick<Drop, 'conditions' | 'events' | 'biomes'>,
): string[] {
  return [
    ...(source.conditions ?? []).map((id) => conditionLabel(data, id)),
    ...(source.events ?? []).map((e) => nameOf(data.events, e)),
    ...(source.biomes ?? []).map((b) => nameOf(data.biomes, b)),
  ]
}
