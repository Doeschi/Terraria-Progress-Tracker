import { create } from 'zustand'
import { DEFAULT_DETECTION, type ChestDetection } from './world'
import type { ScanScope } from '@/hooks/useAreas'
import type { SearchMode } from './filtering'

// Per-browser view preferences (not part of the tracking file), kept in
// localStorage so the page looks the same on the next visit.

export type EntryOrder = 'default' | 'name'

/** Progression filter: a milestone contains everything available by then, or only what it adds */
export type ProgressionMode = 'upTo' | 'exactly'

export interface ColumnSort {
  id: string
  desc: boolean
}

interface Prefs {
  /** table column id -> visible; missing ids use the column's default */
  columns: Record<string, boolean>
  /** sorted table columns (empty = name order) */
  tableSorting: ColumnSort[]
  /** table column id -> width in px set by dragging (missing = the column's default) */
  columnSizes: Record<string, number>
  /** order of the options inside a filter group */
  entryOrder: Record<string, EntryOrder>
  /** rule for player-placed chests (map, sync, chest search) */
  chestDetection: ChestDetection
  /** crafting filter: a recipe needs its stations obtained */
  stationsRequired: boolean
  /** detail panel sections: id -> open (missing = the section's default) */
  openSections: Record<string, boolean>
  /** save the tracking file automatically (Chrome/Edge, file on disk) */
  autosave: boolean
  /** sync dialog settings (areas, displays, only player chests) per playthrough id */
  syncScopes: Record<string, ScanScope>
  /** filter options moved to the "Hidden" section: "<prefix><group>/<id>" */
  hiddenFilters: string[]
  /** move options at 100% to the "Completed" section */
  hideCompleted: boolean
  progressionMode: ProgressionMode
  /** item, bestiary and chest search: typos allowed or the exact text */
  searchMode: SearchMode
}

interface PrefsActions {
  setColumns(columns: Record<string, boolean>): void
  setTableSorting(sorting: ColumnSort[]): void
  setColumnSizes(sizes: Record<string, number>): void
  setEntryOrder(group: string, order: EntryOrder): void
  setChestDetection(detection: ChestDetection): void
  setStationsRequired(required: boolean): void
  setSectionOpen(id: string, open: boolean): void
  setAutosave(autosave: boolean): void
  setSyncScope(playthroughId: string, scope: ScanScope): void
  toggleHiddenFilter(key: string): void
  setHideCompleted(hide: boolean): void
  setProgressionMode(mode: ProgressionMode): void
  setSearchMode(mode: SearchMode): void
}

const KEY = 'view-prefs'

function load(): Prefs {
  const prefs: Prefs = {
    columns: {},
    tableSorting: [],
    columnSizes: {},
    entryOrder: {},
    chestDetection: DEFAULT_DETECTION,
    stationsRequired: true,
    openSections: {},
    autosave: false,
    syncScopes: {},
    hiddenFilters: [],
    hideCompleted: false,
    progressionMode: 'upTo',
    searchMode: 'fuzzy',
  }
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (p && typeof p.columns === 'object') prefs.columns = p.columns
    if (Array.isArray(p.tableSorting))
      prefs.tableSorting = p.tableSorting.filter(
        (s: unknown): s is ColumnSort =>
          !!s && typeof (s as ColumnSort).id === 'string' && typeof (s as ColumnSort).desc === 'boolean',
      )
    if (p && typeof p.columnSizes === 'object' && p.columnSizes)
      prefs.columnSizes = Object.fromEntries(
        Object.entries(p.columnSizes).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0),
      )
    if (p && typeof p.entryOrder === 'object') prefs.entryOrder = p.entryOrder
    const d = p?.chestDetection
    if (d && d.distance > 0 && d.minGroup > 1) prefs.chestDetection = { distance: +d.distance, minGroup: +d.minGroup }
    if (typeof p.stationsRequired === 'boolean') prefs.stationsRequired = p.stationsRequired
    if (p && typeof p.openSections === 'object') prefs.openSections = p.openSections
    if (typeof p.autosave === 'boolean') prefs.autosave = p.autosave
    if (p && typeof p.syncScopes === 'object') prefs.syncScopes = p.syncScopes
    if (Array.isArray(p.hiddenFilters))
      prefs.hiddenFilters = p.hiddenFilters.filter((k: unknown) => typeof k === 'string')
    if (typeof p.hideCompleted === 'boolean') prefs.hideCompleted = p.hideCompleted
    if (p.progressionMode === 'upTo' || p.progressionMode === 'exactly') prefs.progressionMode = p.progressionMode
    if (p.searchMode === 'fuzzy' || p.searchMode === 'exact') prefs.searchMode = p.searchMode
  } catch {
    // storage unavailable or damaged - start with defaults
  }
  return prefs
}

function save(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable - preferences just are not remembered
  }
}

export const usePrefs = create<Prefs & PrefsActions>()((set, get) => {
  const update = (patch: Partial<Prefs>) => {
    set(patch)
    save(get())
  }
  return {
    ...load(),
    setColumns: (columns) => update({ columns }),
    setTableSorting: (tableSorting) => update({ tableSorting }),
    setColumnSizes: (columnSizes) => update({ columnSizes }),
    setEntryOrder: (group, order) => update({ entryOrder: { ...get().entryOrder, [group]: order } }),
    setChestDetection: (chestDetection) => update({ chestDetection }),
    setStationsRequired: (stationsRequired) => update({ stationsRequired }),
    setSectionOpen: (id, open) => update({ openSections: { ...get().openSections, [id]: open } }),
    setAutosave: (autosave) => update({ autosave }),
    setSyncScope: (id, scope) => update({ syncScopes: { ...get().syncScopes, [id]: scope } }),
    toggleHiddenFilter: (key) => {
      const list = get().hiddenFilters
      update({ hiddenFilters: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] })
    },
    setHideCompleted: (hideCompleted) => update({ hideCompleted }),
    setProgressionMode: (progressionMode) => update({ progressionMode }),
    setSearchMode: (searchMode) => update({ searchMode }),
  }
})
