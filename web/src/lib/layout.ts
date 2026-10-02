// What the settings dialog can show, hide and reorder (see prefs.ts, Layout).

/** Sections of the item detail panel, in their default order. */
export const DETAIL_SECTIONS: { id: string; label: string }[] = [
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'what', label: 'What it is' },
  { id: 'set', label: 'Set (armor and vanity sets)' },
  { id: 'how', label: 'How to get it' },
  { id: 'soldBy', label: 'Sold by' },
  { id: 'dropped', label: 'Dropped by' },
  { id: 'found', label: 'Found in' },
  { id: 'contains', label: 'Contains (treasure bags, crates, chests)' },
  { id: 'extractinator', label: 'Extractinator (results, the machines)' },
  { id: 'recipes', label: 'Crafting, used in, shimmer' },
  { id: 'stats', label: 'Stats' },
  { id: 'details', label: 'Details (id, internal name, platforms)' },
]

/**
 * Ids in the saved order (if they still exist); ids the saved order does not know yet (new
 * sections, groups or columns) appear without a reset, at their default place: right after the
 * id before them in the default order.
 */
export function ordered(defaults: string[], saved: string[]): string[] {
  const known = new Set(defaults)
  const out = saved.filter((id) => known.has(id))
  const seen = new Set(out)
  defaults.forEach((id, n) => {
    if (seen.has(id)) return
    let before = n - 1
    while (before >= 0 && !seen.has(defaults[before])) before--
    out.splice(before < 0 ? 0 : out.indexOf(defaults[before]) + 1, 0, id)
    seen.add(id)
  })
  return out
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
