import { create } from 'zustand'
import { DEFAULT_DETECTION, type ChestDetection } from './world'
import type { ScanScope } from '@/hooks/useAreas'

// Per-browser view preferences (not part of the tracking file), kept in
// localStorage so the page looks the same on the next visit.

export type EntryOrder = 'default' | 'name'

export interface ColumnSort {
  id: string
  desc: boolean
}

interface Prefs {
  /** table column id -> visible; missing ids use the column's default */
  columns: Record<string, boolean>
  /** sorted table columns (empty = name order) */
  tableSorting: ColumnSort[]
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
  /** sync dialog settings (areas, displays, only your chests) per playthrough id */
  syncScopes: Record<string, ScanScope>
  /** filter options moved to the "Hidden" section: "<prefix><group>/<id>" */
  hiddenFilters: string[]
  /** move options at 100% to the "Completed" section */
  hideCompleted: boolean
}

interface PrefsActions {
  setColumns(columns: Record<string, boolean>): void
  setTableSorting(sorting: ColumnSort[]): void
  setEntryOrder(group: string, order: EntryOrder): void
  setChestDetection(detection: ChestDetection): void
  setStationsRequired(required: boolean): void
  setSectionOpen(id: string, open: boolean): void
  setAutosave(autosave: boolean): void
  setSyncScope(playthroughId: string, scope: ScanScope): void
  toggleHiddenFilter(key: string): void
  setHideCompleted(hide: boolean): void
}

const KEY = 'view-prefs'

function load(): Prefs {
  const prefs: Prefs = {
    columns: {},
    tableSorting: [],
    entryOrder: {},
    chestDetection: DEFAULT_DETECTION,
    stationsRequired: true,
    openSections: {},
    autosave: false,
    syncScopes: {},
    hiddenFilters: [],
    hideCompleted: false,
  }
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (p && typeof p.columns === 'object') prefs.columns = p.columns
    if (Array.isArray(p.tableSorting))
      prefs.tableSorting = p.tableSorting.filter(
        (s: unknown): s is ColumnSort =>
          !!s && typeof (s as ColumnSort).id === 'string' && typeof (s as ColumnSort).desc === 'boolean',
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
  }
})
