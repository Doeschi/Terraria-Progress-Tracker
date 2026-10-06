import { plural } from '@/lib/format'
import { Fragment, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  Columns3,
  Eye,
  EyeOff,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Star,
  SunDim,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '@/store'
import { usePrefs, type ViewDef } from '@/lib/prefs'
import { buildFilterGroups, GROUP_KEYS, type ViewMode } from '@/lib/filtering'
import { clearAllFilters } from '@/lib/clearFilters'
import type { TrackerView } from '@/hooks/useTrackerView'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { confirm } from '@/lib/confirm'
import { FilterSidebar } from './FilterSidebar'
import { ItemTable } from './table/ItemTable'
import { useColumnVisibility, useHasWorld, useItemColumns, useShownColumns, useViews } from './table/useColumns'
import { COLUMN_GROUPS, type ItemColumn } from './table/columns'
import { activeView, viewVisibility, type View } from './table/presets'
import { ViewEditor, type ViewEditTarget } from './table/ViewEditor'
import { cn } from '@/lib/utils'
import { TallyBar, TallyText } from './common'
import { ActiveFilterBar, MobileFiltersButton, SearchField, SearchHint } from './ListParts'
import { handleListKey } from '@/lib/listCursor'
import { NpcSuggestions } from './NpcSuggestions'
import { useUi } from '@/ui'
import { useIsPhone } from '@/hooks/useIsPhone'
import { useWorldProgress } from '@/hooks/useWorldProgress'
import { CardSortMenu, ItemCards, type CardSort } from './ItemCards'

export function ItemList({ view }: { view: TrackerView }) {
  const phone = useIsPhone()
  // phones: cards instead of the table, sorted by this (MO3)
  const [cardSort, setCardSort] = useState<CardSort>('list')
  if (phone)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Toolbar view={view} phone cardSort={cardSort} onCardSort={setCardSort} />
        <ActiveFilters onlyActive />
        <ItemCards items={view.visible} checked={view.checked} ignored={view.ignored} sort={cardSort} />
      </div>
    )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar view={view} />
      <ActiveFilters />
      <ItemTable items={view.visible} checked={view.checked} ignored={view.ignored} owned={view.owned} />
    </div>
  )
}

// ------------------------------------------------------------------ toolbar

function Toolbar({
  view,
  phone = false,
  cardSort,
  onCardSort,
}: {
  view: TrackerView
  /** phones (MO2): search, Filters, sort and bulk actions in one row; Show and the filtered
   * progress in the second; no views */
  phone?: boolean
  cardSort?: CardSort
  onCardSort?: (sort: CardSort) => void
}) {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const openDetail = useUi((s) => s.openDetail)
  const [focused, setFocused] = useState(false)
  const searchNpcs = usePrefs((s) => s.searchNpcs)
  const mode = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)

  // each with the number of items it shows under the current search and filters (I4); phones:
  // icons instead of the labels (except "All"), so the numbers next to them fit
  const { filtered, ignoredCount } = view
  const views: { value: ViewMode; label: string; tip: string; count: number; icon?: LucideIcon }[] = [
    { value: 'all', label: 'All', tip: 'All items that count towards progress', count: filtered.total },
    {
      value: 'missing',
      label: 'Missing',
      tip: 'Items you have not checked yet',
      count: filtered.total - filtered.obtained,
      icon: CircleDashed,
    },
    {
      value: 'obtained',
      label: 'Obtained',
      tip: 'Items you have checked',
      count: filtered.obtained,
      icon: CircleCheck,
    },
    {
      value: 'ignored',
      label: 'Ignored',
      tip: 'Hidden items that do not count towards progress',
      count: ignoredCount,
      icon: EyeOff,
    },
  ]

  return (
    <div className={cn('flex flex-col border-b', phone ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
      <div className="flex items-center gap-2">
        {/* the NPCs matching the search, in a list under the field while it has the focus (S5) */}
        <div className="relative min-w-0 flex-1" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
          <SearchField
            value={search}
            onChange={setSearch}
            onKeyDown={(e) => handleListKey(e, search, openDetail)}
            placeholder={phone ? 'Search…' : searchNpcs ? 'Search items or NPCs by name…' : 'Search items by name…'}
            label="Search items"
            shortcut="list"
            withMode
            withNpcs
          />
          <NpcSuggestions search={search} open={searchNpcs && focused && !!search.trim()} />
        </div>
        <MobileFilters view={view} />
        {phone && cardSort && onCardSort && <CardSortMenu sort={cardSort} onChange={onCardSort} />}
        {phone && <BulkActions view={view} compact />}
      </div>
      <SearchHint search={search} />
      {/* show switch, progress of the filtered items, bulk actions: one row */}
      <div className={cn('flex items-center', phone ? 'gap-2' : 'flex-wrap gap-x-4 gap-y-2')}>
        <div className="flex items-center gap-2">
          {!phone && <span className="text-xs font-medium text-muted-foreground">Show</span>}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(v) => v && setView(v as ViewMode)}
            aria-label="Which items to show"
          >
            {views.map((v) => (
              <ToggleGroupItem key={v.value} value={v.value} title={v.tip} aria-label={v.label}>
                {phone && v.icon ? <v.icon /> : v.label}
                <span className="text-muted-foreground tabular-nums">{v.count.toLocaleString('en')}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {phone ? (
          // the numbers only, right-aligned: the toggle needs the width
          <TallyText tally={view.filtered} className="ml-auto shrink-0 text-xs" />
        ) : (
          <>
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              title={view.searching ? 'Sorted by relevance until a column is sorted' : undefined}
            >
              Filtered
              <TallyBar tally={view.filtered} className="w-20" />
              <TallyText tally={view.filtered} />
            </div>
            <div className="ml-auto">
              <BulkActions view={view} />
            </div>
          </>
        )}
      </div>
      {!phone && <PresetBar />}
    </div>
  )
}

/** Views: the favorites as buttons, all of them in a dropdown (✎ edit, ☆ favorite, new view). */
function PresetBar() {
  const catalogue = useItemColumns()
  const views = useViews(catalogue)
  const shownIds = useShownColumns(catalogue)
  const setColumns = usePrefs((s) => s.setColumns)
  const setColumnOrder = usePrefs((s) => s.setColumnOrder)
  const setTableSorting = usePrefs((s) => s.setTableSorting)
  const tableSorting = usePrefs((s) => s.tableSorting)
  const favorites = usePrefs((s) => s.layout.favoriteViews)
  const setLayout = usePrefs((s) => s.setLayout)
  const [editing, setEditing] = useState<ViewEditTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // set while a control inside a menu item (star, pencil) is pressed, so the item does not also select the view
  const controlHit = useRef(false)
  // views with world-only columns ("Bad luck") need a loaded world
  const hasWorld = useHasWorld()
  const usable = (v: View) => !v.needsWorld || hasWorld
  const NEEDS_WORLD = 'Needs a loaded world – load the world file first'
  const active = activeView(views.filter(usable), shownIds)

  const apply = (v: ViewDef) => {
    setColumns(viewVisibility(v, catalogue))
    setColumnOrder(v.columns)
    setTableSorting(v.sorting)
  }
  const toggleFavorite = (id: string) =>
    setLayout({ favoriteViews: favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id] })
  // the table as it is now, as a starting point for a new view
  const current: ViewDef = { id: '', label: 'My view', columns: shownIds, sorting: tableSorting }
  // a control in a menu item: acts on its own, keeps the menu open and the view unchanged
  const control = (run: () => void) => ({
    onClick: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      run()
      // the item may not have seen this click: do not swallow the next one
      setTimeout(() => (controlHit.current = false))
    },
    onPointerDown: (e: React.PointerEvent) => {
      controlHit.current = true
      e.stopPropagation()
    },
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  })

  const shown = views.filter((v) => favorites.includes(v.id))
  // the dropdown names the active view if it is no favorite button
  const activeElsewhere = active && !favorites.includes(active.id)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-medium text-muted-foreground">View</span>
      {shown.map((v) => (
        <button
          key={v.id}
          onClick={() => apply(v)}
          disabled={!usable(v)}
          aria-pressed={active?.id === v.id}
          className={cn(
            'h-7 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50',
            active?.id === v.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-foreground/80 enabled:hover:bg-muted enabled:hover:text-foreground',
          )}
          title={usable(v) ? `Show the ${v.label.toLowerCase()} columns` : NEEDS_WORLD}
        >
          {v.label}
        </button>
      ))}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            // the active view is no button: the dropdown shows it, filled like an active button
            variant={activeElsewhere ? 'default' : 'outline'}
            size="sm"
            className="h-7 rounded-full"
            title="All views – ✎ edit, ☆ show as a button"
          >
            {activeElsewhere ? active.label : shown.length ? 'More views' : 'Views'}
            <ChevronDown className={activeElsewhere ? undefined : 'text-muted-foreground'} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {views.map((v) => {
            const fav = favorites.includes(v.id)
            return (
              <DropdownMenuItem
                key={v.id}
                onSelect={(e) => {
                  if (controlHit.current || !usable(v)) {
                    controlHit.current = false
                    e.preventDefault()
                    return
                  }
                  apply(v)
                }}
                title={usable(v) ? undefined : NEEDS_WORLD}
              >
                <Check className={active?.id === v.id ? '' : 'invisible'} />
                <span className={cn('flex-1 truncate', !usable(v) && 'opacity-50')}>
                  {v.label}
                  {v.changed && <span className="ml-1.5 text-xs text-muted-foreground">(changed)</span>}
                  {!usable(v) && <span className="ml-1.5 text-xs text-muted-foreground">(needs a world)</span>}
                </span>
                {/* editing needs its world-only columns in the catalogue */}
                <button
                  hidden={!usable(v)}
                  {...control(() => {
                    setMenuOpen(false)
                    setEditing({ view: v })
                  })}
                  className="-my-1 rounded p-1 hover:bg-foreground/10"
                  title="Edit view"
                  aria-label={`Edit ${v.label}`}
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </button>
                <button
                  {...control(() => toggleFavorite(v.id))}
                  className="-my-1 -mr-1 rounded p-1 hover:bg-foreground/10"
                  title={fav ? 'Remove from the buttons' : 'Show as a button'}
                  aria-label={fav ? `Unfavorite ${v.label}` : `Favorite ${v.label}`}
                >
                  <Star className={cn('size-4', fav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                </button>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditing({ view: null, start: { ...current, label: 'New view' } })}>
            <Plus /> New view…
          </DropdownMenuItem>
          {!active && (
            <DropdownMenuItem onSelect={() => setEditing({ view: null, start: current })}>
              <Save /> Save current table as view…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ColumnsMenu custom={!active} />
      <DimToggle />
      {editing && (
        <ViewEditor
          target={editing}
          catalogue={catalogue}
          current={current}
          onClose={() => setEditing(null)}
          onApply={apply}
        />
      )}
    </div>
  )
}

/** Dim the items the loaded world has not reached yet (MS8): a toggle next to the columns, greyed
 * out without a world (aria-disabled, so the hint still shows on hover). */
function DimToggle() {
  const dim = usePrefs((s) => s.layout.dimUnavailable)
  const setLayout = usePrefs((s) => s.setLayout)
  const progress = useWorldProgress()
  const on = dim && !!progress
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={on}
      aria-disabled={!progress}
      onClick={() => progress && setLayout({ dimUnavailable: !dim })}
      className={cn(
        'h-7 rounded-full',
        // on: filled like the active view button
        on &&
          'border-primary bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground dark:bg-primary dark:hover:bg-primary/80',
        !progress && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
      title={
        progress
          ? `${on ? 'Shows' : 'Dims'} the items ${progress.worldName} has not reached yet (after a boss it has not defeated) – click to switch`
          : 'Needs a loaded world: dims the items it has not reached yet'
      }
    >
      <SunDim /> Dim unavailable
    </Button>
  )
}

function ColumnsMenu({ custom }: { custom: boolean }) {
  const catalogue = useItemColumns()
  const visibility = useColumnVisibility(catalogue)
  const setColumns = usePrefs((s) => s.setColumns)
  const setColumnSizes = usePrefs((s) => s.setColumnSizes)
  const shown = catalogue.filter((c) => visibility[c.id]).length
  const setColumnOrder = usePrefs((s) => s.setColumnOrder)
  const setAll = (fn: (c: ItemColumn) => boolean) => {
    setColumns(Object.fromEntries(catalogue.map((c) => [c.id, fn(c)])))
    setColumnOrder([])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 rounded-full', custom && 'border-primary text-primary')}
          title={custom ? 'Your own column selection – click to change it' : 'Show or hide single columns'}
        >
          <Columns3 /> {custom ? 'Custom' : 'Columns'}
          <span className="text-muted-foreground">{shown}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        <div className="flex gap-1 p-1">
          <Button variant="ghost" size="xs" onClick={() => setAll((c) => !!c.defaultVisible)}>
            Defaults
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setAll(() => true)}>
            All
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setAll(() => false)}>
            None
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setColumnSizes({})}
            title="Widths changed by dragging a column edge back to the defaults"
          >
            Reset widths
          </Button>
        </div>
        {COLUMN_GROUPS.map((group) => {
          const cols = catalogue.filter((c) => c.group === group)
          if (!cols.length) return null
          return (
            <Fragment key={group}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
              {cols.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={visibility[c.id]}
                  // keep the menu open while toggling several columns
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => setColumns({ ...visibility, [c.id]: v === true })}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BulkActions({ view, compact = false }: { view: TrackerView; compact?: boolean }) {
  const setChecked = useStore((s) => s.setChecked)
  const setIgnored = useStore((s) => s.setIgnored)
  const keys = view.visible.map((i) => i.key)
  const n = keys.length
  const ignoredView = useStore((s) => s.view) === 'ignored'

  const run = async (title: string, action: () => void, destructive = false) => {
    if (await confirm({ title, description: `This affects ${n} visible items.`, confirmLabel: 'Apply', destructive }))
      action()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!n}
            title="Bulk actions: check, uncheck or ignore all items in the list"
            aria-label="Bulk actions"
          >
            <ListChecks />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={!n} title="Check, uncheck or ignore all items in the list">
            <ListChecks /> Bulk actions
            <ChevronDown className="text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          Apply to all {n} items in the list
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ignoredView ? (
          <DropdownMenuItem onSelect={() => run('Un-ignore all visible items?', () => setIgnored(keys, false))}>
            <Eye /> Un-ignore all
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => run('Check all visible items?', () => setChecked(keys, true))}>
              Check all
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run('Uncheck all visible items?', () => setChecked(keys, false), true)}>
              Uncheck all
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => run('Ignore all visible items?', () => setIgnored(keys, true), true)}>
              <EyeOff /> Ignore all
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileFilters({ view }: { view: TrackerView }) {
  const active = useStore((s) => GROUP_KEYS.reduce((n, g) => n + s.selection[g].length, 0))
  return (
    <MobileFiltersButton active={active} shown={plural(view.visible.length, 'item')}>
      <FilterSidebar facets={view.facets} groupTallies={view.groupTallies} available={view.available} />
    </MobileFiltersButton>
  )
}

function ActiveFilters({ onlyActive = false }: { onlyActive?: boolean }) {
  const data = useStore((s) => s.data)!
  const groups = useMemo(() => buildFilterGroups(data), [data])
  const selection = useStore((s) => s.selection)
  const requireAll = useStore((s) => s.requireAll)
  const search = useStore((s) => s.search.trim())
  const { toggleFilter, toggleRequireAll, setSearch } = useStore.getState()
  return (
    <ActiveFilterBar
      groups={groups}
      selection={selection}
      requireAll={requireAll}
      search={search}
      onRemove={toggleFilter}
      onToggleAll={toggleRequireAll}
      onClearSearch={() => setSearch('')}
      onClearAll={clearAllFilters}
      onlyActive={onlyActive}
    />
  )
}
