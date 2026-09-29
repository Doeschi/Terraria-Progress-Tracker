import { createContext, useContext, useMemo, useRef } from 'react'
import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, PackageSearch } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { usePrefs } from '@/lib/prefs'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import type { Item } from '@/lib/types'
import { chestSearchHint } from '@/lib/world'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { WikiIcon } from '../common'
import { formatDate } from '@/lib/format'
import { type ItemColumn, type TrackingState } from './columns'
import { useColumnVisibility, useItemColumns } from './useColumns'

// Item table: every field as an optional column, sortable by header click,
// rows virtualized. Checkbox, icon and name stay pinned on the left.

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnVisibilityFeature,
  columnSizingFeature,
})
const helper = createColumnHelper<typeof features, Item>()

const ROW_HEIGHT = 40
// pinned columns: checkbox, icon, name
const PINNED = { check: { left: 0, size: 40 }, icon: { left: 40, size: 40 }, name: { left: 80, size: 220 } } as const

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
          enableHiding: false,
        }),
        helper.display({
          id: 'icon',
          header: () => null,
          cell: ({ row }) => <WikiIcon src={row.original.icon} alt="" size={28} />,
          size: PINNED.icon.size,
          enableHiding: false,
        }),
        helper.accessor((i) => i.name, {
          id: 'name',
          header: 'Name',
          size: PINNED.name.size,
          enableHiding: false,
          cell: ({ row }) => <NameCell item={row.original} />,
        }),
        ...catalogue.map((c) =>
          helper.accessor((i) => (blank(c.value(i, tracking.current)) ? undefined : c.value(i, tracking.current)), {
            id: c.id,
            header: c.label,
            size: c.size,
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
          size: 104,
          enableHiding: false,
        }),
      ]),
    [catalogue, tracking],
  )
}

export function ItemTable({ items, checked, ignored }: { items: Item[]; checked: Set<string>; ignored: Set<string> }) {
  const hasWorld = useStore((s) => !!s.doc?.activePlaythroughId && !!s.worlds[s.doc.activePlaythroughId])
  const catalogue = useItemColumns()
  const pt = useActivePlaythrough()
  const changedAt = pt?.changedAt
  const difficulty = pt?.difficulty ?? 'master'
  const tracking = useRef<TrackingState>({ changedAt: {}, difficulty })
  tracking.current = { changedAt: changedAt ?? {}, difficulty }
  const columns = useTableColumns(catalogue, tracking)
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

  const table = useTable({
    features,
    columns,
    data: items,
    getRowId: (row) => row.key,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: () => {}, // changed through the Columns menu
  })

  const rows = table.getRowModel().rows
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const virtualRows = virtualizer.getVirtualItems()
  const padTop = virtualRows[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0)
  const headers = table.getHeaderGroups()[0].headers
  const width = headers.reduce((n, h) => n + h.getSize(), 0)
  const selectedKey = useUi((s) => s.detailKey)
  const openDetail = useUi((s) => s.openDetail)
  const worldAttached = !!pt?.world
  const rowState = useMemo(
    () => ({ checked, ignored, hasWorld, worldAttached, changedAt: changedAt ?? {}, difficulty }),
    [checked, ignored, hasWorld, worldAttached, changedAt, difficulty],
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
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
                      'h-9 border-b bg-card px-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
                      left !== undefined && 'sticky z-10',
                      h.column.id === 'name' && 'border-r',
                    )}
                  >
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
              const isSelected = selectedKey === row.id
              return (
                <tr
                  key={row.id}
                  style={{ height: ROW_HEIGHT }}
                  className={cn('group cursor-pointer', isIgnored && 'opacity-60')}
                  aria-selected={isSelected}
                  onClick={(e) => {
                    // clicks on the checkbox, buttons and links do their own thing
                    if (!(e.target as HTMLElement).closest('button, a, [role=checkbox]')) openDetail(row.id)
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const left = pinned(cell.column.id)
                    const col = catalogue.find((c) => c.id === cell.column.id)
                    return (
                      <td
                        key={cell.id}
                        style={{ left }}
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

function CheckCell({ item }: { item: Item }) {
  const { checked, ignored, changedAt } = useContext(RowStateContext)
  const setChecked = useStore((s) => s.setChecked)
  const date = formatDate(changedAt[item.key])
  return (
    <Checkbox
      title={date ? `Last changed: ${date}` : undefined}
      checked={checked.has(item.key)}
      disabled={ignored.has(item.key)}
      onCheckedChange={(v) => setChecked([item.key], v === true)}
      aria-label={`Obtained: ${item.name}`}
    />
  )
}

function NameCell({ item }: { item: Item }) {
  const openDetail = useUi((s) => s.openDetail)
  return (
    <button
      onClick={() => openDetail(item.key)}
      className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline"
      title={`${item.name} – show details`}
    >
      {item.name}
    </button>
  )
}

function ActionsCell({ item }: { item: Item }) {
  const { ignored, hasWorld, worldAttached } = useContext(RowStateContext)
  const setIgnored = useStore((s) => s.setIgnored)
  const openDialog = useUi((s) => s.open)
  const isIgnored = ignored.has(item.key)
  return (
    <span className="flex items-center justify-end gap-0.5">
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
