import { toast } from 'sonner'
import { useStore } from '@/store'

// "Clear all" (S3a): the active filters and the search of the view that is shown - items or
// bestiary - are cleared, by the button in the active-filters line or by Escape. A toast offers
// to put them back: Escape is pressed by reflex.

/** Clears the filters and the search of the current view; false when there was nothing to clear. */
export function clearAllFilters(): boolean {
  const s = useStore.getState()
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
  toast('Filters cleared', { id: 'filters-cleared', action: { label: 'Undo', onClick: restore } })
}
