import { Fragment, useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterGroup } from '@/lib/filtering'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

// Parts shared by the item list and the bestiary list (and the filter sidebar).

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
  if (!active.length && !search) return null

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
      <Button variant="ghost" size="xs" onClick={onClearAll} className="ml-auto">
        Clear all
      </Button>
    </div>
  )
}
