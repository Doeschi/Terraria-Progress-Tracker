import { useEffect } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/store'
import { usePrefs } from '@/lib/prefs'
import { canSaveInPlace } from '@/lib/files'

// Autosave (opt-in, Chrome/Edge): writes the tracking file in place every two
// minutes while there are unsaved changes, and when the tab is hidden or the page
// is closed. Never shows a dialog - without write permission it pauses.

const INTERVAL = 2 * 60 * 1000

export function useAutosave() {
  const enabled = usePrefs((s) => s.autosave) && canSaveInPlace

  useEffect(() => {
    if (!enabled) return
    const run = async () => {
      const before = useStore.getState().autosaveStatus
      await useStore.getState().autoSave()
      if (useStore.getState().autosaveStatus === 'error' && before !== 'error')
        toast.error('Autosave failed – the file could not be written. Save it manually (Ctrl+S).')
    }
    const timer = setInterval(() => void run(), INTERVAL)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void run()
    }
    const onPageHide = () => void run()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [enabled])
}
