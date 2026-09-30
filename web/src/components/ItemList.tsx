import { Fragment, useMemo } from 'react'
import { ChevronDown, Columns3, Eye, EyeOff, ListChecks } from 'lucide-react'
import { useStore } from '@/store'
import { usePrefs } from '@/lib/prefs'
import { buildFilterGroups, GROUP_KEYS, type ViewMode } from '@/lib/filtering'
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
import { useColumnVisibility, useItemColumns } from './table/useColumns'
import { COLUMN_GROUPS, type ItemColumn } from './table/columns'
import { activePreset, COLUMN_PRESETS, presetVisibility } from './table/presets'
import { cn } from '@/lib/utils'
import { TallyBar, TallyText } from './common'
import { ActiveFilterBar, MobileFiltersButton, SearchField } from './ListParts'

export function ItemList({ view }: { view: TrackerView }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar view={view} />
      <ActiveFilters />
      <ItemTable items={view.visible} checked={view.checked} ignored={view.ignored} />
    </div>
  )
}

// ------------------------------------------------------------------ toolbar

function Toolbar({ view }: { view: TrackerView }) {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const mode = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)

  const views: { value: ViewMode; label: string; tip: string }[] = [
    { value: 'all', label: 'All', tip: 'All items that count towards progress' },
    { value: 'missing', label: 'Missing', tip: 'Items you have not checked yet' },
    { value: 'obtained', label: 'Obtained', tip: 'Items you have checked' },
    { value: 'ignored', label: 'Ignored', tip: 'Hidden items that do not count towards progress' },
  ]

  return (
    <div className="flex flex-col gap-2 border-b p-3">
      <div className="flex items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search items by name…" label="Search items" />
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
            onValueChange={(v) => v && setView(v as ViewMode)}
            aria-label="Which items to show"
          >
            {views.map((v) => (
              <ToggleGroupItem key={v.value} value={v.value} title={v.tip}>
                {v.label}
                {v.value === 'ignored' && view.ignoredCount > 0 && (
                  <span className="text-muted-foreground">{view.ignoredCount}</span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="ml-auto">
          <BulkActions view={view} />
        </div>
      </div>
      <PresetBar />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        Progress of filtered items
        <TallyBar tally={view.filtered} className="w-24" />
        <TallyText tally={view.filtered} />
        {view.searching && <span>· sorted by relevance until a column is sorted</span>}
      </div>
    </div>
  )
}

/** Column presets as always-visible quick buttons (like Jira quick filters). */
function PresetBar() {
  const catalogue = useItemColumns()
  const visibility = useColumnVisibility(catalogue)
  const setColumns = usePrefs((s) => s.setColumns)
  const setTableSorting = usePrefs((s) => s.setTableSorting)
  const active = activePreset(visibility, catalogue)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-medium text-muted-foreground">View</span>
      {COLUMN_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            setColumns(presetVisibility(p, catalogue))
            setTableSorting(p.sorting ?? [])
          }}
          aria-pressed={active?.id === p.id}
          className={cn(
            'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
            active?.id === p.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-foreground/80 hover:bg-muted hover:text-foreground',
          )}
          title={`Show the ${p.label.toLowerCase()} columns`}
        >
          {p.label}
        </button>
      ))}
      <ColumnsMenu custom={!active} />
    </div>
  )
}

function ColumnsMenu({ custom }: { custom: boolean }) {
  const catalogue = useItemColumns()
  const visibility = useColumnVisibility(catalogue)
  const setColumns = usePrefs((s) => s.setColumns)
  const shown = catalogue.filter((c) => visibility[c.id]).length
  const setAll = (fn: (c: ItemColumn) => boolean) => setColumns(Object.fromEntries(catalogue.map((c) => [c.id, fn(c)])))

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

function BulkActions({ view }: { view: TrackerView }) {
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
        <Button variant="outline" size="sm" disabled={!n} title="Check, uncheck or ignore all items in the list">
          <ListChecks /> Bulk actions
          <ChevronDown className="text-muted-foreground" />
        </Button>
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
    <MobileFiltersButton active={active}>
      <FilterSidebar facets={view.facets} groupTallies={view.groupTallies} available={view.available} />
    </MobileFiltersButton>
  )
}

function ActiveFilters() {
  const data = useStore((s) => s.data)!
  const groups = useMemo(() => buildFilterGroups(data), [data])
  const selection = useStore((s) => s.selection)
  const search = useStore((s) => s.search.trim())
  const { toggleFilter, clearFilter, setSearch } = useStore.getState()
  return (
    <ActiveFilterBar
      groups={groups}
      selection={selection}
      search={search}
      onRemove={toggleFilter}
      onClearSearch={() => setSearch('')}
      onClearAll={() => {
        clearFilter()
        setSearch('')
      }}
    />
  )
}
