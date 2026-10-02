import type { SaveFile } from './saveFile'
import type { GameData } from './types'

// Carrying a progress file over to newer item data (REQUIREMENTS DU5): renamed item keys are
// replaced, and what changed since the file's data version is reported once.

export interface DataUpdateReport {
  /** the file's data version before ("" for files from before data versions) */
  from: string
  to: string
  /** renamed items whose checkmarks were moved: old key -> new key */
  renamed: { from: string; to: string }[]
  /** item keys new since the file's data version */
  added: string[]
  /** the file's checked / ignored items that no longer exist (key, name if known) */
  missing: { key: string; name: string; checked: boolean }[]
}

/** The file carried over to the current data: renamed keys replaced, its data version set; the
 * report when something concerns the file (else null). */
export function carryOver(doc: SaveFile, data: GameData): { doc: SaveFile; report: DataUpdateReport | null } {
  const current = data.meta.dataVersion
  const since = doc.dataVersion ?? ''
  if (!current || since === current) return { doc, report: null }
  const updates = data.meta.updates.filter((u) => u.dataVersion > since && u.dataVersion <= current)

  // renames in order (a key renamed twice ends at the last name)
  const rename = new Map<string, string>()
  for (const u of updates)
    for (const [from, to] of Object.entries(u.renamed)) {
      for (const [k, v] of rename) if (v === from) rename.set(k, to)
      rename.set(from, to)
    }
  const renamed = new Map<string, string>()
  const map = (key: string) => {
    const to = rename.get(key)
    if (to === undefined) return key
    renamed.set(key, to)
    return to
  }
  const playthroughs = doc.playthroughs.map((p) => ({
    ...p,
    checked: [...new Set(p.checked.map(map))],
    ignored: [...new Set(p.ignored.map(map))],
    changedAt: Object.fromEntries(Object.entries(p.changedAt).map(([k, v]) => [map(k), v])),
  }))

  // the file's items that no longer exist (kept in the file, they may come back)
  const removedNames = new Map(updates.flatMap((u) => u.removed.map((r) => [r.key, r.name] as const)))
  const missing = new Map<string, { key: string; name: string; checked: boolean }>()
  for (const p of playthroughs)
    for (const [list, checked] of [
      [p.checked, true],
      [p.ignored, false],
    ] as const)
      for (const key of list)
        if (!data.itemsByKey.has(key) && !missing.has(key))
          missing.set(key, { key, name: removedNames.get(key) ?? key, checked })

  // new items: only known for files that have a data version
  const added = since ? [...new Set(updates.flatMap((u) => u.added))].filter((k) => data.itemsByKey.has(k)) : []

  const next = { ...doc, playthroughs, dataVersion: current }
  const report: DataUpdateReport = {
    from: since,
    to: current,
    renamed: [...renamed].map(([from, to]) => ({ from, to })),
    added,
    missing: [...missing.values()],
  }
  const relevant = report.renamed.length || report.added.length || report.missing.length
  return { doc: next, report: relevant ? report : null }
}
