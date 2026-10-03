import type { SaveFile } from './saveFile'
import { emptySelection, GROUP_KEYS, type Selection, type ViewMode } from './filtering'
import { BESTIARY_GROUP_KEYS, emptyBestiarySelection, type BestiarySelection, type BestiaryViewMode } from './bestiary'

// What the list shows, per playthrough, remembered in the browser: selected filters, search,
// "Show" switch, items or bestiary, and the item in the detail panel. Restored when the
// playthrough becomes active again (on the next visit, or after switching playthroughs).

export interface SavedView {
  selection: Selection
  search: string
  view: ViewMode
  mode: 'items' | 'bestiary'
  bestiarySelection: BestiarySelection
  bestiarySearch: string
  bestiaryView: BestiaryViewMode
  /** item shown in the detail panel */
  detailKey: string | null
  /** options of "Sources & sets" shown in the sidebar (FL18) */
  picked: string[]
}

const KEY = 'view-state'
const VIEWS: ViewMode[] = ['all', 'missing', 'obtained', 'ignored']
const BESTIARY_VIEWS: BestiaryViewMode[] = ['all', 'missing', 'unlocked']

export const defaultView = (): SavedView => ({
  selection: emptySelection(),
  search: '',
  view: 'all',
  mode: 'items',
  bestiarySelection: emptyBestiarySelection(),
  bestiarySearch: '',
  bestiaryView: 'all',
  detailKey: null,
  picked: [],
})

function readAll(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** Selected options per group; groups that no longer exist are dropped, new ones start empty. */
function readSelection<K extends string>(
  v: unknown,
  keys: readonly K[],
  empty: Record<K, string[]>,
): Record<K, string[]> {
  const out = { ...empty }
  if (!v || typeof v !== 'object') return out
  for (const k of keys) {
    const list = (v as Record<string, unknown>)[k]
    if (Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === 'string')
  }
  return out
}

/** The remembered view of a playthrough (defaults for a new one). */
export function loadView(playthroughId: string | null | undefined): SavedView {
  const out = defaultView()
  if (!playthroughId) return out
  const v = readAll()[playthroughId] as Record<string, unknown> | undefined
  if (!v || typeof v !== 'object') return out
  out.selection = readSelection(v.selection, GROUP_KEYS, out.selection)
  out.bestiarySelection = readSelection(v.bestiarySelection, BESTIARY_GROUP_KEYS, out.bestiarySelection)
  if (typeof v.search === 'string') out.search = v.search
  if (typeof v.bestiarySearch === 'string') out.bestiarySearch = v.bestiarySearch
  if (VIEWS.includes(v.view as ViewMode)) out.view = v.view as ViewMode
  if (BESTIARY_VIEWS.includes(v.bestiaryView as BestiaryViewMode)) out.bestiaryView = v.bestiaryView as BestiaryViewMode
  if (v.mode === 'items' || v.mode === 'bestiary') out.mode = v.mode
  if (typeof v.detailKey === 'string') out.detailKey = v.detailKey
  if (Array.isArray(v.picked)) out.picked = v.picked.filter((x): x is string => typeof x === 'string')
  return out
}

export function saveView(playthroughId: string, view: SavedView) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [playthroughId]: view }))
  } catch {
    // storage unavailable - the view is just not remembered
  }
}

// ------------------------------------------------------ selected playthrough

const ACTIVE_KEY = 'active-playthroughs'

/** Remember the selected playthrough (newest first; ids are unique across progress files). */
export function rememberActive(playthroughId: string | null) {
  if (!playthroughId) return
  try {
    const list = readActive().filter((id) => id !== playthroughId)
    localStorage.setItem(ACTIVE_KEY, JSON.stringify([playthroughId, ...list].slice(0, 50)))
  } catch {
    // e.g. storage blocked - the first playthrough is selected next time
  }
}

function readActive(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The playthrough to select in a progress file: the last one selected in this browser, the one an
 * older file names, or the first. */
export function chooseActive(doc: SaveFile): string | null {
  const ids = new Set(doc.playthroughs.map((p) => p.id))
  const remembered = readActive().find((id) => ids.has(id))
  if (remembered) return remembered
  if (doc.activePlaythroughId && ids.has(doc.activePlaythroughId)) return doc.activePlaythroughId
  return doc.playthroughs[0]?.id ?? null
}
