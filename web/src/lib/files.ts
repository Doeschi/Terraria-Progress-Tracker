import { fileOpen, fileSave, supported as fsAccessSupported } from 'browser-fs-access'
import { del, get, set } from 'idb-keyval'
import { parseSaveFile, serializeSaveFile, type SaveFile } from './saveFile'

// Opening/saving the progress file, the local backup and remembered world files.
// With the File System Access API (Chrome/Edge) files are written in place;
// other browsers get an upload dialog and a download.

export const canSaveInPlace = fsAccessSupported

export interface OpenedFile {
  doc: SaveFile
  fileName: string | null
  handle: FileSystemFileHandle | null
}

export async function openTrackingFile(): Promise<OpenedFile | null> {
  let file: File & { handle?: FileSystemFileHandle }
  try {
    file = await fileOpen({ description: 'Progress file', extensions: ['.json'], mimeTypes: ['application/json'] })
  } catch (err) {
    if (isAbort(err)) return null
    throw err
  }
  const doc = parseSaveFile(await file.text())
  return { doc, fileName: file.name, handle: file.handle ?? null }
}

/** Returns the handle/file name that was written, or null if the user cancelled. */
export async function saveTrackingFile(
  doc: SaveFile,
  fileName: string,
  handle: FileSystemFileHandle | null,
): Promise<{ fileName: string; handle: FileSystemFileHandle | null } | null> {
  const blob = new Blob([serializeSaveFile(doc)], { type: 'application/json' })
  try {
    const newHandle = await fileSave(
      blob,
      { fileName, extensions: ['.json'], description: 'Progress file' },
      handle,
      false, // if the old handle is no longer usable, show a save dialog instead
    )
    return { fileName: newHandle?.name ?? fileName, handle: newHandle ?? null }
  } catch (err) {
    if (isAbort(err)) return null
    throw err
  }
}

// ---------------------------------------------------------------- autosave

/** Can the file be written without asking (permission already granted in this session)? */
export async function canWriteQuietly(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as FileSystemFileHandle & PermissionHandle
  return (await h.queryPermission?.({ mode: 'readwrite' })) === 'granted'
}

/** Ask for write access again (needs a click; e.g. after reloading the page). */
export async function requestWriteAccess(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as FileSystemFileHandle & PermissionHandle
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

/** Write the progress file in place, never showing a dialog (autosave). */
export async function writeTrackingFile(doc: SaveFile, handle: FileSystemFileHandle): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(serializeSaveFile(doc))
  await writable.close()
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// ------------------------------------------------------------------ backup

const BACKUP_KEY = 'backup'

export interface Backup {
  doc: SaveFile
  fileName: string | null
  handle: FileSystemFileHandle | null
  dirty: boolean
  savedAt: string
}

export async function writeBackup(backup: Backup): Promise<void> {
  try {
    await set(BACKUP_KEY, backup)
  } catch {
    // e.g. private mode without IndexedDB - the backup is a convenience only
  }
}

export async function readBackup(): Promise<Backup | null> {
  try {
    const backup = (await get<Backup>(BACKUP_KEY)) ?? null
    if (!backup) return null
    // re-validate: the backup may come from an older app version
    backup.doc = parseSaveFile(JSON.stringify(backup.doc))
    return backup
  } catch {
    return null
  }
}

export async function clearBackup(): Promise<void> {
  try {
    await del(BACKUP_KEY)
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------ world files

const worldKey = (playthroughId: string) => `world-handle:${playthroughId}`

interface PermissionHandle {
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

export async function pickWorldFile(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
  try {
    const file = (await fileOpen({ description: 'Terraria world', extensions: ['.wld'] })) as File & {
      handle?: FileSystemFileHandle
    }
    return { file, handle: file.handle ?? null }
  } catch (err) {
    if (isAbort(err)) return null
    throw err
  }
}

export async function rememberWorldHandle(playthroughId: string, handle: FileSystemFileHandle | null) {
  try {
    if (handle) await set(worldKey(playthroughId), handle)
    else await del(worldKey(playthroughId))
  } catch {
    // ignore
  }
}

export async function hasRememberedWorld(playthroughId: string): Promise<boolean> {
  try {
    return !!(await get(worldKey(playthroughId)))
  } catch {
    return false
  }
}

/** Re-open a remembered world file (Chrome/Edge). Must be called from a user gesture. */
export async function openRememberedWorld(playthroughId: string): Promise<File | null> {
  const handle = await get<FileSystemFileHandle & PermissionHandle>(worldKey(playthroughId))
  if (!handle) return null
  const opts = { mode: 'read' as const }
  if ((await handle.queryPermission?.(opts)) !== 'granted') {
    if ((await handle.requestPermission?.(opts)) !== 'granted') return null
  }
  return handle.getFile()
}

// ------------------------------------------------------------ file label

/**
 * What the file button shows. Without in-place saving the browser may rename downloads,
 * so the page does not know the file on disk: it shows the copy kept in the browser.
 */
export function fileLabel(fileName: string | null): { label: string; title?: string } {
  if (canSaveInPlace || !fileName) return { label: fileName ?? 'Unsaved file' }
  return {
    label: 'Browser copy',
    title: `Your progress is kept in this browser; saving downloads a copy.\nLast file: ${fileName}`,
  }
}
