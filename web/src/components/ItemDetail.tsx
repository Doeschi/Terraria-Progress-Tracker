import { Fragment, useEffect, useMemo } from 'react'
import { ArrowLeft, ExternalLink, Eye, EyeOff, PackageSearch, X } from 'lucide-react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { dropKills, itemLuck, sourceKills, type KillCounts } from '@/lib/luck'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { DIFFICULTY_LABELS } from '@/lib/availability'
import { chestSearchHint } from '@/lib/world'
import {
  chanceFor,
  dropKind,
  dropsFor,
  groupNote,
  groupOf,
  groupText,
  modeLabel,
  otherChances,
  quantityFor,
  type DropKind,
} from '@/lib/drops'
import type { BestiaryEntry, Drop, GameData, Item, ShopRow } from '@/lib/types'
import { conditionNames } from '@/lib/conditions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DifficultyIcon, RarityIcon, TooltipText, WikiIcon } from './common'
import { ResizablePane } from './ResizablePane'
import { DETAIL_WIDTH } from '@/lib/panes'
import { CollapsibleSection, RecipeSections } from './RecipeSections'
import { cardRow } from '@/lib/cardRow'
import { Badge, CardLink, Chips, Section, type TitleComponent } from './DetailParts'
import { ContainsSection, NpcCard, SourceCard } from './NpcDetail'
import { ExtractinatorSection } from './ExtractinatorSection'
import { SetSection } from './SetSection'
import { shownObtain } from '@/lib/filtering'
import { NPC_REF, refName, SOURCE_REF, sourceRef, vendorRef } from '@/lib/npcs'
import { formatDate, nameOf } from '@/lib/format'
import { type ColumnGroup, type ItemColumn, type TrackingState } from './table/columns'
import { useItemColumns } from './table/useColumns'
import { LuckCell } from './table/cells'
import { usePrefs } from '@/lib/prefs'
import { useSwipeClose } from '@/hooks/useSwipeClose'
import { DETAIL_SECTIONS, ordered } from '@/lib/layout'

// Everything known about one item, selected in the item table. On wide screens
// it is docked right of the table (the table stays usable, clicking another row
// switches the item); on narrow screens it slides in as an overlay.

// stats shown in the "Stats" section, in this order
const STAT_GROUPS: ColumnGroup[] = ['Combat', 'Tools', 'Use & placement', 'Economy']

/** What the detail panel shows: an item, an NPC (bestiary entry) or a drop source (ND1). */
type DetailCard =
  | { kind: 'item'; key: string; item: Item }
  | { kind: 'npc'; key: string; entry: BestiaryEntry }
  | { kind: 'source'; key: string; sourceId: string }

function useDetailCard(): DetailCard | undefined {
  const ref = useUi((s) => s.detailKey)
  const data = useStore((s) => s.data)
  return useMemo(() => {
    if (!ref || !data) return undefined
    if (ref.startsWith(NPC_REF)) {
      const entry = data.bestiary.entries.find((e) => e.id === ref.slice(NPC_REF.length))
      return entry ? { kind: 'npc', key: ref, entry } : undefined
    }
    if (ref.startsWith(SOURCE_REF)) {
      const sourceId = ref.slice(SOURCE_REF.length)
      return data.dropSources.has(sourceId) ? { kind: 'source', key: ref, sourceId } : undefined
    }
    const item = data.itemsByKey.get(ref)
    return item ? { kind: 'item', key: ref, item } : undefined
  }, [ref, data])
}

function CardContent({ card, Title }: { card: DetailCard; Title: TitleComponent }) {
  if (card.kind === 'npc') return <NpcCard entry={card.entry} Title={Title} />
  if (card.kind === 'source') return <SourceCard sourceId={card.sourceId} Title={Title} />
  return <DetailContent item={card.item} Title={Title} />
}

/** Docked panel next to the table (wide screens). */

/** Button labels of the detail panel, hidden when the button row is too narrow for them (one line,
 * no wrapping): first the labels of Ignore / Find in chests / Wiki, "Obtained" last. */
const LABEL = 'hidden @[430px]/actions:inline'
const OBTAINED_LABEL = 'hidden @[250px]/actions:inline'

export function ItemDetailPanel() {
  const card = useDetailCard()
  const closeDetail = useUi((s) => s.closeDetail)
  if (!card) return null
  return (
    <ResizablePane
      widthKey="detailWidth"
      limits={DETAIL_WIDTH}
      edge="left"
      label="details"
      innerClassName="relative overflow-y-auto border-l bg-card"
      aria-label="Details"
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
      <BackButton />
      <CardContent key={card.key} card={card} Title={PanelTitle} />
    </ResizablePane>
  )
}

/** Slide-in overlay (narrow screens). */
export function ItemDetailSheet() {
  const card = useDetailCard()
  const closeDetail = useUi((s) => s.closeDetail)
  // touch: a swipe from left to right goes back to the previous item; on the first one it closes
  const swipe = useSwipeClose(closeDetail, () => {
    const { detailHistory, detailBack } = useUi.getState()
    if (!detailHistory.length) return false
    detailBack()
    return true
  })
  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && closeDetail()}>
      {/* phones: the whole screen (MO4); the side variant's 3/4 width needs the same prefix to be overridden */}
      <SheetContent
        className="touch-pan-y touch-pinch-zoom gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        {...swipe}
      >
        {card && (
          <>
            <BackButton />
            <CardContent key={card.key} card={card} Title={SheetTitleText} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// the sheet needs Radix' accessible title/description; the docked panel plain elements
const SheetTitleText: TitleComponent = ({ children }) => (
  <>
    <SheetTitle className="text-lg leading-tight">{children}</SheetTitle>
    <SheetDescription className="sr-only">Details</SheetDescription>
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

/** Back to the previous card (item, NPC, source); sits left of the close button. */
function BackButton() {
  const previous = useUi((s) => s.detailHistory[s.detailHistory.length - 1])
  const previousName = useStore((s) => (previous && s.data ? refName(s.data, previous) : undefined))
  const detailBack = useUi((s) => s.detailBack)
  useMouseBack()
  if (!previous) return null
  const label = `Back to ${previousName ?? 'the previous card'}`
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
  const tracking: TrackingState = {
    changedAt: pt.changedAt,
    difficulty: pt.difficulty,
    luck: null,
    done: () => false,
    owned: null,
  }
  // kills per drop source in the loaded world (expected drops)
  const bestiary = useActiveWorld()?.bestiary
  const kills = useMemo(() => (bestiary ? sourceKills(data, bestiary) : null), [data, bestiary])
  const changed = formatDate(pt.changedAt[item.key])
  const detailOrder = usePrefs((s) => s.layout.detailOrder)
  const hiddenDetail = usePrefs((s) => s.layout.hiddenDetail)

  // the sections in the order and selection of the settings (Layout.detailOrder / hiddenDetail)
  const sections: Record<string, React.ReactNode> = {
    tooltip: item.tooltip && (
      <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm whitespace-pre-line italic">
        <TooltipText text={item.tooltip} />
      </p>
    ),
    what: (
      <Section title="What it is">
        <Chips
          values={[
            ...item.categories.map((c) => nameOf(data.categories, c)),
            ...item.subcategories.map((s) => nameOf(data.subcategories, s)),
          ]}
        />
      </Section>
    ),
    how: (
      <Section title="How to get it">
        <Chips values={shownObtain(data, item.obtain).map((o) => nameOf(data.obtain, o))} empty="Unknown" />
        {item.milestone && <MilestoneLine data={data} item={item} />}
        {item.events.length > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">{item.eventOnly ? 'Only during ' : 'During '}</span>
            {item.events.map((e) => nameOf(data.events, e)).join(', ')}
          </p>
        )}
      </Section>
    ),
    set: <SetSection data={data} item={item} checked={checkedSet} />,
    soldBy: <SoldBySection data={data} item={item} />,
    dropped: (
      <DropsSection
        data={data}
        item={item}
        difficulty={pt.difficulty}
        kind="dropped"
        kills={kills}
        owned={checked || ignored}
      />
    ),
    found: <DropsSection data={data} item={item} difficulty={pt.difficulty} kind="found" />,
    contains: <ContainsSection data={data} itemKey={item.key} />,
    extractinator: <ExtractinatorSection data={data} item={item} checked={checkedSet} />,
    recipes: <RecipeSections data={data} item={item} platform={pt.platform} checked={checkedSet} />,
    stats: <StatsSection item={item} catalogue={catalogue} tracking={tracking} />,
    details: (
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
    ),
  }
  const sectionIds = ordered(
    DETAIL_SECTIONS.map((d) => d.id),
    detailOrder,
  ).filter((id) => !hiddenDetail.includes(id))

  return (
    <>
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
        {/* one line: in a narrow panel the buttons show only their icon (the label on hover) */}
        <div className="@container/actions">
          <div className="flex items-center gap-2">
            <label
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5',
                checked && 'border-primary/50 bg-primary/10',
              )}
              title="Obtained"
            >
              <Checkbox
                checked={checked}
                disabled={ignored}
                onCheckedChange={(v) => setChecked([item.key], v === true)}
                aria-label="Obtained"
              />
              <span className={cn('text-sm font-medium', OBTAINED_LABEL)}>Obtained</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIgnored([item.key], !ignored)}
              title={ignored ? 'Un-ignore' : 'Ignore'}
              aria-label={ignored ? 'Un-ignore' : 'Ignore'}
            >
              {ignored ? <Eye /> : <EyeOff />} <span className={LABEL}>{ignored ? 'Un-ignore' : 'Ignore'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => hasWorld && openDialog({ type: 'chestSearch', itemKey: item.key })}
              title={chestSearchHint(hasWorld, !!pt.world)}
              aria-label="Find in chests"
              aria-disabled={!hasWorld}
              className={cn(!hasWorld && 'cursor-not-allowed opacity-50 hover:bg-transparent')}
            >
              <PackageSearch /> <span className={LABEL}>Find in chests</span>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={item.url} target="_blank" rel="noreferrer noopener" title="Open on the wiki" aria-label="Wiki">
                <ExternalLink /> <span className={LABEL}>Wiki</span>
              </a>
            </Button>
          </div>
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
        {sectionIds.map((id) => (
          <Fragment key={id}>{sections[id]}</Fragment>
        ))}
      </div>
    </>
  )
}

/** "Available after: Plantera (Crafted – needs Chlorophyte Ore)" (earliest milestone and why). */
function MilestoneLine({ data, item }: { data: GameData; item: Item }) {
  const milestone = data.milestones.find((m) => m.id === item.milestone)
  if (!milestone) return null
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className="text-muted-foreground">Available after</span>
      <WikiIcon src={milestone.icon} alt="" size={18} />
      <span className="font-medium">{milestone.name}</span>
      {item.milestoneVia && <span className="text-xs text-muted-foreground">({item.milestoneVia})</span>}
    </p>
  )
}

/** Vendors with the conditions of their shop rows ("In Hardmode, during night, …", moon phases). */
function SoldBySection({ data, item }: { data: GameData; item: Item }) {
  const openDetail = useUi((s) => s.openDetail)
  const rows = data.shops.get(item.key) ?? []
  // the item's vendors plus those of shop rows only in special seeds (they count for no filter, CO6)
  const vendors = [...new Set([...item.vendors, ...rows.map((r) => r.vendor)])]
  if (!vendors.length) return null
  return (
    <Section title="Sold by">
      <ul className="divide-y rounded-lg border">
        {vendors.flatMap((v) => {
          const vendor = data.vendors.find((x) => x.id === v)
          const ref = vendorRef(data, v)
          // a vendor without shop row (only tagged in the Items table) sells it without condition
          const own = rows.filter((r) => r.vendor === v)
          const row = cardRow(ref ? () => openDetail(ref) : undefined)
          return (own.length ? own : [{ vendor: v } as ShopRow]).map((r, n) => (
            <li key={`${v}-${n}`} {...row} className={cn('flex items-center gap-3 px-3 py-2', row.className)}>
              <WikiIcon src={vendor?.icon} alt="" size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {ref ? (
                    <CardLink onOpen={() => openDetail(ref)} title={`Open ${vendor?.name ?? v}`}>
                      {vendor?.name ?? v}
                    </CardLink>
                  ) : (
                    (vendor?.name ?? v)
                  )}
                </div>
                {r.text && <div className="text-xs text-muted-foreground">{r.text}</div>}
              </div>
              {r.moons && (
                <span className="flex shrink-0 gap-0.5">
                  {r.moons.map((m) => {
                    const moon = data.conditions.get(`moon-${m}`)
                    return (
                      <span key={m} title={moon?.name}>
                        <WikiIcon src={moon?.icon} alt={moon?.name ?? ''} size={28} />
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
  kills = null,
  owned = false,
}: {
  data: GameData
  item: Item
  difficulty: Parameters<typeof dropsFor>[2]
  kind: DropKind
  /** kills per source in the loaded world */
  kills?: KillCounts | null
  /** checked or ignored: no bad-luck highlight */
  owned?: boolean
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
  const luck = useMemo(
    () => (kills ? itemLuck(data, item, difficulty, kills) : undefined),
    [data, item, difficulty, kills],
  )
  if (!all.length) return null
  const hidden = all.length - available.size

  return (
    <CollapsibleSection id={kind} title={kind === 'found' ? 'Found in' : 'Dropped by'} count={all.length}>
      <ul className="divide-y rounded-lg border">
        {[...available, ...all.filter((d) => !available.has(d))].map((d, i) => (
          <DropRow
            key={i}
            drop={d}
            data={data}
            boss={bossOf.get(d.source)}
            available={available.has(d)}
            difficulty={difficulty}
            kills={kills ? dropKills(kills, d) : undefined}
          />
        ))}
      </ul>
      {luck && (
        <p className="text-xs text-muted-foreground">
          Expected drops by now in this world: <LuckCell data={data} luck={luck} missing={!owned} />
        </p>
      )}
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          Greyed out: {hidden === 1 ? 'drop' : 'drops'} not available in {DIFFICULTY_LABELS[difficulty]}.
        </p>
      )}
    </CollapsibleSection>
  )
}

function DropRow({
  drop,
  data,
  boss,
  available,
  difficulty,
  kills,
}: {
  drop: Drop
  data: GameData
  boss?: string
  available: boolean
  difficulty: Parameters<typeof dropsFor>[2]
  /** kills of the source in the loaded world */
  kills?: number
}) {
  const openDetail = useUi((s) => s.openDetail)
  const source = data.dropSources.get(drop.source)
  const modes = modeLabel(drop.modes)
  const chance = chanceFor(drop, difficulty)
  const others = otherChances(drop, difficulty)
  const quantity = quantityFor(drop, difficulty)
  const conditions = conditionNames(data, drop)
  const groupId = groupOf(drop, difficulty)
  const group = groupId ? data.dropGroups.get(groupId) : undefined
  // where / when the enemy spawns, e.g. "Forest & surface · night"
  const spawn = [
    (source?.biomes ?? []).map((b) => nameOf(data.biomes, b)).join(', '),
    (source?.times ?? []).map((t) => nameOf(data.times, t).toLowerCase()).join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
  const row = cardRow(() => openDetail(sourceRef(data, drop.source)))
  return (
    <li {...row} className={cn('flex items-center gap-3 px-3 py-2', row.className, !available && 'opacity-45')}>
      <WikiIcon src={source?.icon} alt="" size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1 text-sm font-medium">
          <CardLink
            onOpen={() => openDetail(sourceRef(data, drop.source))}
            title={`Open ${source?.name ?? drop.source}`}
          >
            {source?.name ?? drop.source}
          </CardLink>
          {source?.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              title={`${source.name} on the wiki`}
              aria-label={`${source.name} on the wiki`}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:opacity-100"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {boss && source?.name !== boss && <span>{boss}</span>}
          {drop.variants && <span>{drop.variants.join(', ')}</span>}
          {spawn && <span>{spawn}</span>}
          {quantity && <span>× {quantity}</span>}
          {modes && <span>{modes}</span>}
          {group && (
            <span className="rounded bg-primary/10 px-1.5 text-[11px] text-foreground/80" title={groupText(group)}>
              {groupNote(group)}
            </span>
          )}
          {kills !== undefined && (
            <span className="text-foreground/80">
              {kills.toLocaleString('en')} {kills === 1 ? 'kill' : 'kills'} in this world
            </span>
          )}
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
