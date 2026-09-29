import { useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { useUi } from '@/ui'
import { DIFFICULTY_LABELS, versionLabel } from '@/lib/availability'
import type { Playthrough } from '@/lib/saveFile'
import { DIFFICULTIES, type Difficulty, type PlatformId } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { Field } from './Field'

// Playthrough menu (switch, new, rename, delete) and its platform, difficulty and game version.

export function PlaythroughMenu() {
  const doc = useStore((s) => s.doc)!
  const data = useStore((s) => s.data)!
  const active = useActivePlaythrough()
  const setActive = useStore((s) => s.setActivePlaythrough)
  const updatePlaythrough = useStore((s) => s.updatePlaythrough)
  const deletePlaythrough = useStore((s) => s.deletePlaythrough)
  const openDialog = useUi((s) => s.open)
  const [renaming, setRenaming] = useState(false)

  if (renaming && active) {
    const finish = (value: string | null) => {
      const name = value?.trim()
      if (name) updatePlaythrough(active.id, (p) => ({ ...p, name }))
      setRenaming(false)
    }
    return (
      <Input
        defaultValue={active.name}
        autoFocus
        onFocus={(e) => e.target.select()}
        onBlur={(e) => finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(e.currentTarget.value)
          if (e.key === 'Escape') finish(null)
        }}
        className="h-8 w-52"
        aria-label="Playthrough name"
      />
    )
  }

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-52 justify-between">
          <span className="truncate">{active ? active.name : 'No playthrough'}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        // keep focus in the rename field instead of returning it to the button
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
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
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
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

/** Platform, difficulty and game version of the active playthrough, edited in place. */
export function PlaythroughSettings() {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()
  const updatePlaythrough = useStore((s) => s.updatePlaythrough)
  if (!pt) return null
  const update = (patch: Partial<Playthrough>) => updatePlaythrough(pt.id, (p) => ({ ...p, ...patch }))

  return (
    <>
      <Field label="Platform">
        <Select value={pt.platform} onValueChange={(v) => update({ platform: v as PlatformId })}>
          <SelectTrigger size="sm" className="w-40">
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
      </Field>
      <Field
        label="Difficulty"
        title={
          pt.world
            ? "Set from the world's game mode when the world is loaded"
            : 'Classic hides Expert- and Master-only items, Expert hides Master-only items'
        }
      >
        <Select value={pt.difficulty} onValueChange={(v) => update({ difficulty: v as Difficulty })}>
          <SelectTrigger size="sm" className="w-32">
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
      </Field>
      <Field label="Game version" title="Items added in later updates are not shown or counted">
        <Select
          value={pt.gameVersion ?? 'latest'}
          onValueChange={(v) => update({ gameVersion: v === 'latest' ? null : v })}
        >
          <SelectTrigger size="sm" className="w-44" title={versionLabel(data, pt.gameVersion)}>
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
      </Field>
    </>
  )
}
