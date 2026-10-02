import { useEffect } from 'react'
import { ChevronDown, CircleAlert, FileCheck, FilePlus, FolderOpen, LogOut, Save, SaveAll, Upload } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { canSaveInPlace, fileLabel, requestWriteAccess } from '@/lib/files'
import { usePrefs } from '@/lib/prefs'
import { confirmDiscard, openFileAction, saveAction } from '@/actions'
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

// File menu (save, open, new, close, autosave) and the autosave status.

export function FileMenu() {
  const file = fileLabel(useStore((s) => s.fileName))
  const dirty = useStore((s) => s.dirty)
  const newFile = useStore((s) => s.newFile)
  const closeFile = useStore((s) => s.closeFile)
  const hasHandle = useStore((s) => !!s.handle)
  const autosave = usePrefs((s) => s.autosave)
  const setAutosave = usePrefs((s) => s.setAutosave)

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
          <Button variant="outline" size="sm" className="max-w-44" title={file.title}>
            <span className="truncate">{file.label}</span>
            {dirty && <span className="size-2 shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {canSaveInPlace ? 'Saves directly to the file on disk' : 'Saving downloads the file (browser limitation)'}
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void saveAction()}>
            {canSaveInPlace ? <Save /> : <Upload className="rotate-180" />} Save
            <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void saveAction(true)}>
            <SaveAll /> Save as…
            <DropdownMenuShortcut>Ctrl+⇧+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          {canSaveInPlace && (
            <DropdownMenuCheckboxItem
              checked={autosave}
              onCheckedChange={(v) => setAutosave(v === true)}
              // keep the menu open to see the effect
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex flex-col">
                Autosave every 2 minutes
                <span className="text-xs text-muted-foreground">
                  {hasHandle ? 'Also when you switch tabs or close the page' : 'Starts after the first manual save'}
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void openFileAction()}>
            <FolderOpen /> Open file…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => (await confirmDiscard()) && newFile()}>
            <FilePlus /> New file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={async () => (await confirmDiscard()) && closeFile()}>
            <LogOut /> Close file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Autosave state next to the file: last save, or why it is not saving. */
/** The autosave state, small, next to the "File" label: when it last saved, or why it does not. */
export function AutosaveStatus() {
  const enabled = usePrefs((s) => s.autosave) && canSaveInPlace
  const handle = useStore((s) => s.handle)
  const status = useStore((s) => s.autosaveStatus)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const dirty = useStore((s) => s.dirty)
  if (!enabled) return null

  if (!handle)
    return (
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
        {status === 'error' ? 'Autosave failed' : 'Autosave paused'}
      </button>
    )
  }
  return (
    <span
      className="flex items-center gap-1 text-[10px] text-muted-foreground"
      title={dirty ? 'Unsaved changes are saved within 2 minutes' : 'All changes are saved'}
    >
      {/* a file on this computer, nothing is uploaded */}
      <FileCheck className="size-3" />
      {lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Autosave on'}
    </span>
  )
}
