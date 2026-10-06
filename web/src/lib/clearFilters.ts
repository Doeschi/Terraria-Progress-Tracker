import { toast } from 'sonner'
import { useStore } from '@/store'

// "Clear all" (S3a): the active filters and the search of the view that is shown - items or
// bestiary - are cleared, by the button in the active-filters line or by Escape. A toast offers
// to put them back (its "Undo" button, or Ctrl+Z while it shows): Escape is pressed by reflex.

const TOAST = 'filters-cleared'
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
/** what Ctrl+Z puts back while the toast shows */
let pendingUndo: (() => void) | null = null

/** Clears the filters and the search of the current view; false when there was nothing to clear
 * (the statistics have no filters). */
export function clearAllFilters(): boolean {
  const s = useStore.getState()
  if (s.mode === 'stats') return false
  if (s.mode === 'bestiary') {
    const { bestiarySelection, bestiaryRequireAll, bestiarySearch } = s
    if (!bestiarySearch && Object.values(bestiarySelection).every((ids) => !ids.length)) return false
    s.clearBestiaryFilter()
    s.setBestiarySearch('')
    undoable(() => {
      useStore.getState().setBestiarySelection(bestiarySelection, bestiaryRequireAll)
      useStore.getState().setBestiarySearch(bestiarySearch)
    })
    return true
  }
  const { selection, requireAll, search } = s
  if (!search && Object.values(selection).every((ids) => !ids.length)) return false
  s.clearFilter()
  s.setSearch('')
  undoable(() => {
    useStore.getState().setSelection(selection, requireAll)
    useStore.getState().setSearch(search)
  })
  return true
}

function undoable(restore: () => void) {
  pendingUndo = restore
  const forget = () => {
    pendingUndo = null
  }
  toast('Filters cleared', {
    id: TOAST,
    description: `${isMac ? '⌘Z' : 'Ctrl+Z'} puts them back`,
    action: { label: 'Undo', onClick: restore },
    onDismiss: forget,
    onAutoClose: forget,
  })
}

/** Ctrl+Z while "Filters cleared" shows: the filters and the search come back. False otherwise. */
export function undoClearFilters(): boolean {
  if (!pendingUndo) return false
  const restore = pendingUndo
  pendingUndo = null
  restore()
  toast.dismiss(TOAST)
  return true
}
