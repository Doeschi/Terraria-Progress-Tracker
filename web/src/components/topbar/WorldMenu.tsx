import { useEffect, useState } from 'react'
import {
  ChevronDown,
  FolderOpen,
  Globe,
  MapPinned,
  PackageSearch,
  Loader2,
  PlugZap,
  RefreshCw,
  Unlink,
} from 'lucide-react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { canSaveInPlace, hasRememberedWorld } from '@/lib/files'
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
  const [remembered, setRemembered] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (pt && canSaveInPlace) hasRememberedWorld(pt.id).then((r) => !cancelled && setRemembered(r))
    return () => {
      cancelled = true
    }
  }, [pt, world])

  if (!pt) return null
  const ref = pt.world

  // quick action next to the menu: sync a loaded world, or reconnect an attached one
  const quick = !ref
    ? null
    : world
      ? {
          icon: <RefreshCw />,
          title: 'Sync with world… (items and bestiary)',
          run: () => openDialog({ type: 'sync' }),
        }
      : {
          icon: <PlugZap />,
          title: remembered
            ? `Reconnect the world: reload ${ref.fileName}`
            : `Reconnect the world: choose ${ref.fileName} again`,
          run: () => void load(pt.id, remembered),
        }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading} className="max-w-52">
            <Globe className={world ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'} />
            <span className={cn('truncate', ref && 'italic')}>{ref ? ref.name : 'Attach world'}</span>
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
          {ref && !world && remembered && (
            <DropdownMenuItem onSelect={() => void load(pt.id, true)}>
              <RefreshCw /> Reload {ref.fileName}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void load(pt.id)}>
            <FolderOpen /> {ref ? (world ? 'Reload / choose world file…' : 'Choose world file…') : 'Attach world file…'}
          </DropdownMenuItem>
          {ref && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!world} onSelect={() => openDialog({ type: 'sync' })}>
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
      {quick && (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={loading}
          onClick={quick.run}
          title={quick.title}
          aria-label={quick.title}
          className={cn(!world && 'text-amber-600 dark:text-amber-400')}
        >
          {loading ? <Loader2 className="animate-spin" /> : quick.icon}
        </Button>
      )}
    </div>
  )
}
