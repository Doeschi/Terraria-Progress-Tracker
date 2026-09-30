// What the settings dialog can show, hide and reorder (see prefs.ts, Layout).

/** Sections of the item detail panel, in their default order. */
export const DETAIL_SECTIONS: { id: string; label: string }[] = [
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'what', label: 'What it is' },
  { id: 'how', label: 'How to get it' },
  { id: 'soldBy', label: 'Sold by' },
  { id: 'dropped', label: 'Dropped by' },
  { id: 'found', label: 'Found in' },
  { id: 'recipes', label: 'Crafting, used in, shimmer' },
  { id: 'stats', label: 'Stats' },
  { id: 'details', label: 'Details (id, internal name, platforms)' },
]

/**
 * Ids in the saved order: saved ids first (if they still exist), then the others in their
 * default order - so new sections or groups appear without a reset.
 */
export function ordered(defaults: string[], saved: string[]): string[] {
  const known = new Set(defaults)
  const first = saved.filter((id) => known.has(id))
  const seen = new Set(first)
  return [...first, ...defaults.filter((id) => !seen.has(id))]
}

/** `ids` with `id` moved one place up (-1) or down (+1). */
export function move(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
