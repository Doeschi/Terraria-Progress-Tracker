import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/store'
import {
  canSaveInPlace,
  getLoadedModified,
  isClassicFile,
  pickFileClassic,
  setClassicFile,
  setLoadedModified,
} from '@/lib/files'
import { useUi } from '@/ui'
import { openRememberedPlayer, parsePlayerFile, pickPlayerFile, rememberPlayerHandle } from '@/lib/player'
import { confirm } from '@/lib/confirm'
import { findPlaythrough } from '@/lib/saveFile'

/**
 * Load a player file for a playthrough (pick a file, or re-open the remembered one), like
 * useWorldLoader. `remembered`: try the remembered file first. `pick`: ask for a file when there
 * is none (false for automatic loads, e.g. when continuing a session).
 */
export function usePlayerLoader() {
  const [loading, setLoading] = useState(false)

  /** `classic`: the classic file dialog (W10, e.g. Steam Cloud saves); undefined: as the file was
   * chosen last time for this playthrough. `refresh`: read again before a sync (W11) - an unchanged
   * file is not parsed again, and the caller opens the sync dialog. Returns 'new' for a different
   * character (its own dialogs open). */
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
      const useClassic = canSaveInPlace && (classic ?? isClassicFile('player', playthroughId))
      try {
        if (remembered) file = await openRememberedPlayer(playthroughId)
        if (!file && !pick) return false
        if (!file && useClassic) {
          file = await pickFileClassic('.plr')
          if (!file) return false
        } else if (!file) {
          const picked = await pickPlayerFile()
          if (!picked) return false
          file = picked.file
          handle = picked.handle
        }
      } catch (err) {
        if (!pick)
          toast.info('The player file could not be reloaded – use the button next to the player to reconnect it.')
        else toast.error(err instanceof Error ? err.message : String(err))
        return false
      }

      // unchanged since it was read (W11)
      if (
        refresh &&
        useStore.getState().players[playthroughId] &&
        file.lastModified === getLoadedModified('player', playthroughId)
      )
        return true

      setLoading(true)
      try {
        const player = await parsePlayerFile(file)
        const attached = findPlaythrough(useStore.getState().doc, playthroughId)?.player
        if (attached && attached.name !== player.name) {
          const ok = await confirm({
            title: 'Different character',
            description: (
              <>
                This playthrough is attached to <em>{attached.name}</em>, but you selected <em>{player.name}</em>.
                Attach the new character instead?
              </>
            ),
            confirmLabel: 'Attach new character',
          })
          if (!ok) return false
        }
        useStore.getState().setPlayer(playthroughId, player)
        setLoadedModified('player', playthroughId, file.lastModified)
        if (handle) void rememberPlayerHandle(playthroughId, handle)
        // chosen with the classic dialog: chosen that way again; the normal way: back to normal (W10)
        if (!remembered || handle) {
          setClassicFile('player', playthroughId, useClassic && !handle)
          if (useClassic && !handle) void rememberPlayerHandle(playthroughId, null)
        }
        toast.success(
          <span>
            Loaded player <em>{player.name}</em>
          </span>,
        )
        // a new character: offer the first sync right away
        const newPlayer = !attached || attached.name !== player.name
        if (newPlayer && playthroughId === useStore.getState().activeId)
          useUi.getState().open({ type: 'sync', section: 'items' })
        return newPlayer ? 'new' : true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { load, loading }
}
