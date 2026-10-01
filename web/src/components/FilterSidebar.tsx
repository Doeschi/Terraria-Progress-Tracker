import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  CircleCheckBig,
  Eye,
  EyeOff,
  ListOrdered,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useActiveWorld, useStore } from '@/store'
import { activePlaythrough } from '@/lib/saveFile'
import { formatRelativeDay } from '@/lib/format'
import { usePrefs, type ProgressionMode } from '@/lib/prefs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  buildFilterGroups,
  UNKNOWN_RARITY,
  type Facets,
  type FilterEntry,
  type GroupKey,
  type Tally,
} from '@/lib/filtering'
import { buildBestiaryGroups, type BestiaryGroupKey } from '@/lib/bestiary'
import { RarityIcon, TallyBar, TallyText, WikiIcon } from './common'
import { Checkbox } from '@/components/ui/checkbox'
import { SearchField } from './ListParts'
import {
  ALMOST_DONE,
  ALMOST_DONE_LABEL,
  almostDone,
  complete,
  groupOrder,
  groupView,
  movedLists,
  nameMatches,
  searchTargets,
  sortEntries,
  SORTABLE,
  type AnyFacets,
  type AnyGroup,
  type Placement,
} from '@/lib/filterView'

// The filter sidebar (items and bestiary). Options can be hidden (moved to the
// "Hidden" section at the bottom) and, optionally, options at 100% are moved to
// the "Completed" section above it. A search field filters groups and options.

const EMPTY: Tally = { total: 0, obtained: 0 }

/** Where a sidebar's selection lives: the item filters or the bestiary filters. */
interface FilterScope {
  /** prefix of remembered settings (option order, hidden options) */
  prefix: string
  useSelection(group: string): string[]
  useAllSelections(): Record<string, string[]>
  toggle(group: string, id: string): void
  clear(group: string): void
}

const ITEMS_SCOPE: FilterScope = {
  prefix: '',
  useSelection: (group) => useStore((s) => s.selection[group as GroupKey]),
  useAllSelections: () => useStore((s) => s.selection),
  toggle: (group, id) => useStore.getState().toggleFilter(group as GroupKey, id),
  clear: (group) => useStore.getState().clearFilter(group as GroupKey),
}

const BESTIARY_SCOPE: FilterScope = {
  prefix: 'bestiary:',
  useSelection: (group) => useStore((s) => s.bestiarySelection[group as BestiaryGroupKey]),
  useAllSelections: () => useStore((s) => s.bestiarySelection),
  toggle: (group, id) => useStore.getState().toggleBestiaryFilter(group as BestiaryGroupKey, id),
  clear: (group) => useStore.getState().clearBestiaryFilter(group as BestiaryGroupKey),
}

const ScopeContext = createContext<FilterScope>(ITEMS_SCOPE)

/** "Filter the filters": lowercase search text for group and entry names ('' = all). */
const QueryContext = createContext('')

/** Option highlighted by the filter search ("<group>/<id>"); Enter selects it. */
const ActiveTargetContext = createContext<string | null>(null)

/** When each filter option was completed (Playthrough.completedAt) - "<prefix><group>/<id>" -> time */
function useCompletedAt(key: string): string | undefined {
  return useStore((s) => activePlaythrough(s.doc)?.completedAt[key])
}

/** Sidebar-wide view state: the edit mode for hiding options. */
interface SidebarUi {
  editMode: boolean
}
const SidebarUiContext = createContext<SidebarUi>({ editMode: false })

/** Open state of a group or section, remembered in the browser ("<prefix><key>"). */
function useSectionOpen(key: string, defaultOpen: boolean): [boolean, (open: boolean) => void] {
  const open = usePrefs((s) => s.layout.openGroups[key] ?? defaultOpen)
  const setLayout = usePrefs((s) => s.setLayout)
  return [open, (o) => setLayout({ openGroups: { ...usePrefs.getState().layout.openGroups, [key]: o } })]
}

const PlacementContext = createContext<Placement>({
  isHidden: () => false,
  isDone: () => false,
  hasItems: () => true,
  exists: () => true,
  toggleHidden: () => {},
})

/** Memoized: re-renders only when the counts or selections change, not on view/sort changes. */
export const FilterSidebar = memo(function FilterSidebar({
  facets,
  groupTallies,
  available,
}: {
  facets: Facets
  groupTallies: Record<GroupKey, Tally>
  available: Facets
}) {
  const data = useStore((s) => s.data)!
  const groups = useMemo(() => buildFilterGroups(data), [data])
  return (
    <FilterPanel
      groups={groups}
      facets={facets}
      groupTallies={groupTallies}
      available={available}
      scope={ITEMS_SCOPE}
    />
  )
})

/** Filters of the bestiary view. */
export const BestiaryFilterSidebar = memo(function BestiaryFilterSidebar({
  facets,
  groupTallies,
  available,
}: {
  facets: Facets<BestiaryGroupKey>
  groupTallies: Record<BestiaryGroupKey, Tally>
  available: Facets<BestiaryGroupKey>
}) {
  const data = useStore((s) => s.data)!
  const groups = useMemo(() => buildBestiaryGroups(data), [data])
  return (
    <FilterPanel
      groups={groups}
      facets={facets}
      groupTallies={groupTallies}
      available={available}
      scope={BESTIARY_SCOPE}
    />
  )
})

function FilterPanel({
  groups: allGroups,
  facets,
  groupTallies,
  available,
  scope,
}: {
  groups: AnyGroup[]
  facets: AnyFacets
  groupTallies: Record<string, Tally>
  /** per group: progress of the entries with items at all, without filters (options without
   * items are never shown; "Almost done" ranks by it) */
  available: AnyFacets
  scope: FilterScope
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // group order from the settings (Layout)
  const savedOrder = usePrefs((s) => s.layout.groupOrder[scope.prefix])
  // group keys in the saved order, "Almost done" included (it starts at the top)
  const order = useMemo(
    () =>
      groupOrder(
        allGroups.map((g) => g.key as string),
        savedOrder ?? [],
      ),
    [allGroups, savedOrder],
  )
  const byKey = useMemo(() => new Map(allGroups.map((g) => [g.key as string, g])), [allGroups])
  const groups = useMemo(() => order.filter((k) => k !== ALMOST_DONE).map((k) => byKey.get(k)!), [order, byKey])
  const hiddenList = usePrefs((s) => s.hiddenFilters)
  const toggleHiddenFilter = usePrefs((s) => s.toggleHiddenFilter)
  const hideCompleted = usePrefs((s) => s.hideCompleted)
  const setHideCompleted = usePrefs((s) => s.setHideCompleted)
  const selections = scope.useAllSelections()
  const entryOrder = usePrefs((s) => s.entryOrder)
  // keyboard selection in the filter search: index into the targets, reset on every change
  const [cursor, setCursor] = useState({ query: '', index: 0 })
  const [editMode, setEditMode] = useState(false)
  const sidebarUi = useMemo(() => ({ editMode }), [editMode])
  // "open all / close all": every group of this sidebar; closes if any group is open
  const openGroups = usePrefs((s) => s.layout.openGroups)
  const setLayout = usePrefs((s) => s.setLayout)
  const anyOpen = order.some((k) => openGroups[scope.prefix + k] ?? true)
  const setAllOpen = (open: boolean) =>
    setLayout({ openGroups: { ...openGroups, ...Object.fromEntries(order.map((k) => [scope.prefix + k, open])) } })

  const placement = useMemo<Placement>(() => {
    const hidden = new Set(hiddenList)
    const key = (group: string, id: string) => `${scope.prefix}${group}/${id}`
    return {
      isHidden: (group, id) => hidden.has(key(group, id)),
      // over the whole playthrough, not the current filters and search (FL11)
      isDone: (group, id) => hideCompleted && complete(available[group]?.get(id)),
      hasItems: (group, id) => (facets[group]?.get(id)?.total ?? 0) > 0 || !!selections[group]?.includes(id),
      exists: (group, id) => !!available[group]?.has(id) || !!selections[group]?.includes(id),
      toggleHidden: (group, id, name) => {
        const k = key(group, id)
        const hiding = !hidden.has(k)
        toggleHiddenFilter(k)
        // hiding is easy to undo right away
        if (hiding)
          toast(`“${name ?? id}” hidden`, {
            description: 'Moved to “Hidden” at the bottom of the filters.',
            action: { label: 'Undo', onClick: () => toggleHiddenFilter(k) },
          })
      },
    }
  }, [hiddenList, hideCompleted, facets, available, selections, scope.prefix, toggleHiddenFilter])

  const targets = useMemo(
    () => searchTargets(groups, placement, q, scope.prefix, entryOrder, hideCompleted),
    [groups, placement, q, scope.prefix, entryOrder, hideCompleted],
  )
  const index = cursor.query === q ? Math.min(cursor.index, targets.length - 1) : 0
  const active = targets[index]
  const activeKey = active ? `${active.group}/${active.id}` : null
  const activeSelected = !!active && !!selections[active.group]?.includes(active.id)

  // ↑/↓ move between matches, Enter selects (or unselects) and clears the search, Escape clears
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setQuery('')
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && targets.length) {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setCursor({ query: q, index: (index + step + targets.length) % targets.length })
    } else if (e.key === 'Enter' && active) {
      e.preventDefault()
      scope.toggle(active.group, active.id)
      setQuery('')
    }
  }

  return (
    <ScopeContext.Provider value={scope}>
      <QueryContext.Provider value={q}>
        <PlacementContext.Provider value={placement}>
          <SidebarUiContext.Provider value={sidebarUi}>
            <ActiveTargetContext.Provider value={activeKey}>
              <nav className="flex flex-col gap-3 p-3" aria-label="Filters">
                {/* "filter the filters": find groups and options by name */}
                <div className="sticky top-0 z-10 -mx-3 -mt-3 flex gap-1.5 bg-sidebar px-3 pt-3 pb-1">
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    onKeyDown={onSearchKey}
                    placeholder="Find a filter…"
                    label="Find a filter"
                    shortcut="filters"
                    small
                  />
                  <button
                    onClick={() => setHideCompleted(!hideCompleted)}
                    aria-pressed={hideCompleted}
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-md border',
                      hideCompleted
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                    title={
                      hideCompleted
                        ? 'Completed filters are moved to “Completed” – click to show them in their groups'
                        : 'Move completed filters (100%) to “Completed” at the bottom'
                    }
                  >
                    <CircleCheckBig className="size-4" />
                  </button>
                  <button
                    onClick={() => setAllOpen(!anyOpen)}
                    className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground hover:text-foreground"
                    title={anyOpen ? 'Close all filter groups' : 'Open all filter groups'}
                    aria-label={anyOpen ? 'Close all filter groups' : 'Open all filter groups'}
                  >
                    {anyOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
                  </button>
                  <button
                    onClick={() => setEditMode(!editMode)}
                    aria-pressed={editMode}
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-md border',
                      editMode
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                    title={editMode ? 'Done hiding filters' : 'Hide filters: allows to hide specific filters'}
                  >
                    <EyeOff className="size-4" />
                  </button>
                </div>
                {editMode && (
                  <p className="-mt-2 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                    <span className="flex-1">
                      Click <EyeOff className="inline size-3 align-[-2px]" /> to hide an option – hidden ones are at the
                      bottom.
                    </span>
                    <button onClick={() => setEditMode(false)} className="font-medium text-primary hover:underline">
                      Done
                    </button>
                  </p>
                )}
                {active && (
                  <p className="-mt-2 px-1 text-[11px] text-muted-foreground">
                    <kbd className="rounded border bg-muted px-1 font-sans">↵</kbd>{' '}
                    {activeSelected ? 'unselect' : 'select'}{' '}
                    <span className="font-medium text-foreground">{active.name}</span>
                    {targets.length > 1 && (
                      <>
                        {' '}
                        · <kbd className="rounded border bg-muted px-1 font-sans">↑↓</kbd> {index + 1} of{' '}
                        {targets.length}
                      </>
                    )}
                  </p>
                )}
                {order.map((k) =>
                  k === ALMOST_DONE ? (
                    <AlmostDoneSection key={k} groups={groups} facets={facets} totals={available} />
                  ) : (
                    <GroupSection
                      key={k}
                      group={byKey.get(k)!}
                      facets={facets}
                      totals={available}
                      tally={groupTallies[k] ?? EMPTY}
                    />
                  ),
                )}
                {q && !targets.length && <NoFilterMatch groups={groups} q={q} />}
                {hideCompleted && <MovedSection kind="completed" groups={groups} facets={facets} />}
                {/* hidden options are left out of the filter search */}
                {!q && <MovedSection kind="hidden" groups={groups} facets={facets} />}
              </nav>
            </ActiveTargetContext.Provider>
          </SidebarUiContext.Provider>
        </PlacementContext.Provider>
      </QueryContext.Provider>
    </ScopeContext.Provider>
  )
}

/**
 * Message when the filter search shows nothing: no option has that name (hidden options do
 * not count), or the matching options have no items with the current filters.
 */
function NoFilterMatch({ groups, q }: { groups: AnyGroup[]; q: string }) {
  const place = useContext(PlacementContext)
  const any = groups.some((g) => {
    const shown = (e: FilterEntry) => !place.isHidden(g.key, e.id)
    return g.entries.some(
      (e) =>
        shown(e) &&
        (nameMatches(g.label, q) ||
          nameMatches(e.name, q) ||
          !!e.children?.some((c) => shown(c) && nameMatches(c.name, q))),
    )
  })
  return (
    <p className="px-2 text-xs text-muted-foreground">
      {any ? `The filters matching “${q}” have no items with the current selection.` : `No filter matches “${q}”.`}
    </p>
  )
}

function GroupSection({
  group,
  facets,
  totals,
  tally,
}: {
  group: AnyGroup
  facets: AnyFacets
  /** progress over the whole playthrough (for the completed count) */
  totals: AnyFacets
  tally: Tally
}) {
  const scope = useContext(ScopeContext)
  const q = useContext(QueryContext)
  const place = useContext(PlacementContext)
  const [openState, setOpen] = useSectionOpen(scope.prefix + group.key, true)
  // while searching, groups with matches are always open
  const open = openState || !!q
  const selected = scope.useSelection(group.key)
  const prefKey = scope.prefix + group.key
  const sortable = SORTABLE.has(prefKey)
  const order = usePrefs((s) => s.entryOrder[prefKey] ?? 'default')
  const setEntryOrder = usePrefs((s) => s.setEntryOrder)
  const ordered = useMemo(
    () => (sortable && order === 'name' ? sortEntries(group.entries) : group.entries),
    [group.entries, sortable, order],
  )
  const { entries, shownChild, expandFor } = groupView(group, ordered, place, q)
  if (q && !entries.length) return null
  // everything moved away: a short note instead of an empty group
  const moved = !entries.length && group.entries.some((e) => place.exists(group.key, e.id))
  // completed options: top-level options with items in the current context, hidden ones left out
  // completed options over the whole playthrough, like "Completed" (FL11, FL14)
  const total = totals[group.key]
  const counted = group.entries.filter((e) => !place.isHidden(group.key, e.id) && (total?.get(e.id)?.total ?? 0) > 0)
  const done = counted.filter((e) => complete(total?.get(e.id))).length

  return (
    <section className="rounded-xl border bg-card p-1.5 shadow-xs">
      <div className={cn('px-1.5 py-1', open && 'mb-1 border-b pb-2')}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen(!openState)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold tracking-wide text-foreground/80 uppercase hover:text-foreground"
          >
            <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
            <span className="truncate">{group.label}</span>
            {selected.length > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
                {selected.length}
              </span>
            )}
            {counted.length > 0 && (
              <span
                className={cn(
                  'ml-auto flex shrink-0 items-center gap-0.5 text-[11px] font-normal tracking-normal normal-case tabular-nums',
                  done === counted.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
                title={`${done} of ${counted.length} options completed (100%)`}
              >
                <CircleCheck className="size-3" />
                {done}/{counted.length}
              </span>
            )}
          </button>
          <span className="flex shrink-0 justify-end gap-0.5">
            {sortable && open && (
              <button
                onClick={() => setEntryOrder(prefKey, order === 'name' ? 'default' : 'name')}
                className={cn(
                  'rounded p-0.5 hover:bg-muted hover:text-foreground',
                  order === 'name' ? 'text-foreground' : 'text-muted-foreground',
                )}
                title={
                  order === 'name' ? 'Sorted A–Z – click for the default order' : 'Default order – click to sort A–Z'
                }
                aria-label={order === 'name' ? 'Use default order' : 'Sort A–Z'}
              >
                {order === 'name' ? <ArrowDownAZ className="size-3.5" /> : <ListOrdered className="size-3.5" />}
              </button>
            )}
            {selected.length > 0 && (
              <button
                onClick={() => scope.clear(group.key)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Clear"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </div>
        {/* progress of the items in any option of the group (respecting the other filters);
          on its own line, so every group's bar has the same length */}
        <div
          className="mt-1 flex items-center gap-2 pl-5"
          title={`${tally.obtained} of ${tally.total} items in ${group.label.toLowerCase()} obtained (with the other filters and the search)`}
        >
          <TallyBar tally={tally} className="h-1 flex-1" />
          <TallyText tally={tally} className="w-28 shrink-0 text-right text-[11px]" />
        </div>
      </div>
      {open && scope === ITEMS_SCOPE && group.key === 'crafting' && <CraftingOptions />}
      {open && scope === ITEMS_SCOPE && group.key === 'progression' && <ProgressionOptions />}
      {open && (
        <ul className="flex flex-col gap-px">
          {entries.length === 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              {moved ? 'All options are completed or hidden' : 'No matching items'}
            </li>
          )}
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              group={group}
              entry={e}
              facets={facets}
              isVisible={shownChild(e)}
              action="hide"
              // while searching, show the children that matched
              expand={expandFor(e)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * "Almost done": the options closest to completion (whole playthrough), duplicates of the
 * options in their groups. Left out while searching the filters (the originals are found).
 */
function AlmostDoneSection({ groups, facets, totals }: { groups: AnyGroup[]; facets: AnyFacets; totals: AnyFacets }) {
  const scope = useContext(ScopeContext)
  const q = useContext(QueryContext)
  const place = useContext(PlacementContext)
  const [open, setOpen] = useSectionOpen(scope.prefix + ALMOST_DONE, true)
  const list = useMemo(() => almostDone(groups, totals, place), [groups, totals, place])
  if (q || !list.length) return null

  return (
    <section className="rounded-xl border bg-card p-1.5 shadow-xs">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-1.5 px-1.5 py-1 text-xs font-semibold tracking-wide text-foreground/80 uppercase hover:text-foreground',
          open && 'mb-1 border-b pb-2',
        )}
        title="The options closest to completion (whole playthrough, at least 5 items) – the same filters as in their groups"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="truncate">{ALMOST_DONE_LABEL}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-px">
          {list.map(({ group, entry, parent }) => (
            <EntryRow
              key={`${group.key}/${entry.id}`}
              group={group}
              entry={entry}
              facets={facets}
              isVisible={() => false}
              context={parent ? `${group.label} › ${parent.name}` : group.label}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * "Completed" / "Hidden" at the bottom: the options moved out of their groups,
 * listed under their group's name. A moved parent takes its children along.
 */
function MovedSection({
  kind,
  groups,
  facets,
}: {
  kind: 'completed' | 'hidden'
  groups: AnyGroup[]
  facets: AnyFacets
}) {
  const q = useContext(QueryContext)
  const place = useContext(PlacementContext)
  const { editMode } = useContext(SidebarUiContext)
  const scope = useContext(ScopeContext)
  const [openState, setOpen] = useSectionOpen(`${scope.prefix}moved:${kind}`, false)
  // in edit mode the hidden options are shown, to bring them back easily
  const open = openState || (kind === 'hidden' && editMode)

  const lists = movedLists(kind, groups, place, q)
  const count = lists.reduce((n, x) => n + x.list.length, 0)
  if (!count) return null

  const Icon = kind === 'hidden' ? EyeOff : CircleCheckBig
  return (
    <section className="rounded-xl border border-dashed bg-card/60 p-1.5">
      <button
        onClick={() => setOpen(!openState)}
        className={cn(
          'flex w-full items-center gap-1.5 px-1.5 py-1 text-xs font-semibold tracking-wide text-foreground/70 uppercase hover:text-foreground',
          (open || q) && 'mb-1 border-b pb-2',
        )}
        title={
          kind === 'hidden'
            ? 'Options you hid – they still work as filters; the eye shows them in their group again'
            : 'Options at 100% (in the current context)'
        }
      >
        <ChevronRight className={cn('size-3.5 transition-transform', (open || q) && 'rotate-90')} />
        <Icon className="size-3.5" />
        {kind === 'hidden' ? 'Hidden' : 'Completed'}
        <span className="ml-auto font-normal tracking-normal normal-case text-muted-foreground">{count}</span>
      </button>
      {(open || !!q) &&
        lists.map(({ group, list }) => (
          <div key={group.key} className="mt-1">
            <div className="px-2 pt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </div>
            <ul className="flex flex-col gap-px">
              {list.map((e) => (
                <EntryRow
                  key={e.id}
                  group={group}
                  entry={e}
                  facets={facets}
                  isVisible={(c) => place.exists(group.key, c.id)}
                  action={kind === 'hidden' ? 'show' : undefined}
                  showCompleted={kind === 'completed'}
                />
              ))}
            </ul>
          </div>
        ))}
    </section>
  )
}

/** Options of the "Crafting" group: station toggle, hint without a world. */
/** "Up to" (a milestone contains everything available by then) or "exactly" (what it adds). */
function ProgressionOptions() {
  const mode = usePrefs((s) => s.progressionMode)
  const setMode = usePrefs((s) => s.setProgressionMode)
  return (
    <div className="mb-1 flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
      <span>Available</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(v) => v && setMode(v as ProgressionMode)}
        aria-label="Progression filter mode"
      >
        <ToggleGroupItem
          value="upTo"
          className="h-5 min-h-0 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          title="Everything available by this milestone"
        >
          up to
        </ToggleGroupItem>
        <ToggleGroupItem
          value="exactly"
          className="h-5 min-h-0 px-2 text-[11px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          title="Only what becomes available at it"
        >
          exactly at
        </ToggleGroupItem>
      </ToggleGroup>
      <span>the milestone</span>
    </div>
  )
}

function CraftingOptions() {
  const stationsRequired = usePrefs((s) => s.stationsRequired)
  const setStationsRequired = usePrefs((s) => s.setStationsRequired)
  const hasWorld = useActiveWorld() !== null
  return (
    <div className="mb-1 flex flex-col gap-1 px-2 pb-1 text-xs text-muted-foreground">
      <label
        className="flex cursor-pointer items-center gap-2"
        title="On: a recipe only counts as craftable if you have its crafting stations (obtained, or in a chest). Off: stations are ignored."
      >
        <Checkbox checked={stationsRequired} onCheckedChange={(v) => setStationsRequired(v === true)} />
        Crafting stations required
      </label>
      {!hasWorld && <p>Attach a world to see what you can craft from your chests.</p>}
    </div>
  )
}

function EntryRow({
  group,
  entry,
  facets,
  isVisible,
  action,
  expand = false,
  nested = false,
  context,
  showCompleted = false,
}: {
  group: AnyGroup
  entry: FilterEntry
  facets: AnyFacets
  isVisible: (e: FilterEntry) => boolean
  /** eye button: hide the option, or show a hidden one in its group again */
  action?: 'hide' | 'show'
  /** show the children without expanding (filter search) */
  expand?: boolean
  nested?: boolean
  /** a duplicate outside its group ("Almost done"): the group it belongs to, no subgroups */
  context?: string
  /** the "Completed" section: the date it was completed next to the name */
  showCompleted?: boolean
}) {
  const scope = useContext(ScopeContext)
  const place = useContext(PlacementContext)
  const optionBars = usePrefs((s) => s.layout.optionBars)
  const compact = usePrefs((s) => s.layout.density === 'compact')
  const { editMode } = useContext(SidebarUiContext)
  // "hide" only in edit mode (safe from misclicks); "show" is always offered in "Hidden"
  const eye = action === 'show' || (action === 'hide' && editMode) ? action : undefined
  const isTarget = useContext(ActiveTargetContext) === `${group.key}/${entry.id}`
  const completedAt = useCompletedAt(`${scope.prefix}${group.key}/${entry.id}`)
  const rowRef = useRef<HTMLDivElement>(null)
  // keep the option chosen with ↑/↓ in view
  useEffect(() => {
    if (isTarget) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isTarget])
  const groupSelection = scope.useSelection(group.key)
  const selected = groupSelection.includes(entry.id)
  const childSelected = entry.children?.some((c) => groupSelection.includes(c.id)) ?? false
  const [expanded, setExpanded] = useState(!!group.expanded)
  const tally = facets[group.key].get(entry.id) ?? EMPTY
  // no matching items with the other filters / the search: grayed out, not removed (no jumps)
  const empty = !place.hasItems(group.key, entry.id)
  const children = entry.children?.filter(isVisible) ?? []
  const showChildren = children.length > 0 && (expanded || childSelected || expand)

  return (
    <li>
      <div
        ref={rowRef}
        className={cn(
          'group flex items-center rounded-md',
          selected ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-foreground/[0.06]',
          // the option Enter would select in the filter search
          isTarget && 'outline-2 outline-offset-1 outline-primary outline-dashed',
          nested && 'ml-5',
          empty && 'opacity-40',
        )}
        title={
          [
            completedAt && `Completed ${formatRelativeDay(completedAt)}`,
            empty && 'No matching items with the current filters',
          ]
            .filter(Boolean)
            .join(' – ') || undefined
        }
      >
        {eye && (
          <button
            onClick={() => place.toggleHidden(group.key, entry.id, entry.name)}
            className="ml-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            title={
              eye === 'hide' ? `Hide “${entry.name}” (moves it to “Hidden” at the bottom)` : 'Show in its group again'
            }
            aria-label={eye === 'hide' ? `Hide ${entry.name}` : `Show ${entry.name} again`}
          >
            {eye === 'hide' ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
        <button
          onClick={() => scope.toggle(group.key, entry.id)}
          className={cn('flex min-w-0 flex-1 flex-col gap-1 px-2 text-left', compact ? 'py-1' : 'py-1.5')}
          aria-pressed={selected}
        >
          <span className="flex items-center gap-2">
            {group.key === 'rarity' && entry.id !== UNKNOWN_RARITY ? (
              // the wiki's rarity image already shows the name in its color
              <span className="flex min-w-0 flex-1 items-center">
                <RarityIcon rarity={Number(entry.id)} />
                {context && <span className="ml-1.5 truncate text-[11px] text-muted-foreground">{context}</span>}
              </span>
            ) : (
              <>
                {entry.icon ? <WikiIcon src={entry.icon} alt="" size={20} /> : <span className="w-5" />}
                <span className={cn('min-w-0 flex-1 truncate text-sm', selected && 'font-medium')} title={entry.name}>
                  {entry.name}
                  {context && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{context}</span>}
                  {showCompleted && completedAt && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      {formatRelativeDay(completedAt)}
                    </span>
                  )}
                </span>
              </>
            )}
            <TallyText tally={tally} className="text-xs" />
          </span>
          {optionBars && <TallyBar tally={tally} className="ml-7 w-auto" />}
        </button>
        {/* the slot is always reserved so rows with and without subcategories line up */}
        {!context && group.entries.some((e) => e.children?.length) && (
          <span className="mr-1 grid w-6 shrink-0 place-items-center">
            {children.length > 0 && (
              <button
                onClick={() => setExpanded(!showChildren)}
                className="rounded p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                title={showChildren ? 'Hide subcategories' : 'Show subcategories'}
              >
                <ChevronRight className={cn('size-3.5 transition-transform', showChildren && 'rotate-90')} />
              </button>
            )}
          </span>
        )}
      </div>
      {showChildren && (
        <ul className="mt-px flex flex-col gap-px">
          {children.map((c) => (
            <EntryRow
              key={c.id}
              group={group}
              entry={c}
              facets={facets}
              isVisible={isVisible}
              // children in their group can be hidden one by one; inside a moved parent they move with it
              action={action === 'hide' ? 'hide' : undefined}
              nested
            />
          ))}
        </ul>
      )}
    </li>
  )
}
