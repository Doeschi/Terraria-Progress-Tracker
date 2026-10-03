import { useEffect, useState } from 'react'
import { ChevronDown, FolderOpen, FolderSearch, Loader2, PlugZap, RefreshCw, Unlink, UserRound } from 'lucide-react'
import { useActivePlaythrough, useActivePlayer, useStore } from '@/store'
import { useFileSync } from '@/hooks/useFileSync'
import { cn } from '@/lib/utils'
import { attachHints, canSaveInPlace, isClassicFile } from '@/lib/files'
import { hasRememberedPlayer } from '@/lib/player'
import { usePlayerLoader } from '@/hooks/usePlayerLoader'
import { DIFFICULTY_LABELS } from '@/lib/availability'
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

// Player menu (attach, reload, sync, detach) and its quick button - like the World menu.

const MODE: Record<string, string> = {
  classic: DIFFICULTY_LABELS.classic,
  mediumcore: 'Mediumcore',
  hardcore: 'Hardcore',
  journey: DIFFICULTY_LABELS.journey,
}

export function PlayerMenu() {
  const pt = useActivePlaythrough()
  const player = useActivePlayer()
  const detachPlayer = useStore((s) => s.detachPlayer)
  const { load, loading } = usePlayerLoader()
  const sync = useFileSync()
  const [remembered, setRemembered] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (pt && canSaveInPlace) hasRememberedPlayer(pt.id).then((r) => !cancelled && setRemembered(r))
    return () => {
      cancelled = true
    }
  }, [pt, player])

  if (!pt) return null
  const hints = attachHints('player')
  const ref = pt.player

  // an attached player that is not loaded in this session: reconnect with one click
  const reconnect =
    ref && !player
      ? {
          title: remembered
            ? `Reconnect the player: reload ${ref.fileName}`
            : `Reconnect the player: choose ${ref.fileName} again${isClassicFile('player', pt.id) ? ' (e.g. from the Steam Cloud folder)' : ''}`,
          run: () => void load(pt.id, remembered),
        }
      : null

  return (
    <div className="flex items-center gap-1">
      {/* on the left, like the World menu's */}
      {reconnect && (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={loading}
          onClick={reconnect.run}
          title={reconnect.title}
          aria-label={reconnect.title}
          className={cn('text-amber-600 dark:text-amber-400')}
        >
          {loading ? <Loader2 className="animate-spin" /> : <PlugZap />}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading} className="max-w-48">
            <UserRound className={player ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'} />
            <span className="truncate">{ref ? ref.name : 'Attach player'}</span>
            {ref && !player && <span className="text-xs text-muted-foreground">(not loaded)</span>}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {ref
              ? player
                ? `${ref.fileName} · ${MODE[player.difficulty]}`
                : 'Player files are read locally and never uploaded. Load it again for this session.'
              : 'Read inventory, banks and used upgrades from a .plr file. The file stays on your computer.'}
          </DropdownMenuLabel>
          {ref && (remembered || isClassicFile('player', pt.id)) && (
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
                <FolderOpen /> Attach non-Steam Cloud player
              </DropdownMenuItem>
              <DropdownMenuItem title={hints.steam} onSelect={() => void load(pt.id, false, true, true)}>
                <FolderSearch /> Attach Steam Cloud player
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => void load(pt.id, false, true, false)}>
              <FolderOpen />{' '}
              {ref ? (player ? 'Reload / choose player file…' : 'Choose player file…') : 'Attach player file…'}
            </DropdownMenuItem>
          )}
          {ref && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!player} onSelect={() => void sync('player', 'player')}>
                <RefreshCw /> Sync with player…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  if (
                    await confirm({
                      title: 'Detach player?',
                      description: 'The player reference is removed from this playthrough. Checked items stay checked.',
                      confirmLabel: 'Detach',
                      destructive: true,
                    })
                  )
                    detachPlayer(pt.id)
                }}
              >
                <Unlink /> Detach player
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
