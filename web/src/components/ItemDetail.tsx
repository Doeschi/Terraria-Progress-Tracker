import { useEffect, useMemo } from 'react'
import { ArrowLeft, ExternalLink, Eye, EyeOff, PackageSearch, X } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { DIFFICULTY_LABELS } from '@/lib/availability'
import { chestSearchHint } from '@/lib/world'
import { chanceFor, dropKind, dropsFor, modeLabel, otherChances, quantityFor, type DropKind } from '@/lib/drops'
import type { Drop, GameData, Item, ShopRow } from '@/lib/types'
import { conditionNames } from '@/lib/conditions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DifficultyIcon, RarityIcon, WikiIcon } from './common'
import { RecipeSections } from './RecipeSections'
import { formatDate, nameOf } from '@/lib/format'
import { type ColumnGroup, type ItemColumn, type TrackingState } from './table/columns'
import { useItemColumns } from './table/useColumns'

// Everything known about one item, selected in the item table. On wide screens
// it is docked right of the table (the table stays usable, clicking another row
// switches the item); on narrow screens it slides in as an overlay.

// stats shown in the "Stats" section, in this order
const STAT_GROUPS: ColumnGroup[] = ['Combat', 'Tools', 'Use & placement', 'Economy']

function useDetailItem(): Item | undefined {
  const itemKey = useUi((s) => s.detailKey)
  return useStore((s) => (itemKey ? s.data?.itemsByKey.get(itemKey) : undefined))
}

/** Docked panel next to the table (wide screens). */
export function ItemDetailPanel() {
  const item = useDetailItem()
  const closeDetail = useUi((s) => s.closeDetail)
  if (!item) return null
  return (
    <aside
      className="relative flex w-[28rem] shrink-0 flex-col overflow-y-auto border-l bg-card"
      aria-label="Item details"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-3 right-3 z-10"
        onClick={closeDetail}
        aria-label="Close details"
        title="Close details"
      >
        <X />
      </Button>
      <DetailContent key={item.key} item={item} Title={PanelTitle} />
    </aside>
  )
}

/** Slide-in overlay (narrow screens). */
export function ItemDetailSheet() {
  const item = useDetailItem()
  const closeDetail = useUi((s) => s.closeDetail)
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && closeDetail()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {item && <DetailContent item={item} Title={SheetTitleText} />}
      </SheetContent>
    </Sheet>
  )
}

type TitleComponent = (props: { children: React.ReactNode }) => React.ReactNode

// the sheet needs Radix' accessible title/description; the docked panel plain elements
const SheetTitleText: TitleComponent = ({ children }) => (
  <>
    <SheetTitle className="text-lg leading-tight">{children}</SheetTitle>
    <SheetDescription className="sr-only">Item details</SheetDescription>
  </>
)
const PanelTitle: TitleComponent = ({ children }) => <h2 className="text-lg leading-tight font-semibold">{children}</h2>

/** Mouse "back" button (button 3) shows the previous item while there is one;
 * otherwise the browser handles it as usual. */
function useMouseBack() {
  useEffect(() => {
    const canGoBack = () => useUi.getState().detailHistory.length > 0
    // the browser navigates on mouseup; cancelling both events stops it
    const onDown = (e: MouseEvent) => {
      if (e.button === 3 && canGoBack()) e.preventDefault()
    }
    const onUp = (e: MouseEvent) => {
      if (e.button !== 3 || !canGoBack()) return
      e.preventDefault()
      useUi.getState().detailBack()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
}

/** Back to the previous item; sits left of the close button. */
function BackButton() {
  const previous = useUi((s) => s.detailHistory[s.detailHistory.length - 1])
  const previousName = useStore((s) => (previous ? s.data?.itemsByKey.get(previous)?.name : undefined))
  const detailBack = useUi((s) => s.detailBack)
  useMouseBack()
  if (!previous) return null
  const label = `Back to ${previousName ?? 'previous item'}`
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="absolute top-3 right-11 z-10"
      onClick={detailBack}
      aria-label={label}
      title={`${label} (mouse back button)`}
    >
      <ArrowLeft />
    </Button>
  )
}

function DetailContent({ item, Title }: { item: Item; Title: TitleComponent }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const hasWorld = useStore((s) => !!s.worlds[pt.id])
  const setChecked = useStore((s) => s.setChecked)
  const setIgnored = useStore((s) => s.setIgnored)
  const openDialog = useUi((s) => s.open)
  const catalogue = useItemColumns()
  const checked = pt.checked.includes(item.key)
  const checkedSet = useMemo(() => new Set(pt.checked), [pt.checked])
  const ignored = pt.ignored.includes(item.key)
  const tracking: TrackingState = { changedAt: pt.changedAt, difficulty: pt.difficulty }
  const changed = formatDate(pt.changedAt[item.key])

  return (
    <>
      <BackButton />
      <div className="flex flex-col gap-3 border-b p-4 pr-20">
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border bg-muted/40">
            <WikiIcon src={item.icon} alt="" size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <Title>{item.name}</Title>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <RarityIcon rarity={item.rarity} />
              {item.hardmode && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Hardmode</Badge>}
              {item.minDifficulty && (
                <Badge
                  className={
                    item.minDifficulty === 'master'
                      ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    <DifficultyIcon difficulty={item.minDifficulty} size={14} />
                    {item.minDifficulty === 'master' ? 'Master only' : 'Expert & Master'}
                  </span>
                </Badge>
              )}
              {item.eventOnly && <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300">Event only</Badge>}
              {item.introduced && <Badge className="bg-muted text-muted-foreground">Added in {item.introduced}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5',
              checked && 'border-primary/50 bg-primary/10',
            )}
          >
            <Checkbox
              checked={checked}
              disabled={ignored}
              onCheckedChange={(v) => setChecked([item.key], v === true)}
            />
            <span className="text-sm font-medium">Obtained</span>
          </label>
          <Button variant="outline" size="sm" onClick={() => setIgnored([item.key], !ignored)}>
            {ignored ? <Eye /> : <EyeOff />} {ignored ? 'Un-ignore' : 'Ignore'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => hasWorld && openDialog({ type: 'chestSearch', itemKey: item.key })}
            title={chestSearchHint(hasWorld, !!pt.world)}
            aria-disabled={!hasWorld}
            className={cn(!hasWorld && 'cursor-not-allowed opacity-50 hover:bg-transparent')}
          >
            <PackageSearch /> Find in chests
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={item.url} target="_blank" rel="noreferrer noopener">
              <ExternalLink /> Wiki
            </a>
          </Button>
        </div>
        {changed && <p className="text-xs text-muted-foreground">Last changed: {changed}</p>}
      </div>

      <div className="flex flex-col gap-5 p-4">
        {item.recipeOnly && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            The wiki has no item data for this item yet, only its recipe. Name, icon and recipe come from there,
            categories from a similar item; stats, rarity and prices are missing.
          </p>
        )}
        {item.tooltip && (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm whitespace-pre-line italic">{item.tooltip}</p>
        )}

        <Section title="What it is">
          <Chips
            values={[
              ...item.categories.map((c) => nameOf(data.categories, c)),
              ...item.subcategories.map((s) => nameOf(data.subcategories, s)),
            ]}
          />
        </Section>

        <Section title="How to get it">
          <Chips values={item.obtain.map((o) => nameOf(data.obtain, o))} empty="Unknown" />
          {item.events.length > 0 && (
            <p className="text-sm">
              <span className="text-muted-foreground">{item.eventOnly ? 'Only during ' : 'During '}</span>
              {item.events.map((e) => nameOf(data.events, e)).join(', ')}
            </p>
          )}
        </Section>

        <SoldBySection data={data} item={item} />
        <DropsSection data={data} item={item} difficulty={pt.difficulty} kind="dropped" />
        <DropsSection data={data} item={item} difficulty={pt.difficulty} kind="found" />

        <RecipeSections data={data} item={item} platform={pt.platform} checked={checkedSet} />

        <StatsSection item={item} catalogue={catalogue} tracking={tracking} />

        <Section title="Details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Item ID</dt>
            <dd className="tabular-nums">{item.id}</dd>
            {item.internalName && (
              <>
                <dt className="text-muted-foreground">Internal name</dt>
                <dd className="font-mono text-xs leading-5">{item.internalName}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Platforms</dt>
            <dd>{item.platforms.map((p) => nameOf(data.platforms, p)).join(', ')}</dd>
          </dl>
        </Section>
      </div>
    </>
  )
}

/** Vendors with the conditions of their shop rows ("In Hardmode, during night, …", moon phases). */
function SoldBySection({ data, item }: { data: GameData; item: Item }) {
  if (!item.vendors.length) return null
  const rows = data.shops.get(item.key) ?? []
  return (
    <Section title="Sold by">
      <ul className="divide-y rounded-lg border">
        {item.vendors.flatMap((v) => {
          const vendor = data.vendors.find((x) => x.id === v)
          // a vendor without shop row (only tagged in the Items table) sells it without condition
          const own = rows.filter((r) => r.vendor === v)
          return (own.length ? own : [{ vendor: v } as ShopRow]).map((r, n) => (
            <li key={`${v}-${n}`} className="flex items-center gap-3 px-3 py-2">
              <WikiIcon src={vendor?.icon} alt="" size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{vendor?.name ?? v}</div>
                {r.text && <div className="text-xs text-muted-foreground">{r.text}</div>}
              </div>
              {r.moons && (
                <span className="flex shrink-0 gap-0.5">
                  {r.moons.map((m) => {
                    const moon = data.conditions.get(`moon-${m}`)
                    return (
                      <span key={m} title={moon?.name}>
                        <WikiIcon src={moon?.icon} alt={moon?.name ?? ''} size={18} />
                      </span>
                    )
                  })}
                </span>
              )}
            </li>
          ))
        })}
      </ul>
    </Section>
  )
}

/** "Dropped by" (enemies, bosses, treasure bags) or "Found in" (chests, crates, trees, …). */
function DropsSection({
  data,
  item,
  difficulty,
  kind,
}: {
  data: GameData
  item: Item
  difficulty: Parameters<typeof dropsFor>[2]
  kind: DropKind
}) {
  const all = useMemo(
    () => (data.drops.get(item.key) ?? []).filter((d) => dropKind(data, d) === kind),
    [data, item, kind],
  )
  const available = useMemo(() => new Set(dropsFor(data, item, difficulty, kind)), [data, item, difficulty, kind])
  const bossOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of data.bosses) for (const s of b.sources) m.set(s, b.name)
    return m
  }, [data])
  if (!all.length) return null
  const hidden = all.length - available.size

  return (
    <Section title={kind === 'found' ? 'Found in' : 'Dropped by'}>
      <ul className="divide-y rounded-lg border">
        {[...available, ...all.filter((d) => !available.has(d))].map((d, i) => (
          <DropRow
            key={i}
            drop={d}
            data={data}
            boss={bossOf.get(d.source)}
            available={available.has(d)}
            difficulty={difficulty}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          Greyed out: {hidden === 1 ? 'drop' : 'drops'} not available in {DIFFICULTY_LABELS[difficulty]}.
        </p>
      )}
    </Section>
  )
}

function DropRow({
  drop,
  data,
  boss,
  available,
  difficulty,
}: {
  drop: Drop
  data: GameData
  boss?: string
  available: boolean
  difficulty: Parameters<typeof dropsFor>[2]
}) {
  const source = data.dropSources.get(drop.source)
  const modes = modeLabel(drop.modes)
  const chance = chanceFor(drop, difficulty)
  const others = otherChances(drop, difficulty)
  const quantity = quantityFor(drop, difficulty)
  const conditions = conditionNames(data, drop)
  // where / when the enemy spawns, e.g. "Forest & surface · night"
  const spawn = [
    (source?.biomes ?? []).map((b) => nameOf(data.biomes, b)).join(', '),
    (source?.times ?? []).map((t) => nameOf(data.times, t).toLowerCase()).join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className={cn('flex items-center gap-3 px-3 py-2', !available && 'opacity-45')}>
      <WikiIcon src={source?.icon} alt="" size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{source?.name ?? drop.source}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {boss && source?.name !== boss && <span>{boss}</span>}
          {spawn && <span>{spawn}</span>}
          {quantity && <span>× {quantity}</span>}
          {modes && <span>{modes}</span>}
        </div>
        {(conditions.length > 0 || drop.note) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {conditions.map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
                {c}
              </span>
            ))}
            {drop.note && !conditions.length && (
              <span className="text-[11px] text-muted-foreground italic">{drop.note}</span>
            )}
          </div>
        )}
      </div>
      <span className="flex shrink-0 flex-col items-end text-right tabular-nums" title={drop.rate}>
        <span className="text-sm font-medium">{chance !== undefined ? `${chance}%` : drop.rate}</span>
        {others && <span className="text-[11px] text-muted-foreground">{others}</span>}
      </span>
    </li>
  )
}

function StatsSection({ item, catalogue, tracking }: { item: Item; catalogue: ItemColumn[]; tracking: TrackingState }) {
  const rows = STAT_GROUPS.flatMap((group) =>
    catalogue
      .filter((c) => c.group === group)
      .flatMap((c) => {
        const v = c.value(item, tracking)
        if (v === undefined || v === '' || v === false) return []
        return [{ id: c.id, label: c.label, content: c.cell ? c.cell(item, tracking) : String(v === true ? 'Yes' : v) }]
      }),
  )
  if (!rows.length) return null
  return (
    <Section title="Stats">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-1">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="text-right tabular-nums">{r.content}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Chips({ values, empty }: { values: string[]; empty?: string }) {
  if (!values.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span key={v} className="rounded-md border bg-card px-2 py-0.5 text-xs font-medium">
          {v}
        </span>
      ))}
    </div>
  )
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}
