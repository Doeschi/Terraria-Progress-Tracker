import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useStore } from '@/store'
import { ALMOST_DONE, ALMOST_DONE_LABEL, groupOrder } from '@/lib/filterView'
import { usePrefs, type Layout } from '@/lib/prefs'
import { useTheme, type Theme } from '@/lib/theme'
import { buildFilterGroups } from '@/lib/filtering'
import { buildBestiaryGroups } from '@/lib/bestiary'
import { DETAIL_SECTIONS, move, ordered } from '@/lib/layout'
import { buildColumns } from './table/columns'
import { resolveViews } from './table/presets'
import { useIsPhone } from '@/hooks/useIsPhone'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// The settings dialog (⚙ → Settings…): what is shown where. Everything is remembered in the
// browser (prefs.ts, Layout); "Reset all settings" restores the defaults.

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const layout = usePrefs((s) => s.layout)
  const phone = useIsPhone()
  const setLayout = usePrefs((s) => s.setLayout)
  const resetLayout = usePrefs((s) => s.resetLayout)
  const { theme, setTheme } = useTheme()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            What is shown where. Remembered in this browser, not in the progress file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Part title="Appearance">
            <Row label="Theme">
              <Choice<Theme>
                value={theme}
                onChange={setTheme}
                options={[
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                  ['system', 'System'],
                ]}
              />
            </Row>
            <Row label="Density" hint="Compact: lower table rows, smaller icons, tighter filter options">
              <Choice<Layout['density']>
                value={layout.density}
                onChange={(density) => setLayout({ density })}
                options={[
                  ['comfortable', 'Comfortable'],
                  ['compact', 'Compact'],
                ]}
              />
            </Row>
          </Part>

          <Part title="Item list">
            {/* phones show cards, without views */}
            {!phone && <ViewOrderEditor />}
            <Check
              checked={layout.dimUnavailable}
              onChange={(dimUnavailable) => setLayout({ dimUnavailable })}
              label="Dim items not available yet (with a loaded world: items after a boss it has not defeated; also in the Progression filter)"
            />
          </Part>

          <Part title="Filter sidebar">
            <Check
              checked={layout.optionBars}
              onChange={(optionBars) => setLayout({ optionBars })}
              label="Progress bar under every filter option"
            />
            <FilterGroupsEditor />
          </Part>

          <Part title="Detail panel">
            <OrderEditor
              items={DETAIL_SECTIONS}
              order={layout.detailOrder}
              hidden={layout.hiddenDetail}
              onChange={(detailOrder, hiddenDetail) => setLayout({ detailOrder, hiddenDetail })}
            />
          </Part>

          <Part title="Other">
            <Check
              checked={layout.celebrate}
              onChange={(celebrate) => setLayout({ celebrate })}
              label="Celebrate completed filters (a message with confetti when a filter reaches 100%)"
            />
            <Check
              checked={layout.easterEggs}
              onChange={(easterEggs) => setLayout({ easterEggs })}
              label="Easter eggs (a few hidden Terraria references)"
            />
          </Part>

          <div className="flex justify-end border-t pt-4">
            <Button variant="outline" size="sm" onClick={resetLayout}>
              Reset all settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Order of the views in the views dropdown (and of the favorite buttons). */
function ViewOrderEditor() {
  const data = useStore((s) => s.data)
  const views = usePrefs((s) => s.views)
  const setViews = usePrefs((s) => s.setViews)
  const list = useMemo(() => (data ? resolveViews(buildColumns(data), views) : []), [data, views])
  if (!list.length) return null
  return (
    <Row label="Order of the views" hint="Edit, add and favorite views in the views dropdown">
      <OrderEditor
        items={list.map((v) => ({ id: v.id, label: v.label }))}
        order={list.map((v) => v.id)}
        onChange={(order) => setViews({ ...views, order })}
      />
    </Row>
  )
}

/** The order of the filter groups of the item list or the bestiary. */
function FilterGroupsEditor() {
  const data = useStore((s) => s.data)
  const layout = usePrefs((s) => s.layout)
  const setLayout = usePrefs((s) => s.setLayout)
  const [scope, setScope] = useState<'items' | 'bestiary'>('items')
  const groups = useMemo(() => {
    if (!data) return []
    return [
      { id: ALMOST_DONE, label: ALMOST_DONE_LABEL },
      ...(scope === 'items' ? buildFilterGroups(data) : buildBestiaryGroups(data)).map((g) => ({
        id: g.key as string,
        label: g.label,
      })),
    ]
  }, [data, scope])
  if (!groups.length) return null
  const prefix = scope === 'items' ? '' : 'bestiary:'

  return (
    <Row label="Order of the filter groups">
      <div className="flex flex-col gap-2">
        <Choice<'items' | 'bestiary'>
          value={scope}
          onChange={setScope}
          options={[
            ['items', 'Items'],
            ['bestiary', 'Bestiary'],
          ]}
        />
        <OrderEditor
          items={groups}
          // "Almost done" starts at the top, also for an order saved before it existed
          order={groupOrder(
            groups.map((g) => g.id),
            layout.groupOrder[prefix] ?? [],
          )}
          onChange={(order) => setLayout({ groupOrder: { ...layout.groupOrder, [prefix]: order } })}
        />
      </div>
    </Row>
  )
}

/** A list with a checkbox (shown) and up / down buttons per entry. */
function OrderEditor({
  items,
  order,
  hidden,
  onChange,
}: {
  items: { id: string; label: string }[]
  order: string[]
  /** hidden ids; undefined = no checkboxes (order only) */
  hidden?: string[]
  onChange: (order: string[], hidden: string[]) => void
}) {
  const ids = ordered(
    items.map((i) => i.id),
    order,
  )
  const label = new Map(items.map((i) => [i.id, i.label]))
  return (
    <ul className="divide-y rounded-lg border">
      {ids.map((id, n) => {
        const shown = !hidden?.includes(id)
        return (
          <li key={id} className={cn('flex items-center gap-2 px-2 py-1', !shown && 'text-muted-foreground')}>
            {hidden && (
              <Checkbox
                checked={shown}
                onCheckedChange={(v) => onChange(ids, v === true ? hidden.filter((h) => h !== id) : [...hidden, id])}
                aria-label={`Show ${label.get(id)}`}
              />
            )}
            <span className="flex-1 text-sm">{label.get(id)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={n === 0}
              onClick={() => onChange(move(ids, id, -1), hidden ?? [])}
              aria-label="Move up"
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={n === ids.length - 1}
              onClick={() => onChange(move(ids, id, 1), hidden ?? [])}
              aria-label="Move down"
            >
              <ArrowDown />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid items-center gap-1.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
        <div className="text-sm font-medium">{label}</div>
        <div>{children}</div>
      </div>
      {/* the full width: no wrapping in the narrow label column */}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  )
}

function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v as T)}>
      {options.map(([v, label]) => (
        <ToggleGroupItem
          key={v}
          value={v}
          className="px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
