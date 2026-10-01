import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/store'
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

  const load = useCallback(async (playthroughId: string, remembered = false, pick = true) => {
    let file: File | null = null
    let handle: FileSystemFileHandle | null = null
    try {
      if (remembered) file = await openRememberedPlayer(playthroughId)
      if (!file && !pick) return false
      if (!file) {
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

    setLoading(true)
    try {
      const player = await parsePlayerFile(file)
      const attached = findPlaythrough(useStore.getState().doc, playthroughId)?.player
      if (attached && attached.name !== player.name) {
        const ok = await confirm({
          title: 'Different character',
          description: (
            <>
              This playthrough is attached to <em>{attached.name}</em>, but you selected <em>{player.name}</em>. Attach
              the new character instead?
            </>
          ),
          confirmLabel: 'Attach new character',
        })
        if (!ok) return false
      }
      useStore.getState().setPlayer(playthroughId, player)
      if (handle) void rememberPlayerHandle(playthroughId, handle)
      toast.success(
        <span>
          Loaded player <em>{player.name}</em>
        </span>,
      )
      // a new character: offer the first sync right away
      const newPlayer = !attached || attached.name !== player.name
      if (newPlayer && playthroughId === useStore.getState().doc?.activePlaythroughId)
        useUi.getState().open({ type: 'sync', section: 'player' })
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return { load, loading }
}
