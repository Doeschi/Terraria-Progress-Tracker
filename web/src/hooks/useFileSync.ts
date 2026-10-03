import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/store'
import { useUi, type SyncSection } from '@/ui'
import { getLoadedModified, peekRememberedFile } from '@/lib/files'
import { useWorldLoader } from './useWorldLoader'
import { usePlayerLoader } from './usePlayerLoader'

type Which = 'world' | 'player' | 'both'

/**
 * Sync with the world / player (W11): read the loaded files of the active playthrough again
 * (changes in the game), then open the sync dialog. Cancelling a file dialog cancels the sync.
 */
export function useFileSync() {
  const { load: loadWorld } = useWorldLoader()
  const { load: loadPlayer } = usePlayerLoader()

  return useCallback(
    async (which: Which, section?: SyncSection) => {
      const { activeId: id, worlds, players } = useStore.getState()
      if (!id) return
      // 'new': a different world / character, which opens its own dialogs
      if (which !== 'player' && worlds[id]) {
        const result = await loadWorld(id, true, true, undefined, true)
        if (!result || result === 'new') return
      }
      if (which !== 'world' && players[id]) {
        const result = await loadPlayer(id, true, true, undefined, true)
        if (!result || result === 'new') return
      }
      useUi.getState().open({ type: 'sync', section })
    },
    [loadWorld, loadPlayer],
  )
}

/**
 * Coming back to the tab: a toast when a loaded, remembered world / player file changed in the
 * game (W11). Only with read access already granted; nothing is parsed. Once per change.
 */
export function useFileChangeNotice() {
  const sync = useFileSync()

  useEffect(() => {
    const notified = new Map<string, number>()
    let running = false
    const check = async () => {
      if (document.visibilityState !== 'visible' || running) return
      running = true
      try {
        const { activeId: id, worlds, players } = useStore.getState()
        if (!id) return
        const changed: ('world' | 'player')[] = []
        let fresh = false
        for (const kind of ['world', 'player'] as const) {
          if (!(kind === 'world' ? worlds[id] : players[id])) continue
          const loaded = getLoadedModified(kind, id)
          const file = await peekRememberedFile(kind, id)
          if (!file || loaded === undefined || file.lastModified <= loaded) continue
          changed.push(kind)
          const key = `${kind}:${id}`
          if (notified.get(key) !== file.lastModified) fresh = true
          notified.set(key, file.lastModified)
        }
        if (!changed.length || !fresh) return
        const both = changed.length === 2
        const label = both ? 'World and player' : changed[0] === 'world' ? 'World' : 'Player'
        toast.info(`${label} changed in the game`, {
          id: 'file-changed',
          duration: 15000,
          action: { label: 'Sync', onClick: () => void sync(both ? 'both' : changed[0]) },
        })
      } finally {
        running = false
      }
    }
    const onCheck = () => void check()
    document.addEventListener('visibilitychange', onCheck)
    window.addEventListener('focus', onCheck)
    return () => {
      document.removeEventListener('visibilitychange', onCheck)
      window.removeEventListener('focus', onCheck)
    }
  }, [sync])
}
