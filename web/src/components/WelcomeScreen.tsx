import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  Clock,
  Cloud,
  FilePlus,
  FileText,
  FolderOpen,
  Globe,
  Hammer,
  History,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  Swords,
} from 'lucide-react'
import { useStore } from '@/store'
import { canSaveInPlace, clearBackup, fileLabel, hasRememberedWorld, readBackup, type Backup } from '@/lib/files'
import { hasRememberedPlayer } from '@/lib/player'
import { usePlayerLoader } from '@/hooks/usePlayerLoader'
import { useWorldLoader } from '@/hooks/useWorldLoader'
import { findPlaythrough } from '@/lib/saveFile'
import { chooseActive } from '@/lib/viewState'
import { itemsForPlaythrough, startsIgnored } from '@/lib/availability'
import { Button } from '@/components/ui/button'
import { checkDriveVersion, openFileAction, openFromDriveAction } from '@/actions'
import { AiNotice, Credits } from './Credits'
import { formatRelativeDay } from '@/lib/format'
import { Logo } from './Logo'

export function WelcomeScreen() {
  const data = useStore((s) => s.data)!
  const newFile = useStore((s) => s.newFile)
  const loadFile = useStore((s) => s.loadFile)
  const [backup, setBackup] = useState<Backup | null>(null)
  const { load } = useWorldLoader()
  const { load: loadPlayer } = usePlayerLoader()

  useEffect(() => {
    readBackup().then(setBackup)
  }, [])

  // Continue: restore the session, then reload the active playthrough's world and player files
  // if the browser remembers them. Runs inside the click, so the browser may ask for read access
  // right away; without a remembered file the header offers "reconnect".
  const continueSession = (b: Backup) => {
    loadFile({ doc: b.doc, fileName: b.fileName, handle: b.handle, drive: b.drive }, b.dirty)
    // a Drive file: is there a newer version from another device? (GD5)
    if (b.drive) void checkDriveVersion()
    const pt = findPlaythrough(b.doc, chooseActive(b.doc))
    if (!pt || !canSaveInPlace) return
    const id = pt.id
    if (pt.world) void hasRememberedWorld(id).then((remembered) => remembered && load(id, true, false))
    if (pt.player) void hasRememberedPlayer(id).then((remembered) => remembered && loadPlayer(id, true, false))
  }

  // as the progress of a new PC playthrough counts them: unobtainable items and other forms of an
  // item are ignored by default
  const itemCount = useMemo(
    () =>
      itemsForPlaythrough(data, { platform: 'desktop', difficulty: 'master', gameVersion: null }).filter(
        (i) => !startsIgnored(i),
      ).length,
    [data],
  )

  const features = [
    {
      icon: ListChecks,
      title: 'Every item, counted',
      text: `All ${itemCount.toLocaleString('en')} items from the Terraria Wiki – per playthrough, with its own platform, difficulty and game version.`,
    },
    {
      icon: SlidersHorizontal,
      title: 'Filters with live progress',
      text: 'Categories, sources, vendors, bosses, events, biomes, rarity and updates – each with its own progress bar.',
    },
    {
      icon: Hammer,
      title: 'Crafting recipes',
      text: 'How an item is made, what it is used in, and what you can craft right now – from your items or your chests.',
    },
    {
      icon: Swords,
      title: 'Drops & bosses',
      text: 'Who drops what and which chests, crates and trees contain it – with the chances for Classic, Expert and Master, and how often it should have dropped by now.',
    },
    {
      icon: BookOpen,
      title: 'Bestiary',
      text: `All ${data.bestiary.entries.length} entries, checked by hand or straight from your world.`,
    },
    {
      icon: Globe,
      title: 'Sync with your game',
      text: 'Check off items from your inventory, chests and bestiary, and find any item in your chests on a map.',
    },
  ]

  return (
    <div className="grid min-h-svh place-items-center bg-gradient-to-b from-emerald-500/10 via-background to-background p-4">
      <div className="flex w-full max-w-2xl flex-col gap-8 py-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size={64} />
          <h1 className="text-2xl font-semibold">Terraria Progress Tracker</h1>
          <p className="max-w-md text-sm text-balance text-muted-foreground">
            Your companion for a 100% run: see what's still missing, how to get it – and let your game files do the
            tracking.
          </p>
        </div>

        <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <f.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{f.title}</div>
                <p className="text-xs text-muted-foreground">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
          {backup && <ContinueButton backup={backup} onClick={() => continueSession(backup)} />}
          <Button size="lg" variant="outline" className="justify-start" onClick={() => void openFileAction()}>
            <FolderOpen /> Open progress file…
          </Button>
          <Button size="lg" variant="outline" className="justify-start" onClick={() => void openFromDriveAction()}>
            <Cloud /> Open from Google Drive…
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="justify-start"
            onClick={() => {
              void clearBackup()
              newFile()
            }}
          >
            <FilePlus /> Create new progress file
          </Button>
        </div>

        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" />
            <span>
              Everything runs in your browser. Game files are never uploaded, and your progress file only to your own
              Google Drive if you choose that; only item icons are loaded from the Terraria Wiki.{' '}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href={`${import.meta.env.BASE_URL}privacy.html`}
                target="_blank"
                rel="noreferrer"
              >
                Privacy policy
              </a>
            </span>
          </p>
          <Credits withIcon />
          <AiNotice />
        </div>
      </div>
    </div>
  )
}

/** The last session: file name, when it was saved, unsaved changes and the active playthrough. */
function ContinueButton({ backup, onClick }: { backup: Backup; onClick: () => void }) {
  const pt = findPlaythrough(backup.doc, chooseActive(backup.doc))
  const file = fileLabel(backup.fileName, !!backup.drive)
  return (
    <button
      onClick={onClick}
      title={file.title}
      className="group flex w-full items-center gap-3 rounded-lg bg-primary px-4 py-3 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <History className="size-5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">Continue where you left off</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-85">
          <span className="flex min-w-0 items-center gap-1">
            {backup.drive ? <Cloud className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
            <span className="truncate">
              {file.label}
              {pt && ` · ${pt.name}`}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5 shrink-0" />
            {formatRelativeDay(backup.savedAt)}
          </span>
          {backup.dirty && (
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-400" />
              unsaved changes
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
