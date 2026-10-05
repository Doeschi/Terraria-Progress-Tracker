import { fileOpen, fileSave, supported as fsAccessSupported } from 'browser-fs-access'
import { del, get, set } from 'idb-keyval'
import { parseSaveFile, serializeSaveFile, type SaveFile } from './saveFile'
import type { DriveRef } from './drive'

// Opening/saving the progress file, the local backup and remembered world files.
// With the File System Access API (Chrome/Edge) files are written in place;
// other browsers get an upload dialog and a download.

export const canSaveInPlace = fsAccessSupported

export interface OpenedFile {
  doc: SaveFile
  fileName: string | null
  handle: FileSystemFileHandle | null
  /** the file lives in Google Drive (GD) */
  drive?: DriveRef | null
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
  /** the file lives in Google Drive (GD) */
  drive?: DriveRef | null
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
export function fileLabel(fileName: string | null, inDrive = false): { label: string; title?: string } {
  if (inDrive && fileName) return { label: fileName, title: `${fileName} – in your Google Drive` }
  if (canSaveInPlace || !fileName) return { label: fileName ?? 'Unsaved file' }
  return {
    label: 'Browser copy',
    title: `Your progress is kept in this browser; saving downloads a copy.\nLast file: ${fileName}`,
  }
}

// ------------------------------------------------- classic file dialog (W10)

/**
 * The classic file dialog (`<input type="file">`): no permanent access to the file, but no
 * folder is refused - Chrome/Edge do not open Steam's folder under Program Files (Steam Cloud
 * saves) with the File System Access API's picker.
 */
export function pickFileClassic(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

const classicKey = (kind: 'world' | 'player', playthroughId: string) => `classic-file:${kind}:${playthroughId}`

/** Whether the playthrough's world / player file was chosen with the classic dialog: then it is
 * chosen that way again when reconnecting (W10). */
export function isClassicFile(kind: 'world' | 'player', playthroughId: string): boolean {
  try {
    return localStorage.getItem(classicKey(kind, playthroughId)) === '1'
  } catch {
    return false
  }
}

export function setClassicFile(kind: 'world' | 'player', playthroughId: string, classic: boolean) {
  try {
    if (classic) localStorage.setItem(classicKey(kind, playthroughId), '1')
    else localStorage.removeItem(classicKey(kind, playthroughId))
  } catch {
    // storage unavailable: the normal dialog is offered again
  }
}

// -------------------------------------------------- changes in the game (W11)

type FileKind = 'world' | 'player'

/** The modification time of the loaded copy of each world / player file (this session). */
const loadedModified = new Map<string, number>()

export function setLoadedModified(kind: FileKind, playthroughId: string, lastModified: number) {
  loadedModified.set(`${kind}:${playthroughId}`, lastModified)
}

export function getLoadedModified(kind: FileKind, playthroughId: string): number | undefined {
  return loadedModified.get(`${kind}:${playthroughId}`)
}

/** The remembered file if it can be read without asking (read access granted), else null. */
export async function peekRememberedFile(kind: FileKind, playthroughId: string): Promise<File | null> {
  try {
    // the keys of rememberWorldHandle / rememberPlayerHandle
    const handle = await get<FileSystemFileHandle & PermissionHandle>(`${kind}-handle:${playthroughId}`)
    if (!handle || (await handle.queryPermission?.({ mode: 'read' })) !== 'granted') return null
    return await handle.getFile()
  } catch {
    return null
  }
}

/** Hover texts of the two ways to attach a world / player file (W10). */
export function attachHints(kind: FileKind) {
  const folder = kind === 'world' ? 'Worlds' : 'Players'
  return {
    local: `Saved locally (Documents\\My Games\\Terraria\\${folder}): can be automatically read when changes are synced`,
    steam:
      `Saved in the Steam Cloud (C:\\Program Files (x86)\\Steam\\userdata\\…\\105600\\remote\\${folder.toLowerCase()}): ` +
      'the browser does not allow permanent access for files in a system directory. These files must be reselected ' +
      'when synchronising the progress.',
  }
}

/** How the two ways differ, as a sentence under the buttons (W10). */
export const ATTACH_DIFFERENCE =
  'Non-Steam Cloud files are read again by themselves when you sync; Steam Cloud files are in a system folder ' +
  'the browser cannot keep access to, so they must be chosen again for each sync.'
