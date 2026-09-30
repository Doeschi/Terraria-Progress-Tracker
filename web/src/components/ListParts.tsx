import { Fragment, useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterGroup } from '@/lib/filtering'
import { usePrefs } from '@/lib/prefs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTopLeftKeyLabel, type SearchTarget } from '@/hooks/useSearchShortcuts'

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
        placeholder={placeholder}
        className={cn('peer', small ? 'h-8 pr-7 pl-8 text-sm' : 'pr-8 pl-8', withMode && 'pr-24')}
        aria-label={label}
        aria-keyshortcuts={shortcut ? (shortcut === 'filters' ? `Shift+${key}` : `${key} /`) : undefined}
        data-shortcut={shortcut}
      />
      {shortcut && !value && (
        // the shortcut while the field is empty and not focused
        <kbd
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 rounded border bg-muted px-1 font-sans text-[10px] leading-4 text-muted-foreground peer-focus:hidden',
            withMode ? 'right-[4.25rem]' : 'right-2',
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
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Clear"
          >
            <X className={icon} />
          </button>
        )}
        {withMode && <SearchModeSwitch />}
      </span>
    </div>
  )
}

/** "Filters" button for narrow screens: the filter sidebar in a dialog. */
export function MobileFiltersButton({ active, children }: { active: number; children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden">
          <SlidersHorizontal /> Filters{active > 0 && ` (${active})`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-0">
        <DialogTitle className="px-4 pt-4">Filters</DialogTitle>
        {children}
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
}: {
  groups: FilterGroup<K>[]
  selection: Record<K, string[]>
  search: string
  onRemove: (group: K, id: string) => void
  onClearSearch: () => void
  onClearAll: () => void
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

  const always = usePrefs((s) => s.layout.filterBarAlways)

  // shown also without filters (setting), so the list below does not jump when the first filter is added
  if (!active.length && !search) {
    if (!always) return null
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
