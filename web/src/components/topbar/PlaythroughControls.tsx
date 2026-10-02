import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { useUi } from '@/ui'
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
import { DifficultyIcon, WikiIcon } from '../common'
import { nameOf } from '@/lib/format'

// Playthrough menu (switch, new, edit, delete); platform, difficulty and game version are shown
// as icons in its button and changed in the edit dialog.

export function PlaythroughMenu() {
  const doc = useStore((s) => s.doc)!
  const data = useStore((s) => s.data)!
  const active = useActivePlaythrough()
  const setActive = useStore((s) => s.setActivePlaythrough)
  const deletePlaythrough = useStore((s) => s.deletePlaythrough)
  const openDialog = useUi((s) => s.open)

  const remove = async () => {
    if (!active) return
    const ok = await confirm({
      title: `Delete "${active.name}"?`,
      description:
        'All progress of this playthrough is removed from the file. This cannot be undone once the file is saved.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) deletePlaythrough(active.id)
  }

  // platform, difficulty and game version as icons in the button (names on hover)
  const platform = active && data.platforms.find((p) => p.id === active.platform)
  const version =
    active && (active.gameVersion ? data.versions.find((v) => v.id === active.gameVersion) : data.versions.at(-1))
  const settings = active
    ? `${platform?.name ?? active.platform} · ${DIFFICULTY_LABELS[active.difficulty]} · ${active.gameVersion ?? 'Latest'}`
    : undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-64 justify-between" title={settings}>
          <span className="truncate">{active ? active.name : 'No playthrough'}</span>
          {active && (
            <span className="flex shrink-0 items-center gap-1" aria-label={settings}>
              <WikiIcon src={platform?.icon} alt="" size={16} />
              <DifficultyIcon difficulty={active.difficulty} />
              <WikiIcon src={version?.icon} alt="" size={16} />
            </span>
          )}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch playthrough</DropdownMenuLabel>
        {doc.playthroughs.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => setActive(p.id)}>
            <Check className={p.id === active?.id ? '' : 'invisible'} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {nameOf(data.platforms, p.platform)} · {DIFFICULTY_LABELS[p.difficulty]} · {p.gameVersion ?? 'latest'}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openDialog({ type: 'newPlaythrough' })}>
          <Plus /> New playthrough…
        </DropdownMenuItem>
        {active && (
          <>
            <DropdownMenuItem onSelect={() => openDialog({ type: 'editPlaythrough' })}>
              <Pencil /> Edit playthrough…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
              <Trash2 /> Delete playthrough
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
