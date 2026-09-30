import { Fragment, useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterGroup, SearchMode } from '@/lib/filtering'
import { usePrefs } from '@/lib/prefs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

// Parts shared by the item list and the bestiary list (and the filter sidebar).

/** "Fuzzy" (typos allowed, default) or "Exact" (the text must appear in the name) - for all searches. */
export function SearchModeToggle() {
  const mode = usePrefs((s) => s.searchMode)
  const setMode = usePrefs((s) => s.setSearchMode)
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={(v) => v && setMode(v as SearchMode)}
      aria-label="Search mode"
      className="shrink-0"
    >
      <ToggleGroupItem
        value="fuzzy"
        className="px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        title="Fuzzy: finds names even with typos or missing letters"
      >
        Fuzzy
      </ToggleGroupItem>
      <ToggleGroupItem
        value="exact"
        className="px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        title="Exact: only names that contain the text as typed (upper/lower case does not matter)"
      >
        Exact
      </ToggleGroupItem>
    </ToggleGroup>
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
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  /** compact variant (filter sidebar) */
  small?: boolean
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const icon = small ? 'size-3.5' : 'size-4'
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search
        className={cn('pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground', icon)}
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={small ? 'h-8 pr-7 pl-8 text-sm' : 'pr-8 pl-8'}
        aria-label={label}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          title="Clear"
        >
          <X className={icon} />
        </button>
      )}
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

  // always shown, so the list below does not jump when the first filter is added
  if (!active.length && !search) {
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
