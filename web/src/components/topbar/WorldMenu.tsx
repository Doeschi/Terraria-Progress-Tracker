import { useEffect, useState } from 'react'
import {
  ChevronDown,
  FolderOpen,
  FolderSearch,
  Globe,
  MapPinned,
  PackageSearch,
  Loader2,
  PlugZap,
  RefreshCw,
  Unlink,
} from 'lucide-react'
import { useActivePlaythrough, useActivePlayer, useActiveWorld, useStore } from '@/store'
import { useUi } from '@/ui'
import { useFileSync } from '@/hooks/useFileSync'
import { attachHints, canSaveInPlace, hasRememberedWorld, isClassicFile } from '@/lib/files'
import { useWorldLoader } from '@/hooks/useWorldLoader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { confirm } from '@/lib/confirm'

// World menu (attach, reload, sync, chest search, areas, detach) and its quick button.

export function WorldMenu() {
  const pt = useActivePlaythrough()
  const world = useActiveWorld()
  const detachWorld = useStore((s) => s.detachWorld)
  const openDialog = useUi((s) => s.open)
  const { load, loading } = useWorldLoader()
  const sync = useFileSync()
  const [remembered, setRemembered] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (pt && canSaveInPlace) hasRememberedWorld(pt.id).then((r) => !cancelled && setRemembered(r))
    return () => {
      cancelled = true
    }
  }, [pt, world])

  if (!pt) return null
  const hints = attachHints('world')
  const ref = pt.world

  // an attached world that is not loaded: reconnect with one click (syncing: SyncButton in the header)
  const quick =
    ref && !world
      ? {
          icon: <PlugZap />,
          title: remembered
            ? `Reconnect the world: reload ${ref.fileName}`
            : `Reconnect the world: choose ${ref.fileName} again${isClassicFile('world', pt.id) ? ' (e.g. from the Steam Cloud folder)' : ''}`,
          run: () => void load(pt.id, remembered),
        }
      : null

  return (
    <div className="flex items-center gap-1">
      {/* on the left, so it does not sit between World and Player */}
      {quick && (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={loading}
          onClick={quick.run}
          title={quick.title}
          aria-label={quick.title}
          className="text-amber-600 dark:text-amber-400"
        >
          {loading ? <Loader2 className="animate-spin" /> : quick.icon}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading} className="max-w-52">
            <Globe className={world ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'} />
            <span className="truncate">{ref ? ref.name : 'Attach world'}</span>
            {ref && !world && <span className="text-xs text-muted-foreground">(not loaded)</span>}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {ref
              ? world
                ? `${ref.fileName} · ${world.containers.filter((c) => c.kind === 'chest').length} chests`
                : 'World files are read locally and never uploaded. Load it again for this session.'
              : 'Read chests from a .wld file. The file stays on your computer.'}
          </DropdownMenuLabel>
          {ref && (remembered || isClassicFile('world', pt.id)) && (
            <DropdownMenuItem onSelect={() => void load(pt.id, true)}>
              <RefreshCw /> Reload {ref.fileName}
              {!remembered && '…'}
            </DropdownMenuItem>
          )}
          {/* Chrome/Edge do not open Steam's folder (Steam Cloud saves) with the normal dialog: a second
            entry with the classic dialog (W10) */}
          {canSaveInPlace ? (
            <>
              <DropdownMenuItem title={hints.local} onSelect={() => void load(pt.id, false, true, false)}>
                <FolderOpen /> Attach non-Steam Cloud world
              </DropdownMenuItem>
              <DropdownMenuItem title={hints.steam} onSelect={() => void load(pt.id, false, true, true)}>
                <FolderSearch /> Attach Steam Cloud world
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void load(pt.id, false, true, false)}>
              <FolderOpen />{' '}
              {ref ? (world ? 'Reload / choose world file…' : 'Choose world file…') : 'Attach world file…'}
            </DropdownMenuItem>
          )}
          {ref && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!world} onSelect={() => void sync('world')}>
                <RefreshCw /> Sync with world…
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!world} onSelect={() => openDialog({ type: 'chestSearch' })}>
                <PackageSearch /> Search in chests…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDialog({ type: 'areas' })}>
                <MapPinned /> Manage areas…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  if (
                    await confirm({
                      title: 'Detach world?',
                      description: 'The world reference is removed from this playthrough. Areas are kept.',
                      confirmLabel: 'Detach',
                      destructive: true,
                    })
                  )
                    detachWorld(pt.id)
                }}
              >
                <Unlink /> Detach world
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** "Sync…" in the header, right of World and Player: world chests, bestiary and the player. */
export function SyncButton() {
  const world = useActiveWorld()
  const player = useActivePlayer()
  const sync = useFileSync()
  if (!world && !player) return null
  const title = `Sync with ${[world && 'world (items and bestiary)', player && 'player'].filter(Boolean).join(' and ')}…`
  return (
    <Button variant="outline" size="icon-sm" onClick={() => void sync('both')} title={title} aria-label={title}>
      <RefreshCw />
    </Button>
  )
}
