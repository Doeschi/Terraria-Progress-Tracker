import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, ListChecks, RefreshCw, Star } from 'lucide-react'
import { useUi } from '@/ui'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { cn } from '@/lib/utils'
import { confirm } from '@/lib/confirm'
import { BESTIARY_GROUP_KEYS, bestiaryExists, buildBestiaryGroups, type BestiaryViewMode } from '@/lib/bestiary'
import type { BestiaryEntry, GameData } from '@/lib/types'
import type { WorldBestiary } from '@/lib/world'
import type { BestiaryView } from '@/hooks/useBestiaryView'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BestiaryFilterSidebar } from './FilterSidebar'
import { TallyBar, TallyText, WikiIcon } from './common'
import { ActiveFilterBar, MobileFiltersButton, SearchField } from './ListParts'
import { formatDate, nameOf } from '@/lib/format'
import { worldState } from '@/lib/bestiary'

// The bestiary view: every entry of the in-game bestiary with its unlock state
// (checked manually or taken from the attached world).

export function BestiaryList({ view }: { view: BestiaryView }) {
  const data = useStore((s) => s.data)!
  const gameVersion = useActivePlaythrough()?.gameVersion ?? null
  if (!bestiaryExists(data, gameVersion))
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
        The bestiary was added in 1.4.0 – it does not exist in the game version of this playthrough.
      </div>
    )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar view={view} />
      <ActiveFilters />
      <BestiaryTable view={view} />
    </div>
  )
}

// ------------------------------------------------------------------ toolbar

function Toolbar({ view }: { view: BestiaryView }) {
  const search = useStore((s) => s.bestiarySearch)
  const setSearch = useStore((s) => s.setBestiarySearch)
  const mode = useStore((s) => s.bestiaryView)
  const setView = useStore((s) => s.setBestiaryView)
  const world = useActiveWorld()
  const openDialog = useUi((s) => s.open)

  const views: { value: BestiaryViewMode; label: string; tip: string }[] = [
    { value: 'all', label: 'All', tip: 'All bestiary entries' },
    { value: 'missing', label: 'Missing', tip: 'Entries not unlocked yet' },
    { value: 'unlocked', label: 'Unlocked', tip: 'Entries you have unlocked' },
  ]

  return (
    <div className="flex flex-col gap-2 border-b p-3">
      <div className="flex items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search the bestiary…"
          label="Search the bestiary"
        />
        <MobileFilters view={view} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Show</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(v) => v && setView(v as BestiaryViewMode)}
            aria-label="Which entries to show"
          >
            {views.map((v) => (
              <ToggleGroupItem key={v.value} value={v.value} title={v.tip}>
                {v.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="ml-auto flex gap-2">
          {world?.bestiary && (
            <Button variant="outline" size="sm" onClick={() => openDialog({ type: 'sync', section: 'bestiary' })}>
              <RefreshCw /> Sync with world
            </Button>
          )}
          <BulkActions view={view} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        Progress of filtered entries
        <TallyBar tally={view.filtered} className="w-24" />
        <TallyText tally={view.filtered} />
        {!world && <span>· attach the world to sync the bestiary with it</span>}
        {world && !world.bestiary && <span>· the bestiary could not be read from the world</span>}
      </div>
    </div>
  )
}

function BulkActions({ view }: { view: BestiaryView }) {
  const setBestiary = useStore((s) => s.setBestiary)
  const ids = view.visible.map((e) => e.id)
  const n = ids.length
  const run = async (title: string, value: boolean) => {
    if (
      await confirm({
        title,
        description: `This affects ${n} visible entries.`,
        confirmLabel: 'Apply',
        destructive: !value,
      })
    )
      setBestiary(ids, value)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!n} title="Mark all entries in the list">
          <ListChecks /> Bulk actions
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          Apply to all {n} entries in the list
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run('Mark all visible entries as unlocked?', true)}>
          Mark all unlocked
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('Mark all visible entries as not unlocked?', false)}>
          Mark all not unlocked
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileFilters({ view }: { view: BestiaryView }) {
  const active = useStore((s) => BESTIARY_GROUP_KEYS.reduce((n, g) => n + s.bestiarySelection[g].length, 0))
  return (
    <MobileFiltersButton active={active}>
      <BestiaryFilterSidebar facets={view.facets} groupTallies={view.groupTallies} available={view.available} />
    </MobileFiltersButton>
  )
}

function ActiveFilters() {
  const data = useStore((s) => s.data)!
  const groups = useMemo(() => buildBestiaryGroups(data), [data])
  const selection = useStore((s) => s.bestiarySelection)
  const search = useStore((s) => s.bestiarySearch.trim())
  const { toggleBestiaryFilter, clearBestiaryFilter, setBestiarySearch } = useStore.getState()
  return (
    <ActiveFilterBar
      groups={groups}
      selection={selection}
      search={search}
      onRemove={toggleBestiaryFilter}
      onClearSearch={() => setBestiarySearch('')}
      onClearAll={() => {
        clearBestiaryFilter()
        setBestiarySearch('')
      }}
    />
  )
}

// -------------------------------------------------------------------- table

type SortId = 'n' | 'name' | 'type' | 'stars' | 'world' | 'changed'
interface Sort {
  id: SortId
  desc: boolean
}

/** World column: what the world says, "–" for nothing, "" without a readable bestiary. */
function worldCell(b: WorldBestiary | null | undefined, id: string): { text: string; value: number } {
  if (!b) return { text: '', value: -1 }
  const state = worldState(b, id)
  return { text: state.text ?? '–', value: state.value }
}

function BestiaryTable({ view }: { view: BestiaryView }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const world = useActiveWorld()
  const setBestiary = useStore((s) => s.setBestiary)
  const [sort, setSort] = useState<Sort | null>(null)
  const typeName = useMemo(() => new Map(data.bestiary.types.map((t) => [t.id, t.name])), [data])

  const rows = useMemo(() => {
    if (!sort) return view.visible
    const key = (e: BestiaryEntry): string | number => {
      switch (sort.id) {
        case 'n':
          return e.n
        case 'name':
          return e.name.toLowerCase()
        case 'type':
          return typeName.get(e.type) ?? e.type
        case 'stars':
          return e.stars ?? 0
        case 'world':
          return worldCell(world?.bestiary, e.id).value
        case 'changed':
          return pt.bestiaryChangedAt[e.id] ?? ''
      }
    }
    const dir = sort.desc ? -1 : 1
    return [...view.visible].sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir || a.n - b.n
    })
  }, [view.visible, sort, typeName, world, pt.bestiaryChangedAt])

  const header = (id: SortId, label: string, className?: string) => (
    <th className={cn('px-2 py-2 text-left font-medium', className)}>
      <button
        onClick={() => setSort(sort?.id === id ? (sort.desc ? null : { id, desc: true }) : { id, desc: false })}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {sort?.id === id && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  )

  if (!rows.length) return <p className="p-6 text-center text-sm text-muted-foreground">No bestiary entries match.</p>

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-background text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
          <tr>
            <th className="w-10 px-2 py-2" aria-label="Unlocked" />
            {header('n', '#', 'w-12')}
            {header('name', 'Name')}
            {header('type', 'Type')}
            <th className="px-2 py-2 text-left font-medium">Where / when</th>
            {header('stars', 'Rarity')}
            {world && header('world', 'In the world')}
            {header('changed', 'Last changed')}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <Row
              key={e.id}
              data={data}
              entry={e}
              typeName={typeName.get(e.type) ?? e.type}
              unlocked={view.unlocked.has(e.id)}
              world={world ? worldCell(world.bestiary, e.id).text : null}
              changed={formatDate(pt.bestiaryChangedAt[e.id])}
              onChange={(v) => setBestiary([e.id], v)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  data,
  entry: e,
  typeName,
  unlocked,
  world,
  changed,
  onChange,
}: {
  data: GameData
  entry: BestiaryEntry
  typeName: string
  unlocked: boolean
  world: string | null
  changed: string | undefined
  onChange: (value: boolean) => void
}) {
  const where = [
    e.biomes.map((b) => nameOf(data.biomes, b)).join(', '),
    e.times.map((t) => nameOf(data.times, t).toLowerCase()).join(', '),
    e.events.map((ev) => nameOf(data.events, ev)).join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <tr className={cn('border-b border-border/60 hover:bg-muted/40', unlocked && 'bg-primary/[0.04]')}>
      <td className="px-2 py-1 text-center">
        <Checkbox checked={unlocked} onCheckedChange={(v) => onChange(v === true)} aria-label={`${e.name} unlocked`} />
      </td>
      <td className="px-2 py-1 text-muted-foreground tabular-nums">{e.n}</td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-2">
          <WikiIcon src={e.icon} alt="" size={32} />
          <span className={cn('min-w-0', unlocked && 'text-muted-foreground')}>{e.name}</span>
          <a
            href={e.url}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Open in the wiki"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </td>
      <td className="px-2 py-1 whitespace-nowrap">{typeName}</td>
      <td className="px-2 py-1 text-xs text-muted-foreground">{where}</td>
      <td className="px-2 py-1 whitespace-nowrap" title={e.stars ? `${e.stars} of 5 stars` : undefined}>
        {e.stars ? (
          <span className="inline-flex text-amber-500">
            {Array.from({ length: e.stars }, (_, i) => (
              <Star key={i} className="size-3 fill-current" />
            ))}
          </span>
        ) : null}
      </td>
      {world !== null && <td className="px-2 py-1 whitespace-nowrap text-xs tabular-nums">{world}</td>}
      <td className="px-2 py-1 whitespace-nowrap text-xs text-muted-foreground">{changed ?? ''}</td>
    </tr>
  )
}
