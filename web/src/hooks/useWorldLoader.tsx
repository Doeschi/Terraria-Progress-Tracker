import { useCallback } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/store'
import {
  canSaveInPlace,
  getLoadedModified,
  isClassicFile,
  openRememberedWorld,
  pickFileClassic,
  pickWorldFile,
  rememberWorldHandle,
  setClassicFile,
  setLoadedModified,
} from '@/lib/files'
import { useUi } from '@/ui'
import { parseWorldFile } from '@/lib/world'
import { bestiaryDiff } from '@/lib/bestiary'
import { DIFFICULTY_LABELS } from '@/lib/availability'
import { confirm } from '@/lib/confirm'
import { findPlaythrough } from '@/lib/saveFile'

const setLoading = (worldLoading: boolean) => useUi.setState({ worldLoading })

/**
 * Load a world file for a playthrough (pick a file, or re-open the remembered one).
 * `remembered`: try the remembered file first. `pick`: ask for a file when there is
 * none (false for automatic loads, e.g. when continuing a session).
 */
export function useWorldLoader() {
  const loading = useUi((s) => s.worldLoading)

  /** `classic`: the classic file dialog (W10, e.g. Steam Cloud saves); undefined: as the file was
   * chosen last time for this playthrough. `refresh`: read again before a sync (W11) - an unchanged
   * file is not parsed again, and the caller opens the sync dialog. Returns 'new' for a different
   * world (its own dialogs open). */
  const load = useCallback(
    async (
      playthroughId: string,
      remembered = false,
      pick = true,
      classic?: boolean,
      refresh = false,
    ): Promise<boolean | 'new'> => {
      let file: File | null = null
      let handle: FileSystemFileHandle | null = null
      const useClassic = canSaveInPlace && (classic ?? isClassicFile('world', playthroughId))
      try {
        if (remembered) file = await openRememberedWorld(playthroughId)
        if (!file && !pick) return false
        if (!file && useClassic) {
          file = await pickFileClassic('.wld')
          if (!file) return false
        } else if (!file) {
          const picked = await pickWorldFile()
          if (!picked) return false
          file = picked.file
          handle = picked.handle
        }
      } catch (err) {
        // automatic loads (no picking) fail quietly with a hint to the reconnect button
        if (!pick)
          toast.info('The world file could not be reloaded – use the button next to the world to reconnect it.')
        else toast.error(err instanceof Error ? err.message : String(err))
        return false
      }

      // unchanged since it was read (W11)
      if (
        refresh &&
        useStore.getState().worlds[playthroughId] &&
        file.lastModified === getLoadedModified('world', playthroughId)
      )
        return true

      setLoading(true)
      const toastId = toast.loading(`Reading ${file.name}…`)
      try {
        const world = await parseWorldFile(file, (p) => toast.loading(`Reading ${file.name}… ${p}%`, { id: toastId }))
        const attached = findPlaythrough(useStore.getState().doc, playthroughId)?.world
        if (attached && attached.guid !== world.guid) {
          toast.dismiss(toastId)
          const ok = await confirm({
            title: 'Different world',
            description: (
              <>
                This playthrough is attached to <em>{attached.name}</em>, but you selected <em>{world.name}</em>. Attach
                the new world instead? Your areas are kept but may not fit the new world.
              </>
            ),
            confirmLabel: 'Attach new world',
          })
          if (!ok) return false
        }
        const before = findPlaythrough(useStore.getState().doc, playthroughId)?.difficulty
        useStore.getState().setWorld(playthroughId, world)
        setLoadedModified('world', playthroughId, file.lastModified)
        const after = findPlaythrough(useStore.getState().doc, playthroughId)?.difficulty
        if (after && after !== before)
          toast.info(`Difficulty set to ${DIFFICULTY_LABELS[after]} from the world's game mode`)
        if (handle) void rememberWorldHandle(playthroughId, handle)
        // chosen with the classic dialog: chosen that way again; the normal way: back to normal (W10)
        if (!remembered || handle) {
          setClassicFile('world', playthroughId, useClassic && !handle)
          if (useClassic && !handle) void rememberWorldHandle(playthroughId, null)
        }
        const chests = world.containers.filter((c) => c.kind === 'chest').length
        toast.success(
          <span>
            Loaded world <em>{world.name}</em> – {chests} chests
          </span>,
          { id: toastId },
        )
        // a new world: areas, then the first sync (items and bestiary);
        // a reloaded world: the sync dialog only when the bestiary differs
        const { data, doc, players } = useStore.getState()
        const pt = findPlaythrough(doc, playthroughId)
        const diff = data && pt ? bestiaryDiff(data, pt, world, players[playthroughId] ?? null) : null
        const changes = diff ? diff.toCheck.length + diff.toUncheck.length : 0
        const newWorld = !attached || attached.guid !== world.guid
        if (!world.bestiary) toast.warning('The bestiary could not be read from this world.')
        if (newWorld) {
          useUi.getState().open({ type: 'areas', thenSync: true })
        } else if (!refresh && changes && playthroughId === useStore.getState().activeId) {
          useUi.getState().open({ type: 'sync', section: 'bestiary' })
        }
        if (!world.displaysAvailable)
          toast.warning(
            'Item frames, mannequins and other displays could not be read (newer world format). Chests work normally.',
          )
        return newWorld ? 'new' : true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err), { id: toastId })
        return false
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { load, loading }
}
