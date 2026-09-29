import { create } from 'zustand'
import { loadGameData } from './lib/data'
import {
  buildFilterGroups,
  emptySelection,
  parentMap,
  type GroupKey,
  type Selection,
  type ViewMode,
} from './lib/filtering'
import {
  canWriteQuietly,
  clearBackup,
  saveTrackingFile,
  writeBackup,
  writeTrackingFile,
  type OpenedFile,
} from './lib/files'
import {
  activePlaythrough,
  findPlaythrough,
  newPlaythrough,
  newSaveFile,
  type Area,
  type Playthrough,
  type SaveFile,
} from './lib/saveFile'
import { GAME_MODE_DIFFICULTY } from './lib/availability'
import type { Difficulty, GameData, PlatformId } from './lib/types'
import type { LoadedWorld } from './lib/world'
import {
  emptyBestiarySelection,
  type BestiaryGroupKey,
  type BestiarySelection,
  type BestiaryViewMode,
} from './lib/bestiary'

export type TrackerMode = 'items' | 'bestiary'

interface State {
  data: GameData | null
  dataError: string | null

  doc: SaveFile | null
  fileName: string | null
  handle: FileSystemFileHandle | null
  dirty: boolean
  /** time of the last successful save of the file (manual or automatic) */
  lastSavedAt: string | null
  /** autosave: 'paused' = no write permission in this session, 'error' = the last write failed */
  autosaveStatus: 'ok' | 'paused' | 'error'

  /** Parsed worlds of this session, by playthrough id. Never saved. */
  worlds: Record<string, LoadedWorld>

  selection: Selection
  search: string
  view: ViewMode

  /** main view: item list or bestiary */
  mode: TrackerMode
  bestiarySelection: BestiarySelection
  bestiarySearch: string
  bestiaryView: BestiaryViewMode
}

interface Actions {
  loadData(): Promise<void>

  newFile(): void
  loadFile(file: OpenedFile, dirty?: boolean): void
  closeFile(): void
  save(saveAs?: boolean): Promise<boolean>
  /** Save silently if possible (file on disk, write permission, unsaved changes). */
  autoSave(): Promise<void>

  /** returns the new playthrough's id */
  createPlaythrough(name: string, platform: PlatformId, difficulty: Difficulty, gameVersion: string | null): string
  updatePlaythrough(id: string, fn: (p: Playthrough) => Playthrough): void
  deletePlaythrough(id: string): void
  setActivePlaythrough(id: string): void

  setChecked(keys: string[], value: boolean): void
  setIgnored(keys: string[], value: boolean): void
  /** mark bestiary entries as unlocked / not unlocked */
  setBestiary(ids: string[], value: boolean): void

  setWorld(playthroughId: string, world: LoadedWorld): void
  detachWorld(playthroughId: string): void
  saveArea(playthroughId: string, area: Area): void
  deleteArea(playthroughId: string, areaId: string): void

  toggleFilter(group: GroupKey, id: string): void
  clearFilter(group?: GroupKey): void
  setSearch(search: string): void
  setView(view: ViewMode): void

  setMode(mode: TrackerMode): void
  toggleBestiaryFilter(group: BestiaryGroupKey, id: string): void
  clearBestiaryFilter(group?: BestiaryGroupKey): void
  setBestiarySearch(search: string): void
  setBestiaryView(view: BestiaryViewMode): void
}

const DEFAULT_FILE_NAME = 'terraria-progress.json'

export const useStore = create<State & Actions>()((set, get) => {
  const mutateDoc = (fn: (doc: SaveFile) => SaveFile) => {
    const doc = get().doc
    if (!doc) return
    const next = fn(doc)
    if (next !== doc) set({ doc: next, dirty: true })
  }
  // fn may return the playthrough unchanged, then nothing is marked as modified
  const mutatePlaythrough = (id: string, fn: (p: Playthrough) => Playthrough) =>
    mutateDoc((doc) => {
      const current = findPlaythrough(doc, id)
      if (!current) return doc
      const next = fn(current)
      if (next === current) return doc
      const updated = { ...next, updatedAt: new Date().toISOString() }
      return {
        ...doc,
        playthroughs: doc.playthroughs.map((p) => (p.id === id ? updated : p)),
      }
    })
  const mutateActive = (fn: (p: Playthrough) => Playthrough) => {
    const id = get().doc?.activePlaythroughId
    if (id) mutatePlaythrough(id, fn)
  }
  const resetView = {
    selection: emptySelection(),
    search: '',
    view: 'all' as ViewMode,
    bestiarySelection: emptyBestiarySelection(),
    bestiarySearch: '',
    bestiaryView: 'all' as BestiaryViewMode,
  }

  return {
    data: null,
    dataError: null,
    doc: null,
    fileName: null,
    handle: null,
    dirty: false,
    lastSavedAt: null,
    autosaveStatus: 'ok',
    worlds: {},
    selection: emptySelection(),
    search: '',
    view: 'all',
    mode: 'items',
    bestiarySelection: emptyBestiarySelection(),
    bestiarySearch: '',
    bestiaryView: 'all',

    async loadData() {
      try {
        set({ data: await loadGameData(), dataError: null })
      } catch (err) {
        set({ dataError: err instanceof Error ? err.message : String(err) })
      }
    },

    newFile() {
      set({
        doc: newSaveFile(),
        fileName: null,
        handle: null,
        dirty: true,
        lastSavedAt: null,
        autosaveStatus: 'ok',
        worlds: {},
        ...resetView,
      })
    },

    loadFile({ doc, fileName, handle }, dirty = false) {
      set({ doc, fileName, handle, dirty, lastSavedAt: null, autosaveStatus: 'ok', worlds: {}, ...resetView })
    },

    closeFile() {
      set({
        doc: null,
        fileName: null,
        handle: null,
        dirty: false,
        worlds: {},
        ...resetView,
      })
      void clearBackup()
    },

    async save(saveAs = false) {
      const { doc, fileName, handle } = get()
      if (!doc) return false
      const result = await saveTrackingFile(doc, fileName ?? DEFAULT_FILE_NAME, saveAs ? null : handle)
      if (!result) return false
      // only clear "dirty" if nothing changed while the save dialog was open
      set({
        fileName: result.fileName,
        handle: result.handle,
        dirty: get().doc !== doc,
        lastSavedAt: new Date().toISOString(),
        autosaveStatus: 'ok',
      })
      return true
    },

    async autoSave() {
      const { doc, handle, dirty } = get()
      if (!doc || !handle || !dirty) return
      try {
        if (!(await canWriteQuietly(handle))) {
          set({ autosaveStatus: 'paused' })
          return
        }
        await writeTrackingFile(doc, handle)
        set({ dirty: get().doc !== doc, lastSavedAt: new Date().toISOString(), autosaveStatus: 'ok' })
      } catch {
        set({ autosaveStatus: 'error' })
      }
    },

    createPlaythrough(name, platform, difficulty, gameVersion) {
      const p = {
        ...newPlaythrough(name, platform, difficulty, gameVersion),
        // unobtainable items do not count towards progress by default (they can be un-ignored)
        ignored:
          get()
            .data?.items.filter((i) => i.unobtainable)
            .map((i) => i.key) ?? [],
      }
      mutateDoc((doc) => ({
        ...doc,
        playthroughs: [...doc.playthroughs, p],
        activePlaythroughId: p.id,
      }))
      set(resetView)
      return p.id
    },

    updatePlaythrough: mutatePlaythrough,

    deletePlaythrough(id) {
      mutateDoc((doc) => {
        const playthroughs = doc.playthroughs.filter((p) => p.id !== id)
        const activePlaythroughId =
          doc.activePlaythroughId === id ? (playthroughs[0]?.id ?? null) : doc.activePlaythroughId
        return { ...doc, playthroughs, activePlaythroughId }
      })
      const { [id]: _removed, ...worlds } = get().worlds
      set({ worlds })
    },

    setActivePlaythrough(id) {
      mutateDoc((doc) => ({ ...doc, activePlaythroughId: id }))
      set(resetView)
    },

    setChecked(keys, value) {
      mutateActive((p) => {
        const { list, changed } = applySet(p.checked, keys, value)
        return changed.length ? { ...p, checked: list, changedAt: stamp(p.changedAt, changed) } : p
      })
    },

    setIgnored(keys, value) {
      mutateActive((p) => {
        const { list, changed } = applySet(p.ignored, keys, value)
        return changed.length ? { ...p, ignored: list, changedAt: stamp(p.changedAt, changed) } : p
      })
    },

    setBestiary(ids, value) {
      mutateActive((p) => {
        const { list, changed } = applySet(p.bestiary, ids, value)
        return changed.length
          ? {
              ...p,
              bestiary: list,
              bestiaryChangedAt: stamp(p.bestiaryChangedAt, changed),
            }
          : p
      })
    },

    setWorld(playthroughId, world) {
      set({ worlds: { ...get().worlds, [playthroughId]: world } })
      mutatePlaythrough(playthroughId, (p) => ({
        ...p,
        // the world's game mode decides the difficulty
        difficulty: GAME_MODE_DIFFICULTY[world.gameMode] ?? p.difficulty,
        world: {
          name: world.name,
          guid: world.guid,
          fileName: world.fileName,
          width: world.width,
          height: world.height,
          worldSurface: world.worldSurface,
          lastSyncedAt: p.world?.guid === world.guid ? p.world.lastSyncedAt : null,
        },
      }))
    },

    detachWorld(playthroughId) {
      const { [playthroughId]: _removed, ...worlds } = get().worlds
      set({ worlds })
      mutatePlaythrough(playthroughId, (p) => ({ ...p, world: null }))
    },

    saveArea(playthroughId, area) {
      mutatePlaythrough(playthroughId, (p) => {
        const exists = p.areas.some((a) => a.id === area.id)
        return {
          ...p,
          areas: exists ? p.areas.map((a) => (a.id === area.id ? area : a)) : [...p.areas, area],
        }
      })
    },

    deleteArea(playthroughId, areaId) {
      mutatePlaythrough(playthroughId, (p) => ({
        ...p,
        areas: p.areas.filter((a) => a.id !== areaId),
      }))
    },

    toggleFilter(group, id) {
      const current = get().selection[group]
      let next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      const data = get().data
      if (data && !current.includes(id)) {
        // a parent (category, boss stage) and its own children are never selected together
        const parents = parentMap(buildFilterGroups(data))
        const parent = parents.get(`${group}/${id}`)
        next = next.filter((x) => `${group}/${x}` !== parent && parents.get(`${group}/${x}`) !== `${group}/${id}`)
      }
      set({ selection: { ...get().selection, [group]: next } })
    },

    clearFilter(group) {
      set({
        selection: group ? { ...get().selection, [group]: [] } : emptySelection(),
      })
    },

    setSearch: (search) => set({ search }),
    setView: (view) => set({ view }),

    setMode: (mode) => set({ mode }),
    toggleBestiaryFilter(group, id) {
      const current = get().bestiarySelection[group]
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      set({ bestiarySelection: { ...get().bestiarySelection, [group]: next } })
    },
    clearBestiaryFilter(group) {
      set({
        bestiarySelection: group ? { ...get().bestiarySelection, [group]: [] } : emptyBestiarySelection(),
      })
    },
    setBestiarySearch: (bestiarySearch) => set({ bestiarySearch }),
    setBestiaryView: (bestiaryView) => set({ bestiaryView }),
  }
})

/** Add or remove keys; also returns the keys whose state actually changed. */
function applySet(list: string[], keys: string[], value: boolean): { list: string[]; changed: string[] } {
  const s = new Set(list)
  const changed: string[] = []
  for (const k of keys) {
    if (s.has(k) === value) continue
    if (value) s.add(k)
    else s.delete(k)
    changed.push(k)
  }
  return { list: changed.length ? [...s] : list, changed }
}

/** Remember when these items were last changed. */
function stamp(changedAt: Record<string, string>, keys: string[]): Record<string, string> {
  const now = new Date().toISOString()
  const next = { ...changedAt }
  for (const k of keys) next[k] = now
  return next
}

// ------------------------------------------------------------ selectors

export function useActivePlaythrough(): Playthrough | null {
  return useStore((s) => activePlaythrough(s.doc) ?? null)
}

export function useActiveWorld(): LoadedWorld | null {
  return useStore((s) => (s.doc?.activePlaythroughId ? (s.worlds[s.doc.activePlaythroughId] ?? null) : null))
}

// ------------------------------------------------------- local backup

let backupTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((state, prev) => {
  if (!state.doc) return
  if (state.doc === prev.doc && state.dirty === prev.dirty && state.handle === prev.handle) return
  clearTimeout(backupTimer)
  backupTimer = setTimeout(() => {
    const { doc, fileName, handle, dirty } = useStore.getState()
    if (doc)
      void writeBackup({
        doc,
        fileName,
        handle,
        dirty,
        savedAt: new Date().toISOString(),
      })
  }, 400)
})
