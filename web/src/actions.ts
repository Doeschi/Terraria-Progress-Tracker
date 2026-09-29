import { toast } from 'sonner'
import { useStore } from '@/store'
import { confirm } from '@/lib/confirm'
import { openTrackingFile } from '@/lib/files'

// File actions shared by the top bar and the welcome screen.

export async function confirmDiscard(): Promise<boolean> {
  if (!useStore.getState().dirty) return true
  return confirm({
    title: 'Discard unsaved changes?',
    description: 'The current file has changes that are not saved to disk yet.',
    confirmLabel: 'Discard',
    destructive: true,
  })
}

export async function openFileAction() {
  if (!(await confirmDiscard())) return
  try {
    const opened = await openTrackingFile()
    if (opened) useStore.getState().loadFile(opened)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

export async function saveAction(saveAs = false) {
  try {
    if (await useStore.getState().save(saveAs)) toast.success('Saved')
  } catch (err) {
    toast.error(`Saving failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
