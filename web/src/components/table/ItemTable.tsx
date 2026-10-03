import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnSizingState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, PackageSearch } from 'lucide-react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { itemLuck, sourceKills, type Luck } from '@/lib/luck'
import { canWield, useHeldWeapon, WEAPONS, weaponsAwake } from '@/lib/weapons'
import { useWorldProgress } from '@/hooks/useWorldProgress'
import { rodOfDiscord } from '@/lib/eggs'
import type { Owned } from '@/hooks/useTrackerView'
import { usePrefs } from '@/lib/prefs'
import { useUi } from '@/ui'
import { cn, isTouchScreen } from '@/lib/utils'
import type { Item } from '@/lib/types'
import { chestSearchHint } from '@/lib/world'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DifficultyIcon, WikiIcon } from '../common'
import { formatDate } from '@/lib/format'
import { handleTableKey, tableRowClicked, useActiveRow, useListCursor, usePublishRows } from '@/lib/listCursor'
import { type ItemColumn, type TrackingState } from './columns'
import { useColumnVisibility, useItemColumns } from './useColumns'
import { ordered } from '@/lib/layout'

// Item table: every field as an optional column, sortable by header click,
// rows virtualized. Checkbox, icon and name stay pinned on the left.

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
})
const helper = createColumnHelper<typeof features, Item>()

// row height per density (settings)
const ROW_HEIGHT = { comfortable: 40, compact: 32 } as const
// pinned columns: checkbox, icon, name
const PINNED = { check: { left: 0, size: 40 }, icon: { left: 40, size: 40 }, name: { left: 80, size: 280 } } as const

interface RowState extends TrackingState {
  checked: Set<string>
  ignored: Set<string>
  hasWorld: boolean
  /** a world is attached to the playthrough (maybe not loaded in this session) */
  worldAttached: boolean
}
const RowStateContext = createContext<RowState>({
  checked: new Set(),
  ignored: new Set(),
  hasWorld: false,
  worldAttached: false,
  changedAt: {},
  difficulty: 'master',
  luck: null,
  done: () => false,
  owned: null,
})

const blank = (v: unknown) => v === undefined || v === '' || v === false

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

/** Columns read per-playthrough values through `tracking` (a ref, so the column
 * definitions stay stable; a change re-sorts because the item list changes too). */
function useTableColumns(catalogue: ItemColumn[], tracking: React.RefObject<TrackingState>) {
  return useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'check',
          header: () => null,
          cell: ({ row }) => <CheckCell item={row.original} />,
          size: PINNED.check.size,
          enableResizing: false,
          enableHiding: false,
        }),
        helper.display({
          id: 'icon',
          header: () => null,
          cell: ({ row }) => <IconCell item={row.original} />,
          size: PINNED.icon.size,
          enableResizing: false,
          enableHiding: false,
        }),
        helper.accessor((i) => i.name, {
          id: 'name',
          header: 'Name',
          size: PINNED.name.size,
          minSize: 160,
          enableHiding: false,
          cell: ({ row }) => <NameCell item={row.original} />,
        }),
        ...catalogue.map((c) =>
          helper.accessor((i) => (blank(c.value(i, tracking.current)) ? undefined : c.value(i, tracking.current)), {
            id: c.id,
            header: c.label,
            size: c.size,
            minSize: 60,
            sortUndefined: 'last',
            sortDescFirst: c.descFirst,
            sortFn: c.compare
              ? (a, b) => c.compare!(a.original, b.original)
              : (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
            cell: ({ row, getValue }) =>
              c.cell ? c.cell(row.original, tracking.current) : (getValue() as React.ReactNode),
          }),
        ),
        helper.display({
          id: 'actions',
          header: () => null,
          cell: ({ row }) => <ActionsCell item={row.original} />,
          size: 44,
          enableHiding: false,
          enableResizing: false,
        }),
      ]),
    [catalogue, tracking],
  )
}

export function ItemTable({
  items,
  checked,
  ignored,
  owned,
}: {
  items: Item[]
  checked: Set<string>
  ignored: Set<string>
  /** amount per item owned: chests and player (world or player loaded) */
  owned: Map<string, Owned> | null
}) {
  const hasWorld = useStore((s) => !!s.activeId && !!s.worlds[s.activeId])
  const catalogue = useItemColumns()
  const pt = useActivePlaythrough()
  const eggs = usePrefs((s) => s.layout.easterEggs)
  // MS8: rows whose milestone the loaded world has not reached yet are dimmed (if enabled)
  const dimUnavailable = usePrefs((s) => s.layout.dimUnavailable)
  const progress = useWorldProgress()
  const changedAt = pt?.changedAt
  const difficulty = pt?.difficulty ?? 'master'
  // expected drops from the loaded world's bestiary kills, computed once per item
  const data = useStore((s) => s.data)!
  const bestiary = useActiveWorld()?.bestiary
  const luck = useMemo(() => {
    if (!bestiary) return null
    const kills = sourceKills(data, bestiary)
    const cache = new Map<string, Luck | undefined>()
    return (item: Item) => {
      if (!cache.has(item.key)) cache.set(item.key, itemLuck(data, item, difficulty, kills))
      return cache.get(item.key)
    }
  }, [data, bestiary, difficulty])
  const done = (key: string) => checked.has(key) || ignored.has(key)
  const tracking = useRef<TrackingState>({ changedAt: {}, difficulty, luck, done, owned })
  tracking.current = { changedAt: changedAt ?? {}, difficulty, luck, done, owned }
  // columns in the order of the applied view (the rest in catalogue order after them)
  const columnOrder = usePrefs((s) => s.columnOrder)
  const orderedCatalogue = useMemo(() => {
    const byId = new Map(catalogue.map((c) => [c.id, c]))
    return ordered(
      catalogue.map((c) => c.id),
      columnOrder,
    ).map((id) => byId.get(id)!)
  }, [catalogue, columnOrder])
  const columns = useTableColumns(orderedCatalogue, tracking)
  const visibility = useColumnVisibility(catalogue)
  // no column sorted = the order of the incoming list (name / search relevance);
  // the sorting is remembered in the browser (columns that no longer exist are dropped)
  const savedSorting = usePrefs((s) => s.tableSorting)
  const setTableSorting = usePrefs((s) => s.setTableSorting)
  const sorting = useMemo<SortingState>(
    () => savedSorting.filter((s) => s.id === 'name' || catalogue.some((c) => c.id === s.id)),
    [savedSorting, catalogue],
  )
  const setSorting = (updater: Updater<SortingState>) =>
    setTableSorting(typeof updater === 'function' ? updater(sorting) : updater)

  // column widths set by dragging a header's edge, remembered in the browser
  const columnSizing = usePrefs((s) => s.columnSizes)
  const setColumnSizes = usePrefs((s) => s.setColumnSizes)
  const setSizing = (updater: Updater<ColumnSizingState>) =>
    setColumnSizes(typeof updater === 'function' ? updater(columnSizing) : updater)

  const table = useTable({
    features,
    columns,
    data: items,
    getRowId: (row) => row.key,
    state: { sorting, columnVisibility: visibility, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setSizing,
    columnResizeMode: 'onChange',
    onColumnVisibilityChange: () => {}, // changed through the Columns menu
  })

  const rows = table.getRowModel().rows
  const rowHeight = ROW_HEIGHT[usePrefs((s) => s.layout.density)]
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })
  // a new density: measure the rows again
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight])
  const virtualRows = virtualizer.getVirtualItems()
  const padTop = virtualRows[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0)
  const headers = table.getHeaderGroups()[0].headers
  const width = headers.reduce((n, h) => n + h.getSize(), 0)
  const selectedKey = useUi((s) => s.detailKey)
  const touch = useMemo(() => isTouchScreen(), [])
  const openDetail = useUi((s) => s.openDetail)
  // keyboard selection from the search field (↑/↓, Enter opens the card): the highlighted row is
  // scrolled into view
  usePublishRows(useMemo(() => rows.map((r) => ({ ref: r.id, name: r.original.name })), [rows]))
  const active = useActiveRow(useStore((s) => s.search))
  const activeKey = active.row?.ref
  useEffect(() => {
    // the row's own index (NPC suggestions come before the rows)
    const index = activeKey ? rows.findIndex((r) => r.id === activeKey) : -1
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }, [activeKey, rows, virtualizer])
  const worldAttached = !!pt?.world
  const rowState = useMemo(
    () => ({
      checked,
      ignored,
      hasWorld,
      worldAttached,
      changedAt: changedAt ?? {},
      difficulty,
      luck,
      done: (key: string) => checked.has(key) || ignored.has(key),
      owned,
    }),
    [checked, ignored, hasWorld, worldAttached, changedAt, difficulty, luck, owned],
  )

  if (!items.length) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
        No items match the current search and filters.
      </div>
    )
  }

  const pinned = (id: string) => (id in PINNED ? PINNED[id as keyof typeof PINNED].left : undefined)

  return (
    <RowStateContext.Provider value={rowState}>
      <div
        ref={scrollRef}
        tabIndex={-1}
        onKeyDown={(e) => handleTableKey(e, openDetail)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) useListCursor.getState().setTableIndex(null)
        }}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width }}>
          <thead className="sticky top-0 z-20">
            <tr>
              {headers.map((h) => {
                const left = pinned(h.column.id)
                const sorted = h.column.getIsSorted()
                const sortable = h.column.getCanSort()
                return (
                  <th
                    key={h.id}
                    style={{ width: h.getSize(), left }}
                    className={cn(
                      'relative h-9 border-b bg-card px-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
                      left !== undefined && 'sticky z-10',
                      h.column.id === 'name' && 'border-r',
                    )}
                  >
                    {h.column.getCanResize() && (
                      // drag to resize, double-click for the default width
                      <div
                        onMouseDown={h.getResizeHandler()}
                        onTouchStart={h.getResizeHandler()}
                        onDoubleClick={() => h.column.resetSize()}
                        title="Drag to resize · double-click: default width"
                        className={cn(
                          'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40',
                          h.column.getIsResizing() && 'bg-primary/60',
                        )}
                      />
                    )}
                    {sortable && typeof h.column.columnDef.header === 'string' ? (
                      <button
                        onClick={h.column.getToggleSortingHandler()}
                        className="flex w-full items-center gap-1 hover:text-foreground"
                        title="Sort (click again to reverse, a third time to reset)"
                      >
                        <span className="truncate">{h.column.columnDef.header}</span>
                        {sorted === 'asc' && <ArrowUp className="size-3 shrink-0" />}
                        {sorted === 'desc' && <ArrowDown className="size-3 shrink-0" />}
                      </button>
                    ) : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr>
                <td style={{ height: padTop }} />
              </tr>
            )}
            {virtualRows.map((vr) => {
              const row = rows[vr.index]
              const isChecked = checked.has(row.id)
              const isIgnored = ignored.has(row.id)
              // weapon easter egg: its big icon sticks out of the row, over the others
              const bigIcon = isBigWeapon(row.id, isChecked && !isIgnored, eggs)
              const isSelected = selectedKey === row.id
              const isActive = activeKey === row.id
              const milestone = row.original.milestone
              const notYet =
                dimUnavailable &&
                !!progress &&
                !isChecked &&
                !isIgnored &&
                !!milestone &&
                !progress.reached.has(milestone)
              return (
                <tr
                  key={row.id}
                  style={{ height: rowHeight }}
                  className={cn('group cursor-pointer', isIgnored && 'opacity-60', notYet && 'opacity-40')}
                  title={notYet ? `Not available yet in ${progress.worldName}` : undefined}
                  aria-selected={isSelected}
                  onClick={(e) => {
                    // clicks on the checkbox, buttons and links do their own thing
                    if ((e.target as HTMLElement).closest('button, a, [role=checkbox]')) return
                    openDetail(row.id)
                    // the table takes the keyboard: ↑/↓ from this row, Enter opens (S6)
                    tableRowClicked(row.id)
                    scrollRef.current?.focus({ preventScroll: true })
                  }}
                >
                  {row.getVisibleCells().map((cell, ci, cells) => {
                    const left = pinned(cell.column.id)
                    const col = catalogue.find((c) => c.id === cell.column.id)
                    return (
                      <td
                        key={cell.id}
                        style={{
                          left,
                          // highlighted by the search (Enter opens it): a dashed frame around the whole
                          // row like the filter search's, drawn in every cell (pinned cells would cover
                          // an outline of the row)
                          // not on touch screens: no keyboard to move it (MO6)
                          ...(isActive && !touch && dashedFrame(ci === 0, ci === cells.length - 1)),
                          ...(bigIcon && cell.column.id === 'icon' && { zIndex: 20, overflow: 'visible' }),
                        }}
                        className={cn(
                          'overflow-hidden border-b border-border/60 px-2 whitespace-nowrap text-ellipsis',
                          // pinned cells need an opaque background to cover scrolled content
                          left !== undefined
                            ? 'sticky z-10 bg-background group-hover:bg-muted'
                            : 'group-hover:bg-foreground/[0.04]',
                          left !== undefined &&
                            isChecked &&
                            !isIgnored &&
                            'bg-emerald-50 dark:bg-[oklch(0.25_0.03_160)]',
                          // selected row (shown in the detail panel); pinned cells need an opaque color
                          isSelected &&
                            (left !== undefined
                              ? 'bg-[color-mix(in_oklch,var(--primary)_18%,var(--background))] group-hover:bg-[color-mix(in_oklch,var(--primary)_24%,var(--background))]'
                              : 'bg-primary/15 group-hover:bg-primary/20'),
                          cell.column.id === 'name' && 'border-r',
                          col?.align === 'right' && 'text-right',
                          cell.column.id === 'icon' && 'px-1.5',
                        )}
                        title={col && !col.cell ? String(cell.getValue() ?? '') : undefined}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {padBottom > 0 && (
              <tr>
                <td style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </RowStateContext.Provider>
  )
}

/** The item icon, smaller in the compact density; a big one for awake weapons (easter egg). */
function IconCell({ item }: { item: Item }) {
  const compact = usePrefs((s) => s.layout.density === 'compact')
  const eggs = usePrefs((s) => s.layout.easterEggs)
  const { checked, ignored } = useContext(RowStateContext)
  const size = compact ? 22 : 28
  if (isBigWeapon(item.key, checked.has(item.key) && !ignored.has(item.key), eggs))
    return <BigWeaponIcon item={item} size={size} />
  return <WikiIcon src={item.icon} alt="" size={size} />
}

/** A weapon easter egg (lib/weapons.ts): on some visits, special weapons the player has show a
 * big icon; click it to pick the weapon up. */
const isBigWeapon = (key: string, owned: boolean, eggs: boolean) => eggs && owned && weaponsAwake && key in WEAPONS

function BigWeaponIcon({ item, size }: { item: Item; size: number }) {
  const pickUp = useHeldWeapon((s) => s.pickUp)
  const held = useHeldWeapon((s) => s.held?.key === item.key)
  const big = size * 2
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={(e) => {
          if (!canWield()) return
          // no focus ring left behind when the weapon is put back with Escape
          e.currentTarget.blur()
          pickUp(item.key, item.icon, e.clientX, e.clientY)
        }}
        className={cn(
          'egg-weapon absolute cursor-grab rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          held && 'opacity-30',
        )}
        style={{ left: (size - big) / 2, top: (size - big) / 2, width: big, height: big }}
        aria-label={item.name}
        data-weapon={item.key}
      >
        <WikiIcon src={item.icon} alt="" size={big} upscale />
      </button>
    </span>
  )
}

function CheckCell({ item }: { item: Item }) {
  const { checked, ignored, changedAt } = useContext(RowStateContext)
  const setChecked = useStore((s) => s.setChecked)
  const date = formatDate(changedAt[item.key])
  return (
    <Checkbox
      title={date ? `Last changed: ${date}` : undefined}
      checked={checked.has(item.key)}
      disabled={ignored.has(item.key)}
      onCheckedChange={(v) => {
        setChecked([item.key], v === true)
        if (v === true && item.key === 'RodofDiscord') rodOfDiscord(document.activeElement)
      }}
      aria-label={`Obtained: ${item.name}`}
    />
  )
}

/** The name (opens the detail panel) with "find in chests" and "open on the wiki" at the right edge,
 * so the buttons of all rows line up. */
function NameCell({ item }: { item: Item }) {
  const openDetail = useUi((s) => s.openDetail)
  const { hasWorld, worldAttached } = useContext(RowStateContext)
  const openDialog = useUi((s) => s.open)
  return (
    <span className="flex items-center gap-1">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          onClick={() => openDetail(item.key)}
          className="min-w-0 truncate text-left font-medium hover:text-primary hover:underline"
          title={`${item.name} – show details`}
        >
          {item.name}
        </button>
        {/* the few Expert/Master-only items: marked here instead of a column of their own */}
        {item.minDifficulty && (
          <span className="shrink-0" title={item.minDifficulty === 'master' ? 'Master only' : 'Expert & Master only'}>
            <DifficultyIcon difficulty={item.minDifficulty} size={16} />
          </span>
        )}
      </span>
      {/* always shown; without a loaded world greyed out, the tooltip says what to do
          (aria-disabled instead of disabled, so the tooltip still appears) */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => hasWorld && openDialog({ type: 'chestSearch', itemKey: item.key })}
        title={chestSearchHint(hasWorld, worldAttached)}
        aria-label="Find in chests"
        aria-disabled={!hasWorld}
        className={cn(!hasWorld && 'cursor-not-allowed opacity-35 hover:bg-transparent')}
      >
        <PackageSearch />
      </Button>
      <Button variant="ghost" size="icon-xs" asChild>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          title="Open on the wiki"
          aria-label="Open on the wiki"
        >
          <ExternalLink />
        </a>
      </Button>
    </span>
  )
}

function ActionsCell({ item }: { item: Item }) {
  const { ignored } = useContext(RowStateContext)
  const setIgnored = useStore((s) => s.setIgnored)
  const isIgnored = ignored.has(item.key)
  return (
    <span className="flex items-center justify-end">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setIgnored([item.key], !isIgnored)}
        title={isIgnored ? 'Un-ignore (count towards progress again)' : 'Ignore (hide, not counted)'}
        aria-label={isIgnored ? 'Un-ignore' : 'Ignore'}
      >
        {isIgnored ? <Eye /> : <EyeOff />}
      </Button>
    </span>
  )
}

const DASH_X = 'repeating-linear-gradient(90deg, var(--primary) 0 6px, transparent 6px 10px)'
const DASH_Y = 'repeating-linear-gradient(180deg, var(--primary) 0 6px, transparent 6px 10px)'

/** A cell's part of a dashed frame around its row: top and bottom, the left / right edge on the
 * first / last cell (background images, over the cell's own color). */
function dashedFrame(first: boolean, last: boolean): React.CSSProperties {
  const parts: [string, string, string][] = [
    [DASH_X, '100% 2px', 'left top'],
    [DASH_X, '100% 2px', 'left bottom'],
  ]
  if (first) parts.push([DASH_Y, '2px 100%', 'left top'])
  if (last) parts.push([DASH_Y, '2px 100%', 'right top'])
  return {
    backgroundImage: parts.map((p) => p[0]).join(', '),
    backgroundSize: parts.map((p) => p[1]).join(', '),
    backgroundPosition: parts.map((p) => p[2]).join(', '),
    backgroundRepeat: 'no-repeat',
  }
}
