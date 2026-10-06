import { toast } from 'sonner'
import { useStore } from '@/store'
import { useUi } from '@/ui'
import { choose, confirm } from '@/lib/confirm'
import { openTrackingFile } from '@/lib/files'
import {
  createDriveFile,
  DriveError,
  driveFileInfo,
  driveSignIn,
  readDriveFile,
  trashDriveFile,
  updateDriveFile,
  type DriveFile,
  type DriveRef,
} from '@/lib/drive'
import { parseSaveFile, serializeSaveFile, type SaveFile } from '@/lib/saveFile'
import { formatRelativeDay } from '@/lib/format'

// File actions shared by the top bar and the welcome screen.

export async function confirmDiscard(): Promise<boolean> {
  if (!useStore.getState().dirty) return true
  return confirm({
    title: 'Discard unsaved changes?',
    description: 'The current file has changes that are not saved yet.',
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

/** Save (Ctrl+S): to the file on disk, or to the Drive for a file that lives there (GD4).
 * `saveAs`: another file on disk - for a Drive file a local copy, the Drive file stays open. */
export async function saveAction(saveAs = false) {
  const { drive, saving } = useStore.getState()
  if (saving) return
  try {
    if (drive && !saveAs) await saveDrive()
    else if (drive) {
      if (await useStore.getState().saveCopy()) toast.success('Saved a local copy')
    } else if (await useStore.getState().save(saveAs)) toast.success('Saved')
  } catch (err) {
    driveFailed('Saving failed', err)
  }
}

// ------------------------------------------------------------ Google Drive

/** A closed sign-in window is no error; everything else is shown. */
function driveFailed(what: string, err: unknown) {
  if (err instanceof DriveError && err.kind === 'cancelled') return
  toast.error(`${what}: ${err instanceof Error ? err.message : String(err)}`)
}

/** "Open from Google Drive…": sign in (inside the click), then the list of the app's files. */
export async function openFromDriveAction() {
  try {
    await driveSignIn()
    useUi.getState().open({ type: 'drive' })
  } catch (err) {
    driveFailed('Google Drive', err)
  }
}

/** Open a file of the Drive list. */
export async function openDriveFile(file: DriveFile): Promise<boolean> {
  if (!(await confirmDiscard())) return false
  try {
    const { file: current, text } = await readDriveFile(file.id)
    useStore.getState().loadFile({
      doc: parseSaveFile(text),
      fileName: current.name,
      handle: null,
      drive: { id: current.id, revision: current.revision },
    })
    return true
  } catch (err) {
    driveFailed('The file could not be opened', err)
    return false
  }
}

/** Delete a file of the Drive list: after asking, it goes to the trash of the Drive. The file
 * that is open stays open here, as an unsaved file. */
export async function deleteDriveFile(file: DriveFile): Promise<boolean> {
  const open = useStore.getState().drive?.id === file.id
  const ok = await confirm({
    title: `Delete ${file.name}?`,
    description: `It is moved to the trash of your Google Drive and can be restored there for 30 days.${open ? ' It is the file you have open: your progress stays open here as an unsaved file.' : ''}`,
    confirmLabel: 'Move to trash',
    destructive: true,
  })
  if (!ok) return false
  try {
    await trashDriveFile(file.id)
    if (useStore.getState().drive?.id === file.id) useStore.getState().driveFileDeleted()
    toast.success(`${file.name} is in the trash of your Google Drive`)
    return true
  } catch (err) {
    driveFailed('The file could not be deleted', err)
    return false
  }
}

/** "Save to Google Drive": first the name of the new file (the dialog saves, see saveToDrive). */
export function saveToDriveAction() {
  if (useStore.getState().doc) useUi.getState().open({ type: 'driveSave' })
}

export const DEFAULT_DRIVE_NAME = 'terraria-progress.json'

/** The name as it is saved: trimmed, the default when empty, ending in ".json". */
export function driveFileName(name: string): string {
  const trimmed = name.trim() || DEFAULT_DRIVE_NAME
  return /\.json$/i.test(trimmed) ? trimmed : `${trimmed}.json`
}

/** The open file becomes a new file of this name in the Drive and lives there. Runs inside the
 * click on "Save", so Google's window may open. False when it failed or was cancelled. */
export async function saveToDrive(name: string): Promise<boolean> {
  const { doc } = useStore.getState()
  if (!doc) return false
  const progress = savingToDrive()
  try {
    const file = await createDriveFile(driveFileName(name), serializeSaveFile(doc))
    useStore.getState().savedToDrive(doc, file)
    progress.done(`Saved to Google Drive as ${file.name} – Save (Ctrl+S) writes there from now on`)
    return true
  } catch (err) {
    progress.failed()
    driveFailed('Saving to Google Drive failed', err)
    return false
  }
}

/** While a save to the Drive runs: the spinner next to the file (F9) and a toast that turns
 * into the result. `pause` while the user is asked something, `done` / `failed` end it. */
function savingToDrive() {
  const id = toast.loading('Saving to Google Drive…')
  useStore.getState().setSaving(true)
  return {
    pause: () => {
      toast.dismiss(id)
      useStore.getState().setSaving(false)
    },
    resume: () => {
      toast.loading('Saving to Google Drive…', { id })
      useStore.getState().setSaving(true)
    },
    done: (message: string) => {
      useStore.getState().setSaving(false)
      toast.success(message, { id })
    },
    failed: () => {
      useStore.getState().setSaving(false)
      toast.dismiss(id)
    },
  }
}

/** Save a Drive file: not over a change from another device without asking (GD5). */
async function saveDrive() {
  const { doc, drive, fileName } = useStore.getState()
  if (!doc || !drive) return
  const progress = savingToDrive()
  try {
    await saveDriveChecked(doc, drive, fileName, serializeSaveFile(doc), progress)
  } catch (err) {
    progress.failed()
    throw err
  }
}

async function saveDriveChecked(
  doc: SaveFile,
  drive: DriveRef,
  fileName: string | null,
  text: string,
  progress: ReturnType<typeof savingToDrive>,
) {
  let remote: DriveFile
  try {
    remote = await driveFileInfo(drive.id)
  } catch (err) {
    if (!(err instanceof DriveError) || err.kind !== 'gone') throw err
    progress.pause()
    const again = await confirm({
      title: 'The file is no longer in your Google Drive',
      description: 'It was deleted or moved to the trash. Save your progress to the Drive as a new file?',
      confirmLabel: 'Save as a new file',
    })
    if (!again) return
    progress.resume()
    const file = await createDriveFile(fileName ?? DEFAULT_DRIVE_NAME, text)
    useStore.getState().savedToDrive(doc, file)
    progress.done(`Saved to Google Drive as ${file.name}`)
    return
  }
  if (remote.revision !== drive.revision) {
    progress.pause()
    const answer = await choose(
      {
        title: 'Changed on another device',
        description: `${remote.name} was saved to your Google Drive ${formatRelativeDay(remote.modifiedTime)} – after you opened it here. Saving now would replace that version.`,
      },
      [
        { id: 'load', label: 'Load that version', destructive: true },
        { id: 'copy', label: 'Save mine as a copy' },
        { id: 'overwrite', label: 'Overwrite', destructive: true },
      ],
    )
    if (!answer) return
    if (answer === 'load') {
      const { file, text: theirs } = await readDriveFile(drive.id)
      useStore.getState().loadFile({
        doc: parseSaveFile(theirs),
        fileName: file.name,
        handle: null,
        drive: { id: file.id, revision: file.revision },
      })
      toast.success('Loaded the version from Google Drive')
      return
    }
    progress.resume()
    if (answer === 'copy') {
      const copy = await createDriveFile(copyName(remote.name), text)
      useStore.getState().savedToDrive(doc, copy)
      progress.done(`Saved to Google Drive as ${copy.name}`)
      return
    }
  }
  useStore.getState().savedToDrive(doc, await updateDriveFile(drive.id, text))
  progress.done('Saved to Google Drive')
}

/** "name (copy 2026-10-05 14-32).json" */
function copyName(name: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}-${p(now.getMinutes())}`
  return `${name.replace(/\.json$/i, '').replace(/ \(copy [\d\- ]+\)$/, '')} (copy ${stamp}).json`
}

/**
 * After "Continue where you left off" with a Drive file: is there a newer version in the Drive
 * (saved on another device)? Runs inside the click, so Google's window may open. Without unsaved
 * changes the newer version is loaded; with them the user decides. Failing is no problem: saving
 * checks again.
 */
export async function checkDriveVersion() {
  const { drive } = useStore.getState()
  if (!drive) return
  try {
    const remote = await driveFileInfo(drive.id)
    const now = useStore.getState()
    if (now.drive?.id !== drive.id || remote.revision === now.drive.revision) return
    if (now.dirty) {
      const load = await confirm({
        title: 'Newer version in your Google Drive',
        description: `${remote.name} was saved to your Google Drive ${formatRelativeDay(remote.modifiedTime)}. Load it and discard the unsaved changes in this browser?`,
        confirmLabel: 'Load the Drive version',
        destructive: true,
      })
      if (!load) return
    }
    const { file, text } = await readDriveFile(drive.id)
    useStore.getState().loadFile({
      doc: parseSaveFile(text),
      fileName: file.name,
      handle: null,
      drive: { id: file.id, revision: file.revision },
    })
    toast.success('Loaded the newer version from Google Drive')
  } catch (err) {
    if (err instanceof DriveError && err.kind === 'gone')
      toast.warning('The file is no longer in your Google Drive – saving will ask to create it again.')
    else toast.info('Google Drive could not be checked for a newer version – it is checked again when you save.')
  }
}
