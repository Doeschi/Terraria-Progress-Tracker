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
  canSaveInPlace,
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
import { loadView, saveView } from './lib/viewState'
import { useUi } from './ui'
import { carryOver } from './lib/dataUpdate'
import type { Difficulty, GameData, PlatformId } from './lib/types'
import type { LoadedWorld } from './lib/world'
import type { LoadedPlayer } from './lib/player'
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
  /** Parsed player files of this session, by playthrough id. Never saved. */
  players: Record<string, LoadedPlayer>

  selection: Selection
  /** options of "Sources & sets" shown in the sidebar (FL18) */
  picked: string[]
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
  setPlayer(playthroughId: string, player: LoadedPlayer): void
  detachPlayer(playthroughId: string): void
  saveArea(playthroughId: string, area: Area): void
  deleteArea(playthroughId: string, areaId: string): void

  toggleFilter(group: GroupKey, id: string): void
  clearFilter(group?: GroupKey): void
  /** add an option to "Sources & sets" (and select it) */
  pickSource(id: string): void
  /** remove it from the group (and from the selection) */
  unpickSource(id: string): void
  /** "Show its items in the table": only this option selected, no search, the item list */
  showSourceItems(id: string): void
  setSearch(search: string): void
  setView(view: ViewMode): void

  setMode(mode: TrackerMode): void
  toggleBestiaryFilter(group: BestiaryGroupKey, id: string): void
  clearBestiaryFilter(group?: BestiaryGroupKey): void
  setBestiarySearch(search: string): void
  setBestiaryView(view: BestiaryViewMode): void
}

const DEFAULT_FILE_NAME = 'terraria-progress.json'

/** `name_2026-09-30_14-32.json`: an earlier timestamp or a browser's `(1)` suffix is replaced. */
function downloadName(fileName: string, now = new Date()): string {
  const base = fileName
    .replace(/\.json$/i, '')
    .replace(/(\s*\(\d+\))+$/, '')
    .replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/, '')
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}`
  return `${base || 'terraria-progress'}_${stamp}.json`
}

/** the game data load in progress (loadData is called twice in dev, see there) */
let loading: Promise<void> | null = null

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
  // the list's view of a playthrough, as it was left (remembered in the browser, viewState.ts);
  // the item of the detail panel goes to the ui store
  const viewOf = (playthroughId: string | null | undefined) => {
    const { detailKey, ...view } = loadView(playthroughId)
    useUi.setState({ detailKey, detailHistory: [] })
    return view
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
    players: {},
    selection: emptySelection(),
    picked: [],
    search: '',
    view: 'all',
    mode: 'items',
    bestiarySelection: emptyBestiarySelection(),
    bestiarySearch: '',
    bestiaryView: 'all',

    loadData() {
      // one load at a time: StrictMode (dev) runs the calling effect twice
      loading ??= loadGameData()
        .then((data) => set({ data, dataError: null }))
        .catch((err) => set({ dataError: err instanceof Error ? err.message : String(err) }))
        .finally(() => {
          loading = null
        })
      return loading
    },

    newFile() {
      set({
        doc: { ...newSaveFile(), dataVersion: get().data?.meta.dataVersion || undefined },
        fileName: null,
        handle: null,
        dirty: true,
        lastSavedAt: null,
        autosaveStatus: 'ok',
        worlds: {},
        players: {},
        ...viewOf(null),
      })
    },

    loadFile({ doc: opened, fileName, handle }, dirty = false) {
      // newer item data than the file was last used with: renamed keys move along, the changes are
      // shown once (DU5)
      const data = get().data
      const { doc, report } = data ? carryOver(opened, data) : { doc: opened, report: null }
      if (report) useUi.getState().open({ type: 'dataUpdate', report })
      set({
        doc,
        fileName,
        handle,
        dirty: dirty || doc !== opened,
        lastSavedAt: null,
        autosaveStatus: 'ok',
        worlds: {},
        players: {},
        ...viewOf(doc.activePlaythroughId),
      })
    },

    closeFile() {
      set({
        doc: null,
        fileName: null,
        handle: null,
        dirty: false,
        worlds: {},
        players: {},
        ...viewOf(null),
      })
      void clearBackup()
    },

    async save(saveAs = false) {
      const { doc, fileName, handle } = get()
      if (!doc) return false
      // downloads get a timestamp: the browser may rename them, so each one is told apart by its time
      const name = canSaveInPlace ? (fileName ?? DEFAULT_FILE_NAME) : downloadName(fileName ?? DEFAULT_FILE_NAME)
      const result = await saveTrackingFile(doc, name, saveAs ? null : handle)
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
      set(viewOf(p.id))
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
      const { [id]: _player, ...players } = get().players
      set({ worlds, players })
    },

    setActivePlaythrough(id) {
      mutateDoc((doc) => ({ ...doc, activePlaythroughId: id }))
      set(viewOf(id))
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
      mutatePlaythrough(playthroughId, (p) => {
        // the world's game mode decides the difficulty
        const difficulty = GAME_MODE_DIFFICULTY[world.gameMode] ?? p.difficulty
        const ref = {
          name: world.name,
          guid: world.guid,
          fileName: world.fileName,
          width: world.width,
          height: world.height,
          worldSurface: world.worldSurface,
          lastSyncedAt: p.world?.guid === world.guid ? p.world.lastSyncedAt : null,
        }
        // reloading the same world (e.g. on "Continue") changes nothing: the file stays unmodified
        const same =
          difficulty === p.difficulty &&
          p.world !== null &&
          (Object.keys(ref) as (keyof typeof ref)[]).every((k) => p.world![k] === ref[k])
        return same ? p : { ...p, difficulty, world: ref }
      })
    },

    setPlayer(playthroughId, player) {
      set({ players: { ...get().players, [playthroughId]: player } })
      mutatePlaythrough(playthroughId, (p) => {
        // reloading the same file (e.g. on "Continue") changes nothing: the file stays unmodified
        if (p.player && p.player.name === player.name && p.player.fileName === player.fileName) return p
        return { ...p, player: { name: player.name, fileName: player.fileName, lastSyncedAt: null } }
      })
    },

    detachPlayer(playthroughId) {
      const { [playthroughId]: _removed, ...players } = get().players
      set({ players })
      mutatePlaythrough(playthroughId, (p) => ({ ...p, player: null }))
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

    pickSource(id) {
      const { picked, selection } = get()
      set({
        picked: picked.includes(id) ? picked : [...picked, id],
        selection: selection.source.includes(id) ? selection : { ...selection, source: [...selection.source, id] },
      })
    },
    unpickSource(id) {
      const { picked, selection } = get()
      set({
        picked: picked.filter((x) => x !== id),
        selection: { ...selection, source: selection.source.filter((x) => x !== id) },
      })
    },
    showSourceItems(id) {
      const { picked } = get()
      set({
        picked: picked.includes(id) ? picked : [...picked, id],
        selection: { ...emptySelection(), source: [id] },
        search: '',
        mode: 'items',
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

// remember the list's view of the active playthrough (filters, search, …, detail item)
let saveTimer: ReturnType<typeof setTimeout> | undefined
function rememberView() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const s = useStore.getState()
    const id = s.doc?.activePlaythroughId
    if (!id) return
    const { selection, search, view, mode, bestiarySelection, bestiarySearch, bestiaryView, picked } = s
    const { detailKey } = useUi.getState()
    saveView(id, { selection, search, view, mode, bestiarySelection, bestiarySearch, bestiaryView, detailKey, picked })
  }, 300)
}
useStore.subscribe((s, prev) => {
  if (
    s.selection !== prev.selection ||
    s.search !== prev.search ||
    s.view !== prev.view ||
    s.mode !== prev.mode ||
    s.bestiarySelection !== prev.bestiarySelection ||
    s.bestiarySearch !== prev.bestiarySearch ||
    s.bestiaryView !== prev.bestiaryView ||
    s.picked !== prev.picked
  )
    rememberView()
})
useUi.subscribe((s, prev) => {
  if (s.detailKey !== prev.detailKey) rememberView()
})

export function useActivePlaythrough(): Playthrough | null {
  return useStore((s) => activePlaythrough(s.doc) ?? null)
}

export function useActiveWorld(): LoadedWorld | null {
  return useStore((s) => (s.doc?.activePlaythroughId ? (s.worlds[s.doc.activePlaythroughId] ?? null) : null))
}

export function useActivePlayer(): LoadedPlayer | null {
  return useStore((s) => (s.doc?.activePlaythroughId ? (s.players[s.doc.activePlaythroughId] ?? null) : null))
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
