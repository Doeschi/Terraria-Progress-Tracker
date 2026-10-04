import { useMemo } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { DIFFICULTY_LABELS } from '@/lib/availability'
import { conditionNames } from '@/lib/conditions'
import { chanceFor, groupOf, groupText, inDifficulty, modeLabel, quantityFor } from '@/lib/drops'
import { nameOf } from '@/lib/format'
import { averageQuantity, dropKills, formatExpected, sourceKills, type KillCounts } from '@/lib/luck'
import { NPC_REF, SOURCE_REF, npcIndex, type SourceDrop } from '@/lib/npcs'
import type { BestiaryEntry, Difficulty, DropGroup, GameData, ShopRow } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ObtainedMark, WikiIcon } from './common'
import { CollapsibleSection } from './RecipeSections'
import { IntroSection } from './IntroSection'
import { ShowItemsButton } from './ShowItemsButton'
import { cardRow } from '@/lib/cardRow'
import { Badge, CardLink, Section, type TitleComponent } from './DetailParts'

// The NPC card (a bestiary entry: what it drops and sells) and the source card (a drop source
// without bestiary entry and item, e.g. a tree) of the detail panel - REQUIREMENTS ND.

/** A bestiary entry: header, where and when, drops, its treasure bag, its shop, variants. */
export function NpcCard({ entry, Title }: { entry: BestiaryEntry; Title: TitleComponent }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const setBestiary = useStore((s) => s.setBestiary)
  const openDetail = useUi((s) => s.openDetail)
  const world = useActiveWorld()
  const kills = useKills()
  const index = npcIndex(data)
  const checked = useChecked()
  const unlocked = pt.bestiary.includes(entry.id)
  const typeName = data.bestiary.types.find((t) => t.id === entry.type)?.name ?? entry.type
  const where = [
    entry.biomes.map((b) => nameOf(data.biomes, b)).join(', '),
    entry.times.map((t) => nameOf(data.times, t).toLowerCase()).join(', '),
    entry.events.map((e) => nameOf(data.events, e)).join(', '),
  ].filter(Boolean)
  const worldKills = world?.bestiary?.kills[entry.id]
  const sources = index.sourcesOfEntry.get(entry.id) ?? []
  const drops = index.dropsOfEntry.get(entry.id) ?? []
  const bag = index.bagOfEntry.get(entry.id)
  const bagItem = bag ? index.itemOfSource.get(bag) : undefined
  const vendor = index.vendorOfEntry.get(entry.id)
  const stock = vendor ? (index.stock.get(vendor) ?? []) : []
  const variants = index.variants.get(entry.id) ?? []

  return (
    <>
      <div className="flex flex-col gap-3 border-b p-4 pr-20">
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border bg-muted/40">
            <WikiIcon src={entry.icon} alt="" size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <Title>{entry.name}</Title>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge className="bg-muted text-muted-foreground">{typeName}</Badge>
              <Badge className="bg-muted text-muted-foreground">#{entry.n}</Badge>
              {entry.stars ? (
                <span className="inline-flex text-amber-500" title={`${entry.stars} of 5 stars`}>
                  {Array.from({ length: entry.stars }, (_, i) => (
                    <Star key={i} className="size-3 fill-current" />
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5',
              unlocked && 'border-primary/50 bg-primary/10',
            )}
          >
            <Checkbox checked={unlocked} onCheckedChange={(v) => setBestiary([entry.id], v === true)} />
            <span className="text-sm font-medium">Unlocked</span>
          </label>
          <Button variant="outline" size="sm" asChild>
            <a href={entry.url} target="_blank" rel="noreferrer noopener" title="Open on the wiki">
              <ExternalLink /> Wiki
            </a>
          </Button>
          <ShowItemsButton id={NPC_REF + entry.id} />
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4">
        <IntroSection page={entry.page} name={entry.name} url={entry.url} />
        {(where.length > 0 || worldKills !== undefined) && (
          <Section title="Where and when">
            {where.length > 0 && <p className="text-sm">{where.join(' · ')}</p>}
            {worldKills !== undefined && world && (
              <p className="text-sm text-muted-foreground">
                {worldKills.toLocaleString('en')} {worldKills === 1 ? 'kill' : 'kills'} in <em>{world.name}</em>
              </p>
            )}
          </Section>
        )}
        {drops.length > 0 && (
          <Section title="Drops">
            <VariantLists
              data={data}
              drops={drops}
              difficulty={pt.difficulty}
              checked={checked}
              kills={kills}
              showSource={sources.length > 1}
            />
          </Section>
        )}
        {bag && (
          <Section
            title={
              bagItem ? (
                <CardLink onOpen={() => openDetail(bagItem)} title="Open the treasure bag" className="uppercase">
                  From the {data.dropSources.get(bag)?.name ?? 'treasure bag'}
                </CardLink>
              ) : (
                `From the ${data.dropSources.get(bag)?.name ?? 'treasure bag'}`
              )
            }
          >
            <DropList
              data={data}
              drops={index.dropsOfSource.get(bag) ?? []}
              difficulty={pt.difficulty}
              checked={checked}
            />
          </Section>
        )}
        {stock.length > 0 && (
          <CollapsibleSection id="sells" title="Sells" count={stock.length}>
            <StockList data={data} stock={stock} checked={checked} />
          </CollapsibleSection>
        )}
        {variants.length > 0 && (
          <Section title="Variants">
            <div className="flex flex-wrap gap-1.5">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => openDetail(NPC_REF + v.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-xs font-medium hover:bg-muted"
                >
                  <WikiIcon src={v.icon} alt="" size={18} />
                  {v.name}
                </button>
              ))}
            </div>
          </Section>
        )}
        {!drops.length && !bag && !stock.length && (
          <p className="text-sm text-muted-foreground">It drops and sells nothing.</p>
        )}
      </div>
    </>
  )
}

/** A drop source with neither a bestiary entry nor an item (trees, boss parts): its drops. */
export function SourceCard({ sourceId, Title }: { sourceId: string; Title: TitleComponent }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const checked = useChecked()
  const kills = useKills()
  const source = data.dropSources.get(sourceId)
  if (!source) return null
  const kind = source.kind === 'container' ? 'Container' : source.kind === 'bag' ? 'Treasure bag' : 'Enemy'
  return (
    <>
      <div className="flex flex-col gap-3 border-b p-4 pr-20">
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border bg-muted/40">
            <WikiIcon src={source.icon} alt="" size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <Title>{source.name}</Title>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge className="bg-muted text-muted-foreground">{kind}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {source.url && (
            <Button variant="outline" size="sm" asChild>
              <a href={source.url} target="_blank" rel="noreferrer noopener" title="Open on the wiki">
                <ExternalLink /> Wiki
              </a>
            </Button>
          )}
          <ShowItemsButton id={SOURCE_REF + sourceId} />
        </div>
      </div>
      <div className="flex flex-col gap-5 p-4">
        <Section title={source.kind === 'container' ? 'Contains' : 'Drops'}>
          <VariantLists
            data={data}
            drops={npcIndex(data).dropsOfSource.get(sourceId) ?? []}
            difficulty={pt.difficulty}
            checked={checked}
            kills={kills}
          />
        </Section>
      </div>
    </>
  )
}

/** Item card (ND3): the drops of an item that is a drop source (treasure bag, crate, chest). */
export function ContainsSection({ data, itemKey }: { data: GameData; itemKey: string }) {
  const pt = useActivePlaythrough()!
  const checked = useChecked()
  const index = npcIndex(data)
  const sources = index.sourcesOfItem.get(itemKey) ?? []
  const lists = sources.map((s) => [s, index.dropsOfSource.get(s) ?? []] as const).filter(([, drops]) => drops.length)
  if (!lists.length) return null
  return (
    <Section title="Contains">
      {/* several places of the item (Gold Chest: in the caverns, the Dungeon, a Pyramid): one
        block each */}
      {lists.map(([source, drops]) => (
        <div key={source} className="flex flex-col gap-1.5">
          {lists.length > 1 && <h4 className="text-sm font-medium">{data.dropSources.get(source)?.name}</h4>}
          <VariantLists
            data={data}
            drops={drops}
            difficulty={pt.difficulty}
            checked={checked}
            nested={lists.length > 1}
          />
        </div>
      ))}
    </Section>
  )
}

/** Drops in one list per variant (Pre-Hardmode / Hardmode Mimic, Dark / Light Lamia) or layer
 * (Gold Chest: Underground, Cavern), so the chances of each add up. */
function VariantLists({
  nested = false,
  ...props
}: Omit<Parameters<typeof DropList>[0], 'drops'> & { drops: SourceDrop[]; nested?: boolean }) {
  return byVariant(props.data, props.drops).map(([variant, list]) => (
    <div key={variant} className={cn('flex flex-col gap-1.5', nested && variant !== null && 'pl-2')}>
      {variant !== null && <h4 className="text-xs font-medium text-muted-foreground">{variant}</h4>}
      <DropList {...props} drops={list} />
    </div>
  ))
}

/** Drops grouped by the variants they are for (a drop of several variants is in each of their
 * lists); one group without heading (null) when there are no different variants. Drops of every
 * variant come last ("All variants", in containers "In every layer"); a Pre-Hardmode variant before
 * the others, layers in their order (Underground, Cavern, …). */
function byVariant(data: GameData, drops: SourceDrop[]): [string | null, SourceDrop[]][] {
  const groups = new Map<string, SourceDrop[]>()
  const add = (key: string, d: SourceDrop) => {
    const list = groups.get(key)
    if (list) list.push(d)
    else groups.set(key, [d])
  }
  for (const d of drops) for (const v of d.drop.variants ?? ['']) add(v, d)
  if (groups.size < 2) return [[null, drops]]
  const areas = data.dropAreas
  const rank = (v: string) => (v.startsWith('Pre-Hardmode') ? -1 : areas.includes(v) ? areas.indexOf(v) : areas.length)
  const named = [...groups].filter(([k]) => k).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
  const all = groups.get('')
  const container = data.dropSources.get(drops[0]?.drop.source)?.kind === 'container'
  return [...named, ...(all ? [[container ? 'In every layer' : 'All variants', all] as [string, SourceDrop[]]] : [])]
}

function useChecked(): Set<string> {
  const list = useActivePlaythrough()?.checked
  return useMemo(() => new Set(list), [list])
}

function useKills(): KillCounts | null {
  const data = useStore((s) => s.data)!
  const bestiary = useActiveWorld()?.bestiary
  return useMemo(() => (bestiary ? sourceKills(data, bestiary) : null), [data, bestiary])
}

/** Items dropped (by one or more sources), highest chance first; each opens its item card. Items of
 * a drop group ("one of the following 8 items") are framed together (B5). */
function DropList({
  data,
  drops,
  difficulty,
  checked,
  kills = null,
  showSource = false,
}: {
  data: GameData
  drops: SourceDrop[]
  difficulty: Difficulty
  checked: Set<string>
  /** kills in the loaded world: expected drops */
  kills?: KillCounts | null
  /** several sources (a boss and its parts, the chests of an item): name the source of each row */
  showSource?: boolean
}) {
  // drops of this difficulty first (highest chance first), the others greyed out below
  const byChance = (a: SourceDrop, b: SourceDrop) =>
    (chanceFor(b.drop, difficulty) ?? -1) - (chanceFor(a.drop, difficulty) ?? -1) ||
    a.item.name.localeCompare(b.item.name)
  const available = drops.filter((d) => inDifficulty(d.drop, difficulty)).sort(byChance)
  const other = drops.filter((d) => !inDifficulty(d.drop, difficulty)).sort(byChance)
  const hidden = other.length
  const row = (d: SourceDrop, dimmed: boolean, n: number) => (
    <DropRow
      key={`${d.item.key}-${d.drop.source}-${n}`}
      data={data}
      entry={d}
      difficulty={difficulty}
      own={checked.has(d.item.key)}
      kills={kills}
      showSource={showSource}
      dimmed={dimmed}
    />
  )
  const blocks = (list: SourceDrop[], dimmed: boolean) =>
    withGroups(data, list, difficulty).map((b, n) =>
      'group' in b ? (
        <li key={`${b.key}-${n}`} className={cn('p-1.5', dimmed && 'opacity-45')}>
          <div className="rounded-md border border-primary/30 bg-primary/[0.03]">
            <div className="flex items-baseline gap-2 border-b border-primary/20 px-2.5 py-1 text-xs">
              <span className="min-w-0 flex-1 font-medium text-foreground/90">{groupText(b.group)}</span>
              <span
                className="shrink-0 tabular-nums text-muted-foreground"
                title="Items of this group you have obtained"
              >
                {b.rows.filter((d) => checked.has(d.item.key)).length} / {b.rows.length}
              </span>
            </div>
            <ul className="divide-y">{b.rows.map((d, i) => row(d, false, i))}</ul>
          </div>
        </li>
      ) : (
        row(b, dimmed, n)
      ),
    )
  return (
    <>
      <ul className="divide-y rounded-lg border">
        {blocks(available, false)}
        {blocks(other, true)}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          Greyed out: {hidden === 1 ? 'drop' : 'drops'} not available in {DIFFICULTY_LABELS[difficulty]}.
        </p>
      )}
    </>
  )
}

type GroupBlock = { key: string; group: DropGroup; rows: SourceDrop[] }

/** The rows of each drop group (of the same source) together: first all rows without a group (in
 * their order), then the groups (in the order of their first row); a group with a single row here
 * stays a plain row. */
function withGroups(data: GameData, rows: SourceDrop[], difficulty: Difficulty): (SourceDrop | GroupBlock)[] {
  const blocks = new Map<string, GroupBlock>()
  const out: (SourceDrop | GroupBlock)[] = []
  for (const d of rows) {
    const id = groupOf(d.drop, difficulty)
    const group = id ? data.dropGroups.get(id) : undefined
    if (!group) {
      out.push(d)
      continue
    }
    const key = `${id}@${d.drop.source}`
    const block = blocks.get(key)
    if (block) block.rows.push(d)
    else {
      const b = { key, group, rows: [d] }
      blocks.set(key, b)
      out.push(b)
    }
  }
  const flat = out.flatMap((b) => ('group' in b && b.rows.length < 2 ? b.rows : [b]))
  return [...flat.filter((b) => !('group' in b)), ...flat.filter((b) => 'group' in b)]
}

function DropRow({
  data,
  entry: { item, drop },
  difficulty,
  own,
  kills,
  showSource,
  dimmed,
}: {
  data: GameData
  entry: SourceDrop
  difficulty: Difficulty
  own: boolean
  kills: KillCounts | null
  showSource: boolean
  dimmed: boolean
}) {
  const openDetail = useUi((s) => s.openDetail)
  const chance = chanceFor(drop, difficulty)
  const quantity = quantityFor(drop, difficulty)
  const modes = modeLabel(drop.modes)
  // in a layer's list (Gold Chest: Underground) the layer's biome is no news
  const inLayer = drop.variants?.some((v) => data.dropAreas.includes(v))
  const conditions = conditionNames(data, inLayer ? { ...drop, biomes: undefined } : drop)
  const k = kills ? dropKills(kills, drop) : undefined
  const expected = k !== undefined && chance !== undefined ? k * (chance / 100) * averageQuantity(quantity) : undefined
  const row = cardRow(() => openDetail(item.key))
  return (
    <li {...row} className={cn('flex items-center gap-3 px-3 py-1.5', row.className, dimmed && 'opacity-45')}>
      <WikiIcon src={item.icon} alt="" size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <CardLink onOpen={() => openDetail(item.key)} className={cn(own && 'text-muted-foreground')}>
            {item.name}
          </CardLink>
          {own && <ObtainedMark />}
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {showSource && <span>{data.dropSources.get(drop.source)?.name}</span>}
          {quantity && <span>× {quantity}</span>}
          {modes && <span>{modes}</span>}
          {expected !== undefined && (
            <span className="text-foreground/80">{formatExpected(expected)} expected drops</span>
          )}
        </div>
        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {conditions.map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-right text-sm font-medium tabular-nums" title={drop.rate}>
        {chance !== undefined ? `${chance}%` : drop.rate}
      </span>
    </li>
  )
}

/** A vendor's shop: each item with the condition of its rows (moon phases as icons). */
function StockList({
  data,
  stock,
  checked,
}: {
  data: GameData
  stock: { item: { key: string; name: string; icon?: string }; rows: ShopRow[] }[]
  checked: Set<string>
}) {
  const openDetail = useUi((s) => s.openDetail)
  const rows = [...stock].sort((a, b) => a.item.name.localeCompare(b.item.name))
  const rowOf = (key: string) => cardRow(() => openDetail(key))
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map(({ item, rows: shopRows }) => {
        const own = checked.has(item.key)
        const text = shopRows.map((r) => r.text).filter(Boolean)
        const moons = [...new Set(shopRows.flatMap((r) => r.moons ?? []))]
        return (
          <li
            key={item.key}
            {...rowOf(item.key)}
            className={cn('flex items-center gap-3 px-3 py-1.5', rowOf(item.key).className)}
          >
            <WikiIcon src={item.icon} alt="" size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <CardLink onOpen={() => openDetail(item.key)} className={cn(own && 'text-muted-foreground')}>
                  {item.name}
                </CardLink>
                {own && <ObtainedMark />}
              </div>
              {text.length > 0 && <div className="text-xs text-muted-foreground">{text.join(' · ')}</div>}
            </div>
            {moons.length > 0 && (
              <span className="flex shrink-0 gap-0.5">
                {moons.map((m) => {
                  const moon = data.conditions.get(`moon-${m}`)
                  return (
                    <span key={m} title={moon?.name}>
                      <WikiIcon src={moon?.icon} alt={moon?.name ?? ''} size={22} />
                    </span>
                  )
                })}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
