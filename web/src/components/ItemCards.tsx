import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownUp } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { nameOf } from '@/lib/format'
import { shownObtain } from '@/lib/filtering'
import { useActiveRow, usePublishRows } from '@/lib/listCursor'
import { rodOfDiscord } from '@/lib/eggs'
import { useHeldWeapon, WEAPONS } from '@/lib/weapons'
import { usePrefs } from '@/lib/prefs'
import type { GameData, Item } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WikiIcon } from './common'
import { useCardSize, type CardSize } from '@/hooks/useCardSize'

// Phones (REQUIREMENTS MO3): the items as cards instead of the table - checkbox, icon, name and a
// line with what the table shows in columns (category, how to get it, available after).

export type CardSort = 'list' | 'rarity' | 'added' | 'milestone' | 'changed'

const SORTS: [CardSort, string][] = [
  ['list', 'Name (relevance while searching)'],
  ['rarity', 'Rarity (highest first)'],
  ['added', 'Added in (newest first)'],
  ['milestone', 'Available after (earliest first)'],
  ['changed', 'Last changed (latest first)'],
]

/** "Sort" for the cards (the table sorts by its columns). */
export function CardSortMenu({ sort, onChange }: { sort: CardSort; onChange: (sort: CardSort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" title="Sort" aria-label="Sort">
          <ArrowDownUp />
        </Button>
      </DropdownMenuTrigger>
      {/* wide enough for one line per option (it is narrow by default on phones) */}
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-muted-foreground">Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onChange(v as CardSort)}>
          {SORTS.map(([id, label]) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function sortItems(data: GameData, items: Item[], sort: CardSort, changedAt: Record<string, string>): Item[] {
  if (sort === 'list') return items
  const versionRank = new Map(data.versions.map((v, n) => [v.id, n]))
  const milestoneRank = new Map(data.milestones.map((m, n) => [m.id, n]))
  const key = (i: Item): number | string => {
    switch (sort) {
      case 'rarity':
        return -(i.rarity ?? -99)
      case 'added':
        return -(versionRank.get(i.version ?? '') ?? -1)
      case 'milestone':
        return milestoneRank.get(i.milestone ?? '') ?? 999
      case 'changed':
        return changedAt[i.key] ? -Date.parse(changedAt[i.key]) : Infinity
    }
  }
  return [...items].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

export function ItemCards({
  items,
  checked,
  ignored,
  sort,
}: {
  items: Item[]
  checked: Set<string>
  ignored: Set<string>
  sort: CardSort
}) {
  const data = useStore((s) => s.data)!
  const changedAt = useActivePlaythrough()?.changedAt
  const rows = useMemo(() => sortItems(data, items, sort, changedAt ?? {}), [data, items, sort, changedAt])
  const scrollRef = useRef<HTMLDivElement>(null)
  // card height and icon from the density setting
  const size = useCardSize()
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => size.height,
    overscan: 10,
  })
  // another density: measure the cards again
  useEffect(() => virtualizer.measure(), [virtualizer, size])
  const selected = useUi((s) => s.detailKey)
  // Enter in the search opens the first card (S4)
  usePublishRows(useMemo(() => rows.map((i) => ({ ref: i.key, name: i.name })), [rows]))
  const active = useActiveRow(useStore((s) => s.search)).row?.ref

  if (!rows.length) return <p className="p-6 text-center text-sm text-muted-foreground">No items match.</p>
  const virtualRows = virtualizer.getVirtualItems()
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((vr) => {
          const item = rows[vr.index]
          return (
            <ItemCard
              key={item.key}
              data={data}
              item={item}
              own={checked.has(item.key)}
              ignored={ignored.has(item.key)}
              selected={selected === item.key}
              active={active === item.key}
              top={vr.start}
              size={size}
            />
          )
        })}
      </ul>
    </div>
  )
}

function ItemCard({
  data,
  item,
  own,
  ignored,
  selected,
  active,
  top,
  size,
}: {
  data: GameData
  item: Item
  own: boolean
  ignored: boolean
  selected: boolean
  active: boolean
  top: number
  size: CardSize
}) {
  const openDetail = useUi((s) => s.openDetail)
  const setChecked = useStore((s) => s.setChecked)
  // weapon easter egg (G8): a checked special weapon gets a big icon - tap it to swing it
  const eggs = usePrefs((s) => s.layout.easterEggs)
  const weapon = eggs && own && !ignored && item.key in WEAPONS
  // what the table shows in columns, written out (no hover on phones)
  const category = item.categories[0] ? nameOf(data.categories, item.categories[0]) : undefined
  const obtain = shownObtain(data, item.obtain)
    .map((o) => nameOf(data.obtain, o))
    .join(', ')
  // "after World creation" says nothing
  const milestone =
    item.milestone && item.milestone !== data.milestones[0]?.id ? nameOf(data.milestones, item.milestone) : undefined
  return (
    <li
      className={cn(
        'absolute inset-x-0 flex items-center gap-2 border-b border-border/60 pr-3',
        own && !ignored && 'bg-emerald-50 dark:bg-[oklch(0.25_0.03_160)]',
        ignored && 'opacity-60',
        selected && 'bg-primary/15',
        active && 'outline-2 -outline-offset-2 outline-primary outline-dashed pointer-coarse:outline-none',
        // its big icon sticks out over the neighbours
        weapon && 'z-10',
      )}
      style={{ top, height: size.height }}
    >
      {/* the whole left edge is the checkbox's tap area */}
      <label className="grid h-full w-11 shrink-0 cursor-pointer place-items-center">
        <Checkbox
          checked={own}
          disabled={ignored}
          onCheckedChange={(v) => {
            setChecked([item.key], v === true)
            if (v === true && item.key === 'RodofDiscord') rodOfDiscord(document.activeElement)
          }}
          aria-label={`Obtained: ${item.name}`}
        />
      </label>
      {weapon && <CardWeapon item={item} size={size.icon} />}
      <button
        type="button"
        onClick={() => openDetail(item.key)}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {!weapon && <WikiIcon src={item.icon} alt="" size={size.icon} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate font-medium', size.name)}>{item.name}</span>
          <span className={cn('truncate text-muted-foreground', size.line)}>
            {[category, obtain, milestone && `after ${milestone}`].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    </li>
  )
}

/** The big icon of a weapon easter egg (lib/weapons.ts) on a card: a tap swings it once. */
function CardWeapon({ item, size }: { item: Item; size: number }) {
  const swingAt = useHeldWeapon((s) => s.swingAt)
  const swinging = useHeldWeapon((s) => s.swing?.key === item.key)
  const big = Math.round(size * 1.6)
  return (
    <span className="relative mr-1.5 block shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          swingAt(item.key, item.icon, r.left + r.width / 2, r.top + r.height / 2)
        }}
        className={cn('egg-weapon absolute rounded', swinging && 'opacity-30')}
        style={{ left: (size - big) / 2, top: (size - big) / 2, width: big, height: big }}
        aria-label={item.name}
      >
        <WikiIcon src={item.icon} alt="" size={big} upscale />
      </button>
    </span>
  )
}
