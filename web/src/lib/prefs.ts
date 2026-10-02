import { create } from 'zustand'
import { DEFAULT_DETECTION, type ChestDetection } from './world'
import type { ScanScope } from '@/hooks/useAreas'
import type { SearchMode } from './filtering'
import { DETAIL_WIDTH, SIDEBAR_WIDTH } from './panes'

// Per-browser view preferences (not part of the progress file), kept in
// localStorage so the page looks the same on the next visit.

export type EntryOrder = 'default' | 'name'

/** Progression filter: a milestone contains everything available by then, or only what it adds */
export type ProgressionMode = 'upTo' | 'exactly'

/** What is shown where (the settings dialog). */
export interface Layout {
  /** compact: lower table rows, smaller icons, tighter filter options */
  density: 'comfortable' | 'compact'
  /** bestiary progress bar in the top bar */
  showBestiaryProgress: boolean
  /** platform, difficulty and game version also as separate dropdowns (else icons in the playthrough button) */
  playthroughFields: boolean
  /** column presets shown as buttons next to the views dropdown */
  favoriteViews: string[]
  /** "Progress of filtered items" line above the table */
  showFilteredProgress: boolean
  /** filter bar also without active filters ("No filters active") */
  filterBarAlways: boolean
  /** filter group order per sidebar ("" items, "bestiary:" bestiary); missing groups keep their place */
  groupOrder: Record<string, string[]>
  /** filter groups (and the Completed / Hidden sections) that are closed / open: "<prefix><key>" -> open */
  openGroups: Record<string, boolean>
  /** progress bar under every filter option */
  optionBars: boolean
  /** toast with confetti when a filter option reaches 100% */
  celebrate: boolean
  /** a few hidden Terraria references (G8) */
  easterEggs: boolean
  /** with a loaded world: dim items whose milestone it has not reached (MS8) */
  dimUnavailable: boolean
  /** widths in px of the filter sidebar and the docked detail panel, set by dragging their edge */
  sidebarWidth: number
  detailWidth: number
  /** detail panel sections in this order; missing ones keep their place */
  detailOrder: string[]
  hiddenDetail: string[]
}

export const DEFAULT_LAYOUT: Layout = {
  density: 'compact',
  showBestiaryProgress: true,
  playthroughFields: false,
  favoriteViews: ['overview', 'sources', 'progression'],
  showFilteredProgress: true,
  filterBarAlways: true,
  groupOrder: {},
  optionBars: true,
  celebrate: true,
  easterEggs: true,
  dimUnavailable: false,
  sidebarWidth: SIDEBAR_WIDTH.initial,
  detailWidth: DETAIL_WIDTH.initial,
  openGroups: {},
  detailOrder: [],
  hiddenDetail: [],
}

/** Loads a stored layout: known fields of the right type, the rest from the defaults. */
function readLayout(v: unknown): Layout {
  const out: Layout = { ...DEFAULT_LAYOUT }
  if (!v || typeof v !== 'object') return out
  const o = v as Record<string, unknown>
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined)
  if (o.density === 'comfortable' || o.density === 'compact') out.density = o.density
  for (const k of [
    'showBestiaryProgress',
    'playthroughFields',
    'showFilteredProgress',
    'filterBarAlways',
    'optionBars',
    'celebrate',
    'easterEggs',
    'dimUnavailable',
  ] as const)
    if (typeof o[k] === 'boolean') out[k] = o[k] as boolean
  for (const k of ['sidebarWidth', 'detailWidth'] as const)
    if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k] as number
  for (const k of ['favoriteViews', 'detailOrder', 'hiddenDetail'] as const) {
    const list = strings(o[k])
    if (list) out[k] = list
  }
  if (o.openGroups && typeof o.openGroups === 'object')
    out.openGroups = Object.fromEntries(
      Object.entries(o.openGroups as Record<string, unknown>).filter(
        (e): e is [string, boolean] => typeof e[1] === 'boolean',
      ),
    )
  if (o.groupOrder && typeof o.groupOrder === 'object')
    out.groupOrder = Object.fromEntries(
      Object.entries(o.groupOrder as Record<string, unknown>).flatMap(([k, x]) => {
        const list = strings(x)
        return list ? [[k, list]] : []
      }),
    )
  return out
}

export interface ColumnSort {
  id: string
  desc: boolean
}

/** A view: name, columns in order, sorting (built-in ones in table/presets.ts). */
export interface ViewDef {
  id: string
  label: string
  columns: string[]
  sorting: ColumnSort[]
}

/** Changed built-in views (only the changed fields), own views, and the order of all views. */
export interface ViewsPrefs {
  overrides: Record<string, Partial<Omit<ViewDef, 'id'>>>
  custom: ViewDef[]
  order: string[]
}

const isSort = (s: unknown): s is ColumnSort =>
  !!s && typeof (s as ColumnSort).id === 'string' && typeof (s as ColumnSort).desc === 'boolean'
const stringList = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined)

function readViews(v: unknown): ViewsPrefs {
  const out: ViewsPrefs = { overrides: {}, custom: [], order: [] }
  if (!v || typeof v !== 'object') return out
  const o = v as Record<string, unknown>
  out.order = stringList(o.order) ?? []
  if (Array.isArray(o.custom))
    out.custom = o.custom.flatMap((x) => {
      const c = x as Record<string, unknown>
      const columns = stringList(c?.columns)
      if (!c || typeof c.id !== 'string' || typeof c.label !== 'string' || !columns) return []
      return [{ id: c.id, label: c.label, columns, sorting: Array.isArray(c.sorting) ? c.sorting.filter(isSort) : [] }]
    })
  if (o.overrides && typeof o.overrides === 'object')
    for (const [id, x] of Object.entries(o.overrides as Record<string, unknown>)) {
      const c = (x ?? {}) as Record<string, unknown>
      const edit: Partial<Omit<ViewDef, 'id'>> = {}
      if (typeof c.label === 'string') edit.label = c.label
      const columns = stringList(c.columns)
      if (columns) edit.columns = columns
      if (Array.isArray(c.sorting)) edit.sorting = c.sorting.filter(isSort)
      out.overrides[id] = edit
    }
  return out
}

interface Prefs {
  /** table column id -> visible; missing ids use the column's default */
  columns: Record<string, boolean>
  /** sorted table columns (empty = name order) */
  tableSorting: ColumnSort[]
  /** table column id -> width in px set by dragging (missing = the column's default) */
  columnSizes: Record<string, number>
  /** the same for the bestiary table */
  bestiaryColumnSizes: Record<string, number>
  /** order of the table columns (from the applied view); columns not listed keep the catalogue order after them */
  columnOrder: string[]
  views: ViewsPrefs
  /** order of the options inside a filter group */
  entryOrder: Record<string, EntryOrder>
  /** rule for player-placed chests (map, sync, chest search) */
  chestDetection: ChestDetection
  /** crafting filter: a recipe needs its stations obtained */
  stationsRequired: boolean
  /** detail panel sections: id -> open (missing = the section's default) */
  openSections: Record<string, boolean>
  /** save the progress file automatically (Chrome/Edge, file on disk) */
  autosave: boolean
  /** sync dialog settings (areas, displays, only player chests) per playthrough id */
  syncScopes: Record<string, ScanScope>
  /** "Search chests" dialog settings per playthrough id */
  chestScopes: Record<string, ScanScope>
  /** filter options moved to the "Hidden" section: "<prefix><group>/<id>" */
  hiddenFilters: string[]
  /** move options at 100% to the "Completed" section */
  hideCompleted: boolean
  progressionMode: ProgressionMode
  /** item, bestiary and chest search: typos allowed or the exact text */
  searchMode: SearchMode
  /** item search: also suggest the best-matching NPC (S5) */
  searchNpcs: boolean
  layout: Layout
}

interface PrefsActions {
  setColumns(columns: Record<string, boolean>): void
  setTableSorting(sorting: ColumnSort[]): void
  setColumnSizes(sizes: Record<string, number>): void
  setBestiaryColumnSizes(sizes: Record<string, number>): void
  setColumnOrder(order: string[]): void
  setViews(views: ViewsPrefs): void
  setEntryOrder(group: string, order: EntryOrder): void
  setChestDetection(detection: ChestDetection): void
  setStationsRequired(required: boolean): void
  setSectionOpen(id: string, open: boolean): void
  setAutosave(autosave: boolean): void
  setSyncScope(playthroughId: string, scope: ScanScope): void
  setChestScope(playthroughId: string, scope: ScanScope): void
  toggleHiddenFilter(key: string): void
  setHideCompleted(hide: boolean): void
  setProgressionMode(mode: ProgressionMode): void
  setSearchMode(mode: SearchMode): void
  setSearchNpcs(on: boolean): void
  setLayout(patch: Partial<Layout>): void
  /** settings dialog: layout and search mode back to the defaults */
  resetLayout(): void
}

const KEY = 'view-prefs'

function load(): Prefs {
  const prefs: Prefs = {
    columns: {},
    tableSorting: [],
    columnSizes: {},
    bestiaryColumnSizes: {},
    columnOrder: [],
    views: { overrides: {}, custom: [], order: [] },
    entryOrder: {},
    chestDetection: DEFAULT_DETECTION,
    stationsRequired: true,
    openSections: {},
    autosave: false,
    syncScopes: {},
    chestScopes: {},
    hiddenFilters: [],
    hideCompleted: true,
    progressionMode: 'upTo',
    searchMode: 'fuzzy',
    searchNpcs: true,
    layout: DEFAULT_LAYOUT,
  }
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (p && typeof p.columns === 'object') prefs.columns = p.columns
    if (Array.isArray(p.tableSorting)) prefs.tableSorting = p.tableSorting.filter(isSort)
    prefs.columnOrder = stringList(p?.columnOrder) ?? []
    prefs.views = readViews(p?.views)
    const sizes = (v: unknown) =>
      Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter(
          (e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0,
        ),
      )
    if (p && typeof p.columnSizes === 'object' && p.columnSizes) prefs.columnSizes = sizes(p.columnSizes)
    if (p && typeof p.bestiaryColumnSizes === 'object' && p.bestiaryColumnSizes)
      prefs.bestiaryColumnSizes = sizes(p.bestiaryColumnSizes)
    if (p && typeof p.entryOrder === 'object') prefs.entryOrder = p.entryOrder
    const d = p?.chestDetection
    if (d && d.distance > 0 && d.minGroup > 1) prefs.chestDetection = { distance: +d.distance, minGroup: +d.minGroup }
    if (typeof p.stationsRequired === 'boolean') prefs.stationsRequired = p.stationsRequired
    if (p && typeof p.openSections === 'object') prefs.openSections = p.openSections
    if (typeof p.autosave === 'boolean') prefs.autosave = p.autosave
    if (p && typeof p.syncScopes === 'object') prefs.syncScopes = p.syncScopes
    if (p && typeof p.chestScopes === 'object') prefs.chestScopes = p.chestScopes
    if (Array.isArray(p.hiddenFilters))
      prefs.hiddenFilters = p.hiddenFilters.filter((k: unknown) => typeof k === 'string')
    if (typeof p.hideCompleted === 'boolean') prefs.hideCompleted = p.hideCompleted
    if (p.progressionMode === 'upTo' || p.progressionMode === 'exactly') prefs.progressionMode = p.progressionMode
    if (p.searchMode === 'fuzzy' || p.searchMode === 'exact') prefs.searchMode = p.searchMode
    if (typeof p.searchNpcs === 'boolean') prefs.searchNpcs = p.searchNpcs
    prefs.layout = readLayout(p?.layout)
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
    setBestiaryColumnSizes: (bestiaryColumnSizes) => update({ bestiaryColumnSizes }),
    setColumnOrder: (columnOrder) => update({ columnOrder }),
    setViews: (views) => update({ views }),
    setEntryOrder: (group, order) => update({ entryOrder: { ...get().entryOrder, [group]: order } }),
    setChestDetection: (chestDetection) => update({ chestDetection }),
    setStationsRequired: (stationsRequired) => update({ stationsRequired }),
    setSectionOpen: (id, open) => update({ openSections: { ...get().openSections, [id]: open } }),
    setAutosave: (autosave) => update({ autosave }),
    setSyncScope: (id, scope) => update({ syncScopes: { ...get().syncScopes, [id]: scope } }),
    setChestScope: (id, scope) => update({ chestScopes: { ...get().chestScopes, [id]: scope } }),
    toggleHiddenFilter: (key) => {
      const list = get().hiddenFilters
      update({ hiddenFilters: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] })
    },
    setHideCompleted: (hideCompleted) => update({ hideCompleted }),
    setProgressionMode: (progressionMode) => update({ progressionMode }),
    setSearchMode: (searchMode) => update({ searchMode }),
    setSearchNpcs: (searchNpcs) => update({ searchNpcs }),
    setLayout: (patch) => update({ layout: { ...get().layout, ...patch } }),
    resetLayout: () => update({ layout: DEFAULT_LAYOUT, searchMode: 'fuzzy' }),
  }
})
