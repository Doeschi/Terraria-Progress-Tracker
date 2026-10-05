import { useEffect, useState } from 'react'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { useUi } from '@/ui'
import { DRIVE_FOLDER, DriveError, driveAccount, listDriveFiles, type DriveFile } from '@/lib/drive'
import { formatRelativeDay } from '@/lib/format'
import { DEFAULT_DRIVE_NAME, deleteDriveFile, driveFileName, openDriveFile, saveToDrive } from '@/actions'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// "Open from Google Drive…" (GD3): the progress files this app saved to the user's Drive.
// "Save to Google Drive" (GD3): the name of the new file.

export function DriveSaveDialog() {
  const open = useUi((s) => s.dialog.type === 'driveSave')
  const close = useUi((s) => s.close)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{open && <DriveSaveForm onDone={close} />}</DialogContent>
    </Dialog>
  )
}

function DriveSaveForm({ onDone }: { onDone: () => void }) {
  // the name of the open file without ".json": the ending is added again when saving
  const [name, setName] = useState(() => (useStore.getState().fileName ?? DEFAULT_DRIVE_NAME).replace(/\.json$/i, ''))
  const [saving, setSaving] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const saved = await saveToDrive(name)
    setSaving(false)
    if (saved) onDone()
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Save to Google Drive</DialogTitle>
        <DialogDescription>
          Your progress is saved as a new file in the folder “{DRIVE_FOLDER}” of your Google Drive. From then on Save
          (Ctrl+S) writes there.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="drive-name">File name</Label>
        <Input
          id="drive-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onFocus={(e) => e.target.select()}
          maxLength={120}
        />
        <p className="text-xs text-muted-foreground">Saved as {driveFileName(name)}</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DriveDialog() {
  const open = useUi((s) => s.dialog.type === 'drive')
  const close = useUi((s) => s.close)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{open && <DriveFiles onDone={close} />}</DialogContent>
    </Dialog>
  )
}

function DriveFiles({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const account = driveAccount()
  const openId = useStore((s) => s.drive?.id)

  useEffect(() => {
    let active = true
    listDriveFiles().then(
      (list) => active && setFiles(list),
      (err) =>
        active &&
        setError(
          err instanceof DriveError && err.kind === 'cancelled'
            ? 'The Google sign-in was closed.'
            : err instanceof Error
              ? err.message
              : String(err),
        ),
    )
    return () => {
      active = false
    }
  }, [])

  const openFile = async (file: DriveFile) => {
    setOpening(file.id)
    const opened = await openDriveFile(file)
    setOpening(null)
    if (opened) onDone()
  }
  const deleteFile = async (file: DriveFile) => {
    if (await deleteDriveFile(file)) setFiles((list) => list?.filter((f) => f.id !== file.id) ?? null)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Open from Google Drive</DialogTitle>
        <DialogDescription>
          The progress files this app saved to your Google Drive{account && ` (${account})`}. Other files in your Drive
          are not visible to the app.
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : !files ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading your Google Drive…
        </p>
      ) : !files.length ? (
        <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
          No progress files in your Google Drive yet. Open or create a file, then choose File → Save to Google Drive.
        </p>
      ) : (
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center">
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => void openFile(f)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-60"
              >
                {opening === f.id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={f.name}>
                  {f.name}
                  {f.id === openId && <span className="font-normal text-muted-foreground"> · open</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeDay(f.modifiedTime)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-1 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={opening !== null}
                onClick={() => void deleteFile(f)}
                title={`Delete ${f.name} (to the trash of your Google Drive)`}
                aria-label={`Delete ${f.name}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  )
}
