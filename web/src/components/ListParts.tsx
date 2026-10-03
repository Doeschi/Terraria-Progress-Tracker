import { Fragment, useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterGroup } from '@/lib/filtering'
import { usePrefs } from '@/lib/prefs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTopLeftKeyLabel, type SearchTarget } from '@/hooks/useSearchShortcuts'
import { useActiveRow, useListCursor } from '@/lib/listCursor'

// Parts shared by the item list and the bestiary list (and the filter sidebar).

/** "Fuzzy" (typos allowed, default) or "Exact" (the text must appear in the name), inside the
 * search field; one setting for all searches. */
function SearchModeSwitch() {
  const mode = usePrefs((s) => s.searchMode)
  const setMode = usePrefs((s) => s.setSearchMode)
  return (
    <button
      onClick={() => setMode(mode === 'fuzzy' ? 'exact' : 'fuzzy')}
      className={cn(
        'rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        mode === 'exact'
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      title={
        mode === 'fuzzy'
          ? 'Fuzzy search: finds names even with typos – click for exact search'
          : 'Exact search: only names that contain the text – click for fuzzy search'
      }
      aria-label={`Search mode: ${mode}`}
    >
      {mode === 'fuzzy' ? 'Fuzzy' : 'Exact'}
    </button>
  )
}

/** "NPCs" in the item search: also suggest the best-matching NPC (S5). */
function NpcSearchSwitch() {
  const on = usePrefs((s) => s.searchNpcs)
  const setOn = usePrefs((s) => s.setSearchNpcs)
  return (
    <button
      onClick={() => setOn(!on)}
      aria-pressed={on}
      className={cn(
        'rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
      title={
        on
          ? 'NPCs: the best-matching NPC is suggested under the field – click to search items only'
          : 'Items only – click to also suggest the best-matching NPC'
      }
    >
      NPCs
    </button>
  )
}

/** Search input with a magnifier and a clear button. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  small = false,
  className,
  onKeyDown,
  withMode = false,
  withNpcs = false,
  shortcut,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  /** compact variant (filter sidebar) */
  small?: boolean
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** Fuzzy / Exact switch inside the field (item and bestiary search) */
  withMode?: boolean
  /** "NPCs" switch inside the field (item search) */
  withNpcs?: boolean
  /** reachable with a keyboard shortcut (useSearchShortcuts); shows the key while empty */
  shortcut?: SearchTarget
}) {
  const icon = small ? 'size-3.5' : 'size-4'
  const key = useTopLeftKeyLabel()
  const keys = shortcut === 'filters' ? `⇧${key}` : `${key}`
  // Escape clears the search, a second one leaves the field
  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (value) onChange('')
    else e.currentTarget.blur()
  }
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search
        className={cn('pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground', icon)}
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={keyDown}
        // the item / bestiary search takes over the keyboard from the table (S6)
        onFocus={withMode ? () => useListCursor.getState().setTableIndex(null) : undefined}
        placeholder={placeholder}
        className={cn(
          'peer',
          // touch screens: 16 px, iOS zooms into smaller inputs when they get the focus
          small ? 'h-8 pr-7 pl-8 text-sm pointer-coarse:text-base' : 'pr-8 pl-8',
          withMode && 'pr-24',
          withMode && withNpcs && 'pr-36',
        )}
        aria-label={label}
        aria-keyshortcuts={shortcut ? (shortcut === 'filters' ? `Shift+${key}` : `${key} /`) : undefined}
        data-shortcut={shortcut}
      />
      {shortcut && !value && (
        // the shortcut while the field is empty and not focused
        <kbd
          className={cn(
            // keyboard shortcuts mean nothing on a touch screen (MO6)
            'pointer-events-none absolute top-1/2 -translate-y-1/2 rounded border bg-muted px-1 font-sans text-[10px] leading-4 text-muted-foreground peer-focus:hidden pointer-coarse:hidden',
            withMode ? (withNpcs ? 'right-[7.25rem]' : 'right-[4.25rem]') : 'right-2',
          )}
          title={shortcut === 'filters' ? `Shift + ${key}` : `${key} or /`}
        >
          {keys}
        </kbd>
      )}
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button
            onClick={() => onChange('')}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground pointer-coarse:p-1.5"
            title="Clear"
          >
            <X className={icon} />
          </button>
        )}
        {withNpcs && <NpcSearchSwitch />}
        {withMode && <SearchModeSwitch />}
      </span>
    </div>
  )
}

/** Which row Enter opens, and ↑/↓ through the rows (S4, S6): a small bar at the bottom of the
 * screen, while searching and while the table has the keyboard. */
export function SearchHint({ search }: { search: string }) {
  const { row, index, count } = useActiveRow(search)
  const inTable = useListCursor((s) => s.tableIndex !== null)
  if (!row) return null
  return (
    <div
      role="status"
      // the keyboard hint bar: not on touch screens (MO6)
      className="pointer-events-none fixed pointer-coarse:hidden bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border bg-popover/95 px-3 py-1 text-xs whitespace-nowrap text-muted-foreground shadow-lg backdrop-blur"
    >
      <kbd className="rounded border bg-muted px-1 font-sans">↵</kbd> open{' '}
      <span className="font-medium text-foreground">{row.name}</span>
      {count > 1 && (
        <>
          {' '}
          · <kbd className="rounded border bg-muted px-1 font-sans">↑↓</kbd> {index + 1} of {count}
        </>
      )}
      {inTable && (
        <>
          {' '}
          · <kbd className="rounded border bg-muted px-1 font-sans">Esc</kbd> done
        </>
      )}
    </div>
  )
}

/** "Filters" button for narrow screens: the filter sidebar in a dialog. */
export function MobileFiltersButton({
  active,
  shown,
  children,
}: {
  active: number
  /** what the list shows with these filters, e.g. "1,234 items" */
  shown: string
  children: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* phones: only the icon, the number of active filters as a badge (room for the search) */}
        <Button
          variant="outline"
          size="sm"
          className="relative md:hidden max-sm:size-8 max-sm:p-0"
          title="Filters"
          aria-label={`Filters${active > 0 ? ` (${active} active)` : ''}`}
        >
          <SlidersHorizontal />
          <span className="max-sm:hidden">Filters{active > 0 && ` (${active})`}</span>
          {active > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground sm:hidden">
              {active}
            </span>
          )}
        </Button>
      </DialogTrigger>
      {/* the title and the close button stay at the top, only the filters scroll (their search bar
        sticks below the title) */}
      <DialogContent showCloseButton={false} className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
          {/* updates while filters are switched: how many are on, what the list shows */}
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>Filters</DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              {active === 0 ? 'No filters' : active === 1 ? '1 filter' : `${active} filters`} active · {shown} shown
            </p>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The active search and filters as removable chips. Options within a group are combined
 * with OR, groups (and the search) with AND - shown literally.
 */
export function ActiveFilterBar<K extends string>({
  groups,
  selection,
  search,
  onRemove,
  onClearSearch,
  onClearAll,
  onlyActive = false,
}: {
  groups: FilterGroup<K>[]
  selection: Record<K, string[]>
  search: string
  onRemove: (group: K, id: string) => void
  onClearSearch: () => void
  onClearAll: () => void
  /** phones (MO2): no "No filters active" line, the room is for the list */
  onlyActive?: boolean
}) {
  // "<group>/<id>" -> option name, children included
  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups)
      for (const e of g.entries) {
        m.set(`${g.key}/${e.id}`, e.name)
        for (const c of e.children ?? []) m.set(`${g.key}/${c.id}`, c.name)
      }
    return m
  }, [groups])
  const active = groups.filter((g) => selection[g.key].length > 0)

  // shown also without filters, so the list below does not jump when the first filter is added
  if (!active.length && !search) {
    if (onlyActive) return null
    return (
      <div className="flex items-center border-b px-3 py-2 text-xs">
        {/* same box as a filter chip, so the bar keeps its height */}
        <span className="rounded-lg border border-dashed py-1 pr-2 pl-2 text-muted-foreground">
          <span className="inline-block py-0.5">No filters active – choose options on the left or search</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 text-xs">
      {search && (
        <div className="flex items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-2">
          <span className="font-medium text-muted-foreground">Search:</span>
          <button
            onClick={onClearSearch}
            className="flex max-w-64 items-center gap-1 rounded-md bg-primary/15 py-0.5 pr-1 pl-2 font-medium hover:bg-primary/25"
            title="Clear search"
          >
            <span className="truncate">“{search}”</span>
            <X className="size-3 shrink-0" />
          </button>
        </div>
      )}
      {active.map((g, gi) => (
        <Fragment key={g.key}>
          {(gi > 0 || search) && <span className="font-semibold text-muted-foreground uppercase">and</span>}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-2">
            <span className="font-medium text-muted-foreground">{g.label}:</span>
            {selection[g.key].map((id, i) => (
              <Fragment key={id}>
                {i > 0 && <span className="text-muted-foreground">or</span>}
                <button
                  onClick={() => onRemove(g.key, id)}
                  className="flex items-center gap-1 rounded-md bg-primary/15 py-0.5 pr-1 pl-2 font-medium hover:bg-primary/25"
                  title="Remove filter"
                >
                  {names.get(`${g.key}/${id}`) ?? id}
                  <X className="size-3" />
                </button>
              </Fragment>
            ))}
          </div>
        </Fragment>
      ))}
      {/* right after the last filter, not at the far edge */}
      <Button variant="ghost" size="xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  )
}
