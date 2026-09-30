import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FolderOpen, Globe, Loader2, X } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { cn } from '@/lib/utils'
import { useUi } from '@/ui'
import { DIFFICULTY_LABELS, GAME_MODE_DIFFICULTY, itemsForPlaythrough, versionLabel } from '@/lib/availability'
import { pickWorldFile, rememberWorldHandle } from '@/lib/files'
import { parseWorldFile, type LoadedWorld } from '@/lib/world'
import { DIFFICULTIES, type Difficulty, type PlatformId } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DifficultyIcon, WikiIcon } from '../common'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function PlaythroughDialog() {
  const dialog = useUi((s) => s.dialog)
  const close = useUi((s) => s.close)
  const open = dialog.type === 'newPlaythrough' || dialog.type === 'editPlaythrough'
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        {open && <PlaythroughForm edit={dialog.type === 'editPlaythrough'} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}

/** Creating a playthrough, or (`edit`) changing the active one - the same fields. */
function PlaythroughForm({ edit, onDone }: { edit: boolean; onDone: () => void }) {
  const data = useStore((s) => s.data)!
  const createPlaythrough = useStore((s) => s.createPlaythrough)
  const updatePlaythrough = useStore((s) => s.updatePlaythrough)
  const detachWorld = useStore((s) => s.detachWorld)
  const active = useActivePlaythrough()
  const pt = edit ? active : null
  const loadedWorld = useStore((s) => (pt ? s.worlds[pt.id] : undefined))
  const [name, setName] = useState(pt?.name ?? '')
  const [platform, setPlatform] = useState<PlatformId>(pt?.platform ?? 'desktop')
  const [difficulty, setDifficulty] = useState<Difficulty>(pt?.difficulty ?? 'classic')
  const [gameVersion, setGameVersion] = useState<string | null>(pt?.gameVersion ?? null)
  // optional world: read right away, attached on create / save
  const [world, setWorld] = useState<{ data: LoadedWorld; handle: FileSystemFileHandle | null } | null>(null)
  // editing: the attached world is kept unless removed or replaced
  const [removeWorld, setRemoveWorld] = useState(false)
  const keptWorld = pt?.world && !removeWorld && !world ? pt.world : null
  const [reading, setReading] = useState<number | null>(null) // progress in percent while reading
  // same rule as the tracker itself, so this is the total the progress will count
  // (unobtainable items start ignored)
  const itemCount = useMemo(
    () => itemsForPlaythrough(data, { platform, difficulty, gameVersion }).filter((i) => !i.unobtainable).length,
    [data, platform, difficulty, gameVersion],
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    let id: string
    if (pt) {
      id = pt.id
      // unchanged settings leave the file unmodified
      updatePlaythrough(id, (p) =>
        p.name === trimmed && p.platform === platform && p.difficulty === difficulty && p.gameVersion === gameVersion
          ? p
          : { ...p, name: trimmed, platform, difficulty, gameVersion },
      )
      if (removeWorld && !world) detachWorld(id)
    } else {
      id = createPlaythrough(trimmed, platform, difficulty, gameVersion)
    }
    onDone()
    if (world) {
      useStore.getState().setWorld(id, world.data)
      if (world.handle) void rememberWorldHandle(id, world.handle)
      // continue with the areas of the new world, then the first sync
      useUi.getState().open({ type: 'areas', thenSync: true })
    }
  }

  const chooseWorld = async () => {
    try {
      const picked = await pickWorldFile()
      if (!picked) return
      setReading(0)
      const data = await parseWorldFile(picked.file, setReading)
      setWorld({ data, handle: picked.handle })
      // the world decides the difficulty; its name is a good default name
      setDifficulty(GAME_MODE_DIFFICULTY[data.gameMode] ?? difficulty)
      if (!name.trim()) setName(data.name)
      if (!data.displaysAvailable)
        toast.warning('Item frames, mannequins and other displays could not be read (newer world format).')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setReading(null)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{pt ? 'Playthrough settings' : 'New playthrough'}</DialogTitle>
        <DialogDescription>
          Only items that exist on this platform, difficulty and game version are shown and counted.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pt-name">Name</Label>
        <Input
          id="pt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Master mode summoner"
          autoFocus={!pt}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Platform</Label>
        <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformId)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.platforms.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <WikiIcon src={p.icon} alt="" size={16} />
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>
          World <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        {keptWorld ? (
          // editing: the attached world
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <Globe
              className={cn(
                'size-4 shrink-0',
                loadedWorld ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium italic">{keptWorld.name}</div>
              <div className="text-xs text-muted-foreground">
                {keptWorld.width} × {keptWorld.height} tiles
                {loadedWorld
                  ? ` · ${loadedWorld.containers.filter((c) => c.kind === 'chest').length} chests`
                  : ' · not loaded in this session'}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void chooseWorld()}
              disabled={reading !== null}
            >
              {reading !== null ? `${reading}%` : 'Change…'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setRemoveWorld(true)}
              aria-label="Detach world"
              title="Detach the world (areas are kept)"
            >
              <X />
            </Button>
          </div>
        ) : world ? (
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <Globe className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium italic">{world.data.name}</div>
              <div className="text-xs text-muted-foreground">
                {world.data.width} × {world.data.height} tiles ·{' '}
                {world.data.containers.filter((c) => c.kind === 'chest').length} chests ·{' '}
                <span className="inline-flex items-center gap-1 align-bottom">
                  <DifficultyIcon difficulty={GAME_MODE_DIFFICULTY[world.data.gameMode] ?? 'classic'} size={14} />
                  {DIFFICULTY_LABELS[GAME_MODE_DIFFICULTY[world.data.gameMode] ?? 'classic']}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setWorld(null)}
              aria-label="Remove world"
            >
              <X />
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => void chooseWorld()} disabled={reading !== null}>
            {reading !== null ? <Loader2 className="animate-spin" /> : <FolderOpen />}
            {reading !== null ? `Reading world… ${reading}%` : 'Choose world file…'}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">The world is processed locally in your browser.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Difficulty</Label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  <DifficultyIcon difficulty={d} />
                  {DIFFICULTY_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Game version</Label>
          <Select value={gameVersion ?? 'latest'} onValueChange={(v) => setGameVersion(v === 'latest' ? null : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">
                <WikiIcon src={data.versions.at(-1)?.icon} alt="" size={16} />
                {versionLabel(data, null)}
              </SelectItem>
              {[...data.versions].reverse().map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <WikiIcon src={v.icon} alt="" size={16} />
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <span className="text-sm text-muted-foreground">Items in this playthrough</span>
        <span className="text-lg font-semibold tabular-nums" aria-live="polite">
          {itemCount.toLocaleString()}
        </span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {difficulty === 'classic'
          ? 'Expert- and Master-only items (e.g. treasure bag accessories, relics) are not counted.'
          : difficulty === 'expert'
            ? 'Master-only items (e.g. relics, Master pets) are not counted.'
            : 'All difficulty-specific items are counted.'}{' '}
        {pt
          ? 'Checked items stay checked when they are hidden by these settings.'
          : 'Unobtainable items are ignored. All settings can be changed later.'}
      </p>
      <DialogFooter>
        <Button type="submit" disabled={!name.trim()}>
          {pt ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  )
}
