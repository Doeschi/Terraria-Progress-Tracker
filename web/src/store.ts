import { create } from 'zustand'
import { loadGameData } from './lib/data'
import type { DriveFile, DriveRef } from './lib/drive'
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
  findPlaythrough,
  newPlaythrough,
  newSaveFile,
  type Area,
  type Playthrough,
  type SaveFile,
} from './lib/saveFile'
import { GAME_MODE_DIFFICULTY, startsIgnored } from './lib/availability'
import { chooseActive, loadView, rememberActive, saveView } from './lib/viewState'
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
  /** the selected playthrough - kept in the browser, not in the file (switching is no change) */
  activeId: string | null
  fileName: string | null
  handle: FileSystemFileHandle | null
  /** the file lives in Google Drive: its id and the revision loaded or saved last (GD) */
  drive: DriveRef | null
  dirty: boolean
  /** time of the last successful save of the file (manual or automatic) */
  lastSavedAt: string | null
  /** autosave: 'paused' = no write permission in this session, 'error' = the last write failed */
  autosaveStatus: 'ok' | 'paused' | 'error'
  /** the file is being written (to disk or to the Drive): a spinner next to it (F9) */
  saving: boolean

  /** Parsed worlds of this session, by playthrough id. Never saved. */
  worlds: Record<string, LoadedWorld>
  /** Parsed player files of this session, by playthrough id. Never saved. */
  players: Record<string, LoadedPlayer>

  selection: Selection
  /** groups whose selected options must all apply, not any of them (FL3a) */
  requireAll: GroupKey[]
  /** options of "Sources & sets" shown in the sidebar (FL18) */
  picked: string[]
  search: string
  view: ViewMode

  /** main view: item list or bestiary */
  mode: TrackerMode
  bestiarySelection: BestiarySelection
  bestiaryRequireAll: BestiaryGroupKey[]
  bestiarySearch: string
  bestiaryView: BestiaryViewMode
}

interface Actions {
  loadData(): Promise<void>

  newFile(): void
  loadFile(file: OpenedFile, dirty?: boolean): void
  closeFile(): void
  save(saveAs?: boolean): Promise<boolean>
  /** Write a local copy of the file; what is open (a Drive file) stays as it is. */
  saveCopy(): Promise<boolean>
  /** `doc` was written to this Drive file: it is the open file now (GD) */
  savedToDrive(doc: SaveFile, file: DriveFile): void
  /** the open file's Drive file was deleted: it has no place any more and is unsaved (GD) */
  driveFileDeleted(): void
  /** a save (to the Drive) is running or done: the spinner next to the file */
  setSaving(saving: boolean): void
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
  /** all filters at once (undo of "Clear all") */
  setSelection(selection: Selection, requireAll: GroupKey[]): void
  /** a group's selected options must all apply - or any of them again (FL3a) */
  toggleRequireAll(group: GroupKey): void
  setView(view: ViewMode): void

  setMode(mode: TrackerMode): void
  toggleBestiaryFilter(group: BestiaryGroupKey, id: string): void
  clearBestiaryFilter(group?: BestiaryGroupKey): void
  setBestiarySearch(search: string): void
  setBestiarySelection(selection: BestiarySelection, requireAll: BestiaryGroupKey[]): void
  toggleBestiaryRequireAll(group: BestiaryGroupKey): void
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
    const id = get().activeId
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
    activeId: null,
    fileName: null,
    handle: null,
    drive: null,
    dirty: false,
    lastSavedAt: null,
    autosaveStatus: 'ok',
    saving: false,
    worlds: {},
    players: {},
    selection: emptySelection(),
    requireAll: [],
    picked: [],
    search: '',
    view: 'all',
    mode: 'items',
    bestiarySelection: emptyBestiarySelection(),
    bestiaryRequireAll: [],
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
        activeId: null,
        fileName: null,
        handle: null,
        drive: null,
        dirty: true,
        lastSavedAt: null,
        autosaveStatus: 'ok',
        worlds: {},
        players: {},
        ...viewOf(null),
      })
    },

    loadFile({ doc: opened, fileName, handle, drive = null }, dirty = false) {
      // newer item data than the file was last used with: renamed keys move along, the changes are
      // shown once (DU5)
      const data = get().data
      const { doc, report } = data ? carryOver(opened, data) : { doc: opened, report: null }
      if (report) useUi.getState().open({ type: 'dataUpdate', report })
      const activeId = chooseActive(doc)
      set({
        doc,
        activeId,
        fileName,
        handle,
        drive,
        dirty: dirty || doc !== opened,
        lastSavedAt: null,
        autosaveStatus: 'ok',
        worlds: {},
        players: {},
        ...viewOf(activeId),
      })
    },

    closeFile() {
      set({
        doc: null,
        activeId: null,
        fileName: null,
        handle: null,
        drive: null,
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
      set({ saving: true })
      let result: Awaited<ReturnType<typeof saveTrackingFile>>
      try {
        result = await saveTrackingFile(doc, name, saveAs ? null : handle)
      } finally {
        set({ saving: false })
      }
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

    async saveCopy() {
      const { doc, fileName } = get()
      if (!doc) return false
      const name = canSaveInPlace ? (fileName ?? DEFAULT_FILE_NAME) : downloadName(fileName ?? DEFAULT_FILE_NAME)
      set({ saving: true })
      try {
        return !!(await saveTrackingFile(doc, name, null))
      } finally {
        set({ saving: false })
      }
    },

    savedToDrive(doc, file) {
      set({
        fileName: file.name,
        handle: null,
        drive: { id: file.id, revision: file.revision },
        // only clear "dirty" if nothing changed while it was written
        dirty: get().doc !== doc,
        lastSavedAt: new Date().toISOString(),
        autosaveStatus: 'ok',
      })
    },

    driveFileDeleted() {
      if (get().drive) set({ drive: null, dirty: true, lastSavedAt: null })
    },

    setSaving(saving) {
      set({ saving })
    },

    async autoSave() {
      const { doc, handle, dirty } = get()
      if (!doc || !handle || !dirty) return
      try {
        if (!(await canWriteQuietly(handle))) {
          set({ autosaveStatus: 'paused' })
          return
        }
        set({ saving: true })
        await writeTrackingFile(doc, handle)
        set({ dirty: get().doc !== doc, lastSavedAt: new Date().toISOString(), autosaveStatus: 'ok' })
      } catch {
        set({ autosaveStatus: 'error' })
      } finally {
        set({ saving: false })
      }
    },

    createPlaythrough(name, platform, difficulty, gameVersion) {
      const p = {
        ...newPlaythrough(name, platform, difficulty, gameVersion),
        // unobtainable items and other forms of an item do not count towards progress by default
        // (they can be un-ignored)
        ignored:
          get()
            .data?.items.filter(startsIgnored)
            .map((i) => i.key) ?? [],
      }
      mutateDoc((doc) => ({
        ...doc,
        playthroughs: [...doc.playthroughs, p],
      }))
      rememberActive(p.id)
      set({ activeId: p.id, ...viewOf(p.id) })
      return p.id
    },

    updatePlaythrough: mutatePlaythrough,

    deletePlaythrough(id) {
      mutateDoc((doc) => ({ ...doc, playthroughs: doc.playthroughs.filter((p) => p.id !== id) }))
      if (get().activeId === id) {
        const next = get().doc?.playthroughs[0]?.id ?? null
        rememberActive(next)
        set({ activeId: next, ...viewOf(next) })
      }
      const { [id]: _removed, ...worlds } = get().worlds
      const { [id]: _player, ...players } = get().players
      set({ worlds, players })
    },

    setActivePlaythrough(id) {
      rememberActive(id)
      set({ activeId: id, ...viewOf(id) })
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
      set({
        selection: { ...get().selection, [group]: next },
        // the mode goes with the last option of the group
        requireAll: next.length ? get().requireAll : get().requireAll.filter((g) => g !== group),
      })
    },

    clearFilter(group) {
      set({
        selection: group ? { ...get().selection, [group]: [] } : emptySelection(),
        requireAll: group ? get().requireAll.filter((g) => g !== group) : [],
      })
    },

    setSelection(selection, requireAll) {
      set({ selection, requireAll })
    },

    toggleRequireAll(group) {
      const { requireAll } = get()
      set({ requireAll: requireAll.includes(group) ? requireAll.filter((g) => g !== group) : [...requireAll, group] })
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
      set({
        bestiarySelection: { ...get().bestiarySelection, [group]: next },
        bestiaryRequireAll: next.length
          ? get().bestiaryRequireAll
          : get().bestiaryRequireAll.filter((g) => g !== group),
      })
    },
    clearBestiaryFilter(group) {
      set({
        bestiarySelection: group ? { ...get().bestiarySelection, [group]: [] } : emptyBestiarySelection(),
        bestiaryRequireAll: group ? get().bestiaryRequireAll.filter((g) => g !== group) : [],
      })
    },
    setBestiarySearch: (bestiarySearch) => set({ bestiarySearch }),
    setBestiarySelection: (bestiarySelection, bestiaryRequireAll) => set({ bestiarySelection, bestiaryRequireAll }),
    toggleBestiaryRequireAll(group) {
      const { bestiaryRequireAll } = get()
      set({
        bestiaryRequireAll: bestiaryRequireAll.includes(group)
          ? bestiaryRequireAll.filter((g) => g !== group)
          : [...bestiaryRequireAll, group],
      })
    },
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
    const id = s.activeId
    if (!id) return
    const { selection, requireAll, search, view, mode, bestiarySelection, bestiaryRequireAll } = s
    const { bestiarySearch, bestiaryView, picked } = s
    const { detailKey } = useUi.getState()
    saveView(id, {
      selection,
      requireAll,
      search,
      view,
      mode,
      bestiarySelection,
      bestiaryRequireAll,
      bestiarySearch,
      bestiaryView,
      detailKey,
      picked,
    })
  }, 300)
}
useStore.subscribe((s, prev) => {
  if (
    s.selection !== prev.selection ||
    s.requireAll !== prev.requireAll ||
    s.bestiaryRequireAll !== prev.bestiaryRequireAll ||
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
  return useStore((s) => findPlaythrough(s.doc, s.activeId) ?? null)
}

export function useActiveWorld(): LoadedWorld | null {
  return useStore((s) => (s.activeId ? (s.worlds[s.activeId] ?? null) : null))
}

export function useActivePlayer(): LoadedPlayer | null {
  return useStore((s) => (s.activeId ? (s.players[s.activeId] ?? null) : null))
}

// ------------------------------------------------------- local backup

let backupTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((state, prev) => {
  if (!state.doc) return
  if (
    state.doc === prev.doc &&
    state.dirty === prev.dirty &&
    state.handle === prev.handle &&
    state.drive === prev.drive
  )
    return
  clearTimeout(backupTimer)
  backupTimer = setTimeout(() => {
    const { doc, fileName, handle, drive, dirty } = useStore.getState()
    if (doc)
      void writeBackup({
        doc,
        fileName,
        handle,
        drive,
        dirty,
        savedAt: new Date().toISOString(),
      })
  }, 400)
})
