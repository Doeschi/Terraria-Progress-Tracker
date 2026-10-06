import { useEffect } from 'react'
import {
  ChevronDown,
  CircleAlert,
  Cloud,
  CloudUpload,
  FileCheck,
  FilePlus,
  FileText,
  FolderOpen,
  Loader2,
  LogOut,
  Save,
  SaveAll,
  Upload,
  UserX,
} from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { canSaveInPlace, fileLabel, requestWriteAccess } from '@/lib/files'
import { usePrefs } from '@/lib/prefs'
import { confirmDiscard, openFileAction, openFromDriveAction, saveAction, saveToDriveAction } from '@/actions'
import { driveAccount, driveSignOut } from '@/lib/drive'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatTime } from '@/lib/format'
import { useHeaderLevel } from './compact'

// File menu (save, open, new, close, autosave, Google Drive) and the save status.

export function FileMenu() {
  const inDrive = useStore((s) => !!s.drive)
  const file = fileLabel(
    useStore((s) => s.fileName),
    inDrive,
  )
  // a new file that was never saved: there is nothing to "Save" to yet, only "Save as…" and the Drive
  const unsaved = useStore((s) => s.fileName === null && !s.drive)
  const dirty = useStore((s) => s.dirty)
  const saving = useStore((s) => s.saving)
  const newFile = useStore((s) => s.newFile)
  const closeFile = useStore((s) => s.closeFile)
  const hasHandle = useStore((s) => !!s.handle)
  const autosave = usePrefs((s) => s.autosave)
  const setAutosave = usePrefs((s) => s.setAutosave)
  // a narrow desktop header: only the icon, the name on hover (P5a)
  const compact = useHeaderLevel() >= 3

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveAction(e.shiftKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-44" title={file.title ?? file.label}>
            {inDrive ? (
              <Cloud className="text-muted-foreground" />
            ) : (
              compact && <FileText className="text-muted-foreground" />
            )}
            {!compact && <span className="truncate">{file.label}</span>}
            {saving ? (
              <Loader2 className="shrink-0 animate-spin text-muted-foreground" aria-label="Saving" />
            ) : (
              dirty && <span className="size-2 shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />
            )}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {inDrive
              ? 'Saves to your Google Drive – only when you save (no autosave)'
              : unsaved
                ? 'Not saved yet – choose where to save it'
                : canSaveInPlace
                  ? 'Saves directly to the file on disk'
                  : 'Saving downloads the file (browser limitation)'}
          </DropdownMenuLabel>
          {!unsaved && (
            <DropdownMenuItem onSelect={() => void saveAction()}>
              {inDrive ? <CloudUpload /> : canSaveInPlace ? <Save /> : <Upload className="rotate-180" />} Save
              <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void saveAction(true)}>
            <SaveAll /> {inDrive ? 'Save a local copy…' : 'Save as…'}
            {/* a file never saved: Ctrl+S asks where to save it as well */}
            <DropdownMenuShortcut>{unsaved ? 'Ctrl+S' : 'Ctrl+⇧+S'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          {!inDrive && (
            <DropdownMenuItem onSelect={() => void saveToDriveAction()}>
              <CloudUpload /> Save to Google Drive
            </DropdownMenuItem>
          )}
          {/* only for a file on this computer that is written in place (F8): not before the first
              save, not for a Drive file */}
          {hasHandle && (
            <DropdownMenuCheckboxItem
              checked={autosave}
              onCheckedChange={(v) => setAutosave(v === true)}
              // keep the menu open to see the effect
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex flex-col">
                Autosave every 2 minutes
                <span className="text-xs text-muted-foreground">Also when you switch tabs or close the page</span>
              </span>
            </DropdownMenuCheckboxItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void openFileAction()}>
            <FolderOpen /> Open local file…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void openFromDriveAction()}>
            <Cloud /> Open from Google Drive…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => (await confirmDiscard()) && newFile()}>
            <FilePlus /> New file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={async () => (await confirmDiscard()) && closeFile()}>
            <LogOut /> Close file
          </DropdownMenuItem>
          <DriveAccount />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** The Google account used for the Drive on this device, with "sign out" (GD3). Read when the
 * menu opens: the content of a closed menu is not rendered. */
function DriveAccount() {
  const account = driveAccount()
  if (!account) return null
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => driveSignOut()}>
        <UserX />
        <span className="flex min-w-0 flex-col">
          Sign out of Google Drive
          <span className="truncate text-xs text-muted-foreground">{account}</span>
        </span>
      </DropdownMenuItem>
    </>
  )
}

/** The save state, small, next to the "File" label: when it last saved, or why autosave does
 * not. A Drive file is only saved by hand (GD4): it shows the last save. */
export function AutosaveStatus() {
  const enabled = usePrefs((s) => s.autosave) && canSaveInPlace
  const handle = useStore((s) => s.handle)
  const inDrive = useStore((s) => !!s.drive)
  const status = useStore((s) => s.autosaveStatus)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const dirty = useStore((s) => s.dirty)
  const saving = useStore((s) => s.saving)
  // a narrow desktop header: only the icon, the text on hover (P5a)
  const compact = useHeaderLevel() >= 3
  if (saving)
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Saving…">
        <Loader2 className="size-3 animate-spin" />
        {!compact && 'Saving…'}
      </span>
    )
  if (inDrive)
    return lastSavedAt ? (
      <span
        className="flex items-center gap-1 text-[10px] text-muted-foreground"
        title={`Saved to Google Drive ${formatTime(lastSavedAt)}${dirty ? ' – changes since then are not in your Drive yet, save with Ctrl+S' : ''}`}
      >
        <Cloud className="size-3" />
        {!compact && `Saved ${formatTime(lastSavedAt)}`}
      </span>
    ) : null
  if (!enabled) return null

  if (!handle)
    return compact ? null : (
      <span className="text-[10px] text-muted-foreground" title="Autosave needs a file on disk: save once with Ctrl+S">
        Autosave: save once first
      </span>
    )
  if (status !== 'ok') {
    // paused (no write permission after a reload) or failed: a click can grant access again
    const resume = async () => {
      if (await requestWriteAccess(handle)) await useStore.getState().autoSave()
    }
    return (
      <button
        onClick={() => void resume()}
        className={cn(
          'flex items-center gap-1 rounded px-1 text-[10px] hover:bg-muted',
          status === 'error' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
        )}
        title={
          status === 'error'
            ? 'The last automatic save failed – click to try again'
            : 'The browser needs your permission to write the file again – click to allow it'
        }
      >
        <CircleAlert className="size-3" />
        {!compact && (status === 'error' ? 'Autosave failed' : 'Autosave paused')}
      </button>
    )
  }
  return (
    <span
      className="flex items-center gap-1 text-[10px] text-muted-foreground"
      title={`${lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Autosave on'} – ${dirty ? 'unsaved changes are saved within 2 minutes' : 'all changes are saved'}`}
    >
      {/* a file on this computer, nothing is uploaded */}
      <FileCheck className="size-3" />
      {!compact && (lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Autosave on')}
    </span>
  )
}
