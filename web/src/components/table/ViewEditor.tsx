import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { usePrefs, type ColumnSort, type ViewDef } from '@/lib/prefs'
import { move } from '@/lib/layout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { COLUMN_GROUPS, type ItemColumn } from './columns'
import { builtinDefault, COLUMN_PRESETS, type View } from './presets'

/** What the dialog edits: an existing view, or a new one (optionally started from the current table). */
export type ViewEditTarget = { view: View } | { view: null; start: ViewDef }

const sameSort = (a: ColumnSort[], b: ColumnSort[]) =>
  a.length === b.length && a.every((s, i) => s.id === b[i].id && s.desc === b[i].desc)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Edit a view: name, columns in order, sorting, favorite. Built-in views can be restored to
 * their default, own views deleted. Saving applies the view.
 */
export function ViewEditor({
  target,
  catalogue,
  current,
  onClose,
  onApply,
}: {
  target: ViewEditTarget
  catalogue: ItemColumn[]
  /** the table as it is now ("Take current table") */
  current: ViewDef
  onClose: () => void
  onApply: (view: ViewDef) => void
}) {
  const views = usePrefs((s) => s.views)
  const setViews = usePrefs((s) => s.setViews)
  const favorites = usePrefs((s) => s.layout.favoriteViews)
  const setLayout = usePrefs((s) => s.setLayout)
  const start = target.view ?? target.start
  const [label, setLabel] = useState(start.label)
  const [columns, setColumns] = useState(start.columns)
  const [sorting, setSorting] = useState<ColumnSort[]>(start.sorting.slice(0, 1))
  const [favorite, setFavorite] = useState(target.view ? favorites.includes(target.view.id) : false)
  const byId = new Map(catalogue.map((c) => [c.id, c]))
  const preset = target.view?.builtin ? COLUMN_PRESETS.find((p) => p.id === target.view!.id) : undefined

  const setFavoriteOf = (id: string, on: boolean) =>
    setLayout({ favoriteViews: on ? [...favorites.filter((f) => f !== id), id] : favorites.filter((f) => f !== id) })

  const save = () => {
    const name = label.trim() || start.label
    const def: ViewDef = { id: target.view?.id ?? `custom-${Date.now().toString(36)}`, label: name, columns, sorting }
    if (preset) {
      // built-in: keep only what differs from the default
      const base = builtinDefault(preset, catalogue)
      const edit: Partial<Omit<ViewDef, 'id'>> = {}
      if (def.label !== base.label) edit.label = def.label
      if (!sameList(def.columns, base.columns)) edit.columns = def.columns
      if (!sameSort(def.sorting, base.sorting)) edit.sorting = def.sorting
      const { [def.id]: _old, ...overrides } = views.overrides
      setViews({ ...views, overrides: Object.keys(edit).length ? { ...overrides, [def.id]: edit } : overrides })
    } else if (target.view) {
      setViews({ ...views, custom: views.custom.map((v) => (v.id === def.id ? def : v)) })
    } else {
      setViews({ ...views, custom: [...views.custom, def] })
    }
    setFavoriteOf(def.id, favorite)
    onApply(def)
    onClose()
  }

  const restore = () => {
    if (!preset) return
    const { [preset.id]: _old, ...overrides } = views.overrides
    setViews({ ...views, overrides })
    onApply(builtinDefault(preset, catalogue))
    onClose()
  }

  const remove = () => {
    if (!target.view || target.view.builtin) return
    const id = target.view.id
    setViews({
      ...views,
      custom: views.custom.filter((v) => v.id !== id),
      order: views.order.filter((o) => o !== id),
    })
    setFavoriteOf(id, false)
    onClose()
  }

  const available = catalogue.filter((c) => !columns.includes(c.id))
  const sortValue = sorting[0]?.id ?? 'none'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.view ? `Edit view “${target.view.label}”` : 'New view'}</DialogTitle>
          <DialogDescription>
            The columns in this order, and how the table is sorted. Stored in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Columns</Label>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setColumns(current.columns)
                  setSorting(current.sorting.slice(0, 1))
                }}
                title="Columns and sorting of the table as it is shown now"
              >
                Take current table
              </Button>
            </div>
            <ul className="divide-y rounded-lg border">
              {columns.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No columns</li>}
              {columns.map((id, n) => (
                <li key={id} className="flex items-center gap-2 px-2 py-1">
                  <span className="flex-1 text-sm">
                    {byId.get(id)?.label ?? id}
                    <span className="ml-2 text-xs text-muted-foreground">{byId.get(id)?.group}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={n === 0}
                    onClick={() => setColumns(move(columns, id, -1))}
                    aria-label="Move up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={n === columns.length - 1}
                    onClick={() => setColumns(move(columns, id, 1))}
                    aria-label="Move down"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setColumns(columns.filter((c) => c !== id))
                      if (sorting[0]?.id === id) setSorting([])
                    }}
                    aria-label="Remove column"
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="self-start" disabled={!available.length}>
                  <Plus /> Add column
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[50vh] w-56 overflow-y-auto">
                {COLUMN_GROUPS.map((group, gi) => {
                  const cols = available.filter((c) => c.group === group)
                  if (!cols.length) return null
                  return (
                    <div key={group}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
                      {cols.map((c) => (
                        <DropdownMenuItem key={c.id} onSelect={() => setColumns([...columns, c.id])}>
                          {c.label}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Sorting</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sortValue}
                onValueChange={(v) => setSorting(v === 'none' ? [] : [{ id: v, desc: sorting[0]?.desc ?? false }])}
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (by name)</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  {columns.map((id) => (
                    <SelectItem key={id} value={id}>
                      {byId.get(id)?.label ?? id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sorting[0] && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={sorting[0].desc ? 'desc' : 'asc'}
                  onValueChange={(v) => v && setSorting([{ id: sorting[0].id, desc: v === 'desc' }])}
                >
                  <ToggleGroupItem value="asc" className="px-2.5 text-xs">
                    Ascending
                  </ToggleGroupItem>
                  <ToggleGroupItem value="desc" className="px-2.5 text-xs">
                    Descending
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={favorite} onCheckedChange={(v) => setFavorite(v === true)} />
            Favorite – show as a button next to the views dropdown
          </label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {preset && target.view?.changed && (
              <Button variant="outline" onClick={restore} title="Name, columns and sorting as delivered">
                Restore default
              </Button>
            )}
            {target.view && !target.view.builtin && (
              <Button variant="destructive" onClick={remove}>
                Delete view
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!columns.length}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
