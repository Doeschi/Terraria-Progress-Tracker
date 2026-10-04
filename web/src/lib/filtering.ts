import Fuse from 'fuse.js'
import type { GameData, GroupEntry, Item } from './types'
import { CRAFT_CHESTS, CRAFT_HAS_RECIPE, CRAFT_OBTAINED } from './recipes'
import { AVAILABLE_NOW } from './worldProgress'
import { sourceCandidates } from './sources'

// Filters are organised in groups. Entries within a group are combined with
// OR, groups with AND. Counts per entry are "faceted": an entry's numbers
// respect the search and the selections of all *other* groups.

// also the order of the filter groups in the sidebar and in the active-filter bar
export const GROUP_KEYS = [
  // right below "Almost done" (FL18)
  'source',
  'progression',
  'category',
  'obtain',
  'crafting',
  'vendor',
  'container',
  'boss',
  'event',
  'biome',
  'condition',
  'rarity',
  'version',
] as const
export type GroupKey = (typeof GROUP_KEYS)[number]

export type Selection = Record<GroupKey, string[]>
export const emptySelection = (): Selection => ({
  progression: [],
  boss: [],
  version: [],
  rarity: [],
  category: [],
  obtain: [],
  crafting: [],
  vendor: [],
  container: [],
  source: [],
  event: [],
  biome: [],
  condition: [],
})

export type ViewMode = 'all' | 'missing' | 'obtained' | 'ignored'

export interface FilterEntry extends GroupEntry {
  /** nested entries, e.g. subcategories of a category or bosses of a stage */
  children?: FilterEntry[]
}

export interface FilterGroup<K extends string = GroupKey> {
  key: K
  label: string
  entries: FilterEntry[]
  /** show nested entries without expanding them first */
  expanded?: boolean
}

/** An item's obtain methods to show (chips, table): a parent without its sub-options, which say
 * more ("Extractinators" + "Chlorophyte Extractinator" -> only the latter). */
export function shownObtain(data: GameData, ids: string[]): string[] {
  const parents = new Set(ids.map((id) => data.obtain.find((o) => o.id === id)?.parent).filter(Boolean))
  return ids.filter((id) => !parents.has(id))
}

/** child entry id -> parent entry id, per group (a parent and its children are never selected together) */
export function parentMap(groups: FilterGroup[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const g of groups)
    for (const e of g.entries) for (const c of e.children ?? []) map.set(`${g.key}/${c.id}`, `${g.key}/${e.id}`)
  return map
}

export const UNKNOWN_VERSION = 'unknown'
export const UNKNOWN_RARITY = 'none'

// in-game order: gray, white … purple, then the special rarities
const RARITY_ORDER = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -11, -12, -13]

// "Crafting" entries; icon = item whose icon is shown
const CRAFTING: { id: string; name: string; iconItem: string }[] = [
  { id: CRAFT_HAS_RECIPE, name: 'Has a recipe', iconItem: 'Work Bench' },
  { id: CRAFT_OBTAINED, name: 'Craftable with obtained items', iconItem: 'Iron Anvil' },
  { id: CRAFT_CHESTS, name: 'Craftable from your chests', iconItem: 'Chest' },
]

/** Entry ids of nested groups are prefixed: "cat:" / "sub:", "stage:" / "boss:", "cgroup:" / "cont:"
 * and "cond-group:" / "cond:". */
export function buildFilterGroups(data: GameData): FilterGroup[] {
  const categories: FilterEntry[] = data.categories.map((c) => ({
    ...c,
    id: `cat:${c.id}`,
    children: data.subcategories.filter((s) => s.parent === c.id).map((s) => ({ ...s, id: `sub:${s.id}` })),
  }))
  const bossStages: FilterEntry[] = data.bossStages.map((st) => {
    const bosses = data.bosses.filter((b) => b.stage === st.id)
    return {
      id: `stage:${st.id}`,
      name: st.name,
      icon: st.icon,
      count: bosses.reduce((n, b) => n + b.count, 0),
      children: bosses.map((b) => ({ id: `boss:${b.id}`, name: b.name, icon: b.icon, count: b.count })),
    }
  })
  // items per container (all game modes; the facets count per difficulty)
  const perSource = new Map<string, number>()
  for (const drops of data.drops.values())
    for (const s of new Set(drops.map((d) => d.source))) perSource.set(s, (perSource.get(s) ?? 0) + 1)
  const containers: FilterEntry[] = data.containerGroups.map((g) => ({
    id: `cgroup:${g.id}`,
    name: g.name,
    icon: g.icon,
    count: g.count,
    children: g.sources.map((s) => {
      const source = data.dropSources.get(s)
      return { id: `cont:${s}`, name: source?.name ?? s, icon: source?.icon, count: perSource.get(s) ?? 0 }
    }),
  }))
  // filterable conditions by group: Time of day, Moon phase, After a boss, Weather
  const all = [...data.conditions.values()]
  const conditions: FilterEntry[] = data.conditionGroups
    .filter((g) => g.filter)
    .map((g) => {
      const children = all
        .filter((c) => c.group === g.id && c.count > 0)
        .map((c) => ({ id: `cond:${c.id}`, name: c.name, icon: c.icon, count: c.count }))
      return {
        id: `cond-group:${g.id}`,
        name: g.name,
        icon: children[0]?.icon,
        count: children.reduce((n, c) => n + c.count, 0),
        children,
      }
    })
    .filter((g) => g.children.length > 0)
  const groups: FilterGroup[] = [
    {
      key: 'progression',
      label: 'Progression',
      // "Available now" (MS7): only has items while a world is loaded
      entries: [
        {
          id: AVAILABLE_NOW,
          name: 'Available now',
          icon: data.items.find((i) => i.name === 'Gold Watch')?.icon,
          count: 0,
        },
        ...data.milestones,
      ],
    },
    { key: 'boss', label: 'Bosses', entries: bossStages, expanded: true },
    {
      key: 'version',
      label: 'Added in',
      entries: [...data.versions, { id: UNKNOWN_VERSION, name: 'Unknown', count: 0 }],
    },
    {
      key: 'rarity',
      label: 'Rarity',
      entries: [
        ...RARITY_ORDER.flatMap((level) => {
          const r = data.rarities.get(level)
          return r ? [{ id: String(level), name: r.name, icon: r.icon, count: r.count }] : []
        }),
        { id: UNKNOWN_RARITY, name: 'Unknown', count: 0 },
      ],
    },
    { key: 'category', label: 'Categories', entries: categories },
    // sub-options (the two Extractinators) under their parent
    {
      key: 'obtain',
      label: 'Obtained by',
      entries: data.obtain
        // "filter: false": only shown with the items (e.g. "Using a toilet" for Poo)
        .filter((o) => !o.parent && o.filter !== false)
        .map((o) => {
          const children = data.obtain.filter((c) => c.parent === o.id)
          return children.length ? { ...o, children } : o
        }),
    },
    {
      key: 'crafting',
      label: 'Crafting',
      entries: CRAFTING.map((c) => ({
        id: c.id,
        name: c.name,
        count: 0,
        icon: data.items.find((i) => i.name === c.iconItem)?.icon,
      })),
    },
    // the vendors' heads (their map icons) instead of the full body
    { key: 'vendor', label: 'Sold by', entries: data.vendors.map((v) => ({ ...v, icon: v.head ?? v.icon })) },
    { key: 'container', label: 'Found in', entries: containers },
    // any NPC, container or set (FL18): the sidebar shows only the picked ones
    { key: 'source', label: 'Sources & sets', entries: sourceCandidates(data) },
    { key: 'event', label: 'Events', entries: data.events },
    { key: 'biome', label: 'Biome', entries: data.biomes },
    { key: 'condition', label: 'Conditions', entries: conditions },
  ]
  return groups.sort((a, b) => GROUP_KEYS.indexOf(a.key) - GROUP_KEYS.indexOf(b.key))
}

/** Entry ids an item belongs to, per group. `bosses`/`bossStage` and `containers` (drop source ids)
 * depend on the difficulty; `crafting` is empty here and filled per playthrough state (see recipes.ts). */
export function itemEntries(
  item: Item,
  /** the item's milestones: its own, or (mode "up to") every milestone from it on */
  milestones: string[],
  bosses: string[],
  bossStage: Map<string, string>,
  containers: string[],
  containerGroup: Map<string, string>,
  conditionGroup: Map<string, string>,
  /** "Sources & sets" options (FL18) */
  sources: string[] = [],
): Record<GroupKey, string[]> {
  const stages = new Set(bosses.map((b) => bossStage.get(b)))
  const containerGroups = new Set(containers.map((c) => containerGroup.get(c)).filter((g) => g !== undefined))
  return {
    progression: milestones,
    boss: [...[...stages].map((s) => `stage:${s}`), ...bosses.map((b) => `boss:${b}`)],
    version: [item.version ?? UNKNOWN_VERSION],
    rarity: [item.rarity === undefined ? UNKNOWN_RARITY : String(item.rarity)],
    category: [...item.categories.map((c) => `cat:${c}`), ...item.subcategories.map((s) => `sub:${s}`)],
    obtain: item.obtain,
    crafting: [],
    vendor: item.vendors,
    container: [...[...containerGroups].map((g) => `cgroup:${g}`), ...containers.map((c) => `cont:${c}`)],
    source: sources,
    event: item.events,
    biome: item.biomes ?? [],
    condition: [
      ...new Set(item.conditions.map((c) => `cond-group:${conditionGroup.get(c)}`)),
      ...item.conditions.map((c) => `cond:${c}`),
    ],
  }
}

export interface Tally {
  total: number
  obtained: number
}

// The work is split so a change of view mode or sort order does not recount
// the facets (and the sidebar does not re-render):
//   computeCounts  - search + filters -> facet counts and the matching items
//   orderItems     - name order (or search relevance)
//   visibleItems   - ordered items that match and fit the view mode

export interface CountInput {
  items: Item[] // items of the playthrough's platform
  entriesOf: (item: Item) => Record<GroupKey, string[]>
  checked: Set<string>
  ignored: Set<string>
  selection: Selection
  searchRank: Map<string, number> | null // null = no search
}

export type Facets<K extends string = GroupKey> = Record<K, Map<string, Tally>>

export interface Counts<K extends string = GroupKey> {
  facets: Facets<K>
  /** per group: items in at least one of its entries (faceted like the entries) */
  groupTallies: Record<K, Tally>
  /** progress of the items matching search and filters */
  filtered: Tally
  /** progress of the whole playthrough */
  overall: Tally
  ignoredCount: number
  /** keys of items (ignored ones included) matching search and filters */
  matching: Set<string>
  /** per group: progress of every entry with (non-ignored) items at all - without filters and
   * search (its keys: the entries that exist in the playthrough) */
  available: Facets<K>
}

export function computeCounts(input: CountInput): Counts {
  return computeFacets({ ...input, keys: GROUP_KEYS })
}

/** Anything with a key, filter groups K and a checked state (items, bestiary entries). */
export interface FacetInput<K extends string, T extends { key: string }> {
  keys: readonly K[]
  items: T[]
  entriesOf: (item: T) => Record<K, string[]>
  checked: Set<string>
  ignored: Set<string>
  selection: Record<K, string[]>
  searchRank: Map<string, number> | null
}

export function computeFacets<K extends string, T extends { key: string }>(input: FacetInput<K, T>): Counts<K> {
  const { keys: GROUP_KEYS, items, checked, ignored, selection, searchRank } = input
  const facets = Object.fromEntries(GROUP_KEYS.map((g) => [g, new Map<string, Tally>()])) as Facets<K>
  const groupTallies = Object.fromEntries(GROUP_KEYS.map((g) => [g, { total: 0, obtained: 0 }])) as Record<K, Tally>
  const selectedSets = GROUP_KEYS.map((g) => new Set(selection[g]))
  const overall: Tally = { total: 0, obtained: 0 }
  const filtered: Tally = { total: 0, obtained: 0 }
  const matching = new Set<string>()
  const available = Object.fromEntries(GROUP_KEYS.map((g) => [g, new Map<string, Tally>()])) as Facets<K>
  let ignoredCount = 0

  const add = (map: Map<string, Tally>, id: string, have: boolean) => {
    let t = map.get(id)
    if (!t) map.set(id, (t = { total: 0, obtained: 0 }))
    t.total++
    if (have) t.obtained++
  }

  for (const item of items) {
    const isIgnored = ignored.has(item.key)
    const have = checked.has(item.key)
    if (isIgnored) ignoredCount++
    else {
      overall.total++
      if (have) overall.obtained++
    }
    const entries = input.entriesOf(item)
    if (!isIgnored) for (const g of GROUP_KEYS) for (const id of entries[g]) add(available[g], id, have)
    if (searchRank && !searchRank.has(item.key)) continue

    let failing = -1
    let failCount = 0
    for (let i = 0; i < GROUP_KEYS.length; i++) {
      const sel = selectedSets[i]
      if (sel.size && !entries[GROUP_KEYS[i]].some((id) => sel.has(id))) {
        failCount++
        failing = i
      }
    }

    if (!isIgnored && failCount <= 1) {
      for (let i = 0; i < GROUP_KEYS.length; i++) {
        const g = GROUP_KEYS[i]
        if (failCount !== 0 && failing !== i) continue
        for (const id of entries[g]) add(facets[g], id, have)
        if (entries[g].length) {
          groupTallies[g].total++
          if (have) groupTallies[g].obtained++
        }
      }
    }
    if (failCount) continue

    matching.add(item.key)
    if (!isIgnored) {
      filtered.total++
      if (have) filtered.obtained++
    }
  }

  return { facets, groupTallies, filtered, overall, ignoredCount, matching, available }
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const byName = (a: Item, b: Item) => collator.compare(a.name, b.name) || a.id - b.id

/** Items by name, or by search relevance while searching. Columns sort in the table itself. */
export function orderItems(items: Item[], searchRank: Map<string, number> | null): Item[] {
  if (searchRank) {
    return items.filter((i) => searchRank.has(i.key)).sort((a, b) => searchRank.get(a.key)! - searchRank.get(b.key)!)
  }
  return [...items].sort(byName)
}

export function visibleItems(
  ordered: Item[],
  matching: Set<string>,
  checked: Set<string>,
  ignored: Set<string>,
  view: ViewMode,
): Item[] {
  return ordered.filter((item) => {
    if (!matching.has(item.key)) return false
    const isIgnored = ignored.has(item.key)
    if (view === 'ignored') return isIgnored
    return !isIgnored && (view === 'all' || (view === 'obtained') === checked.has(item.key))
  })
}

// ------------------------------------------------------------------ search

/** "fuzzy": typos allowed (Fuse.js); "exact": the text must appear in the name */
export type SearchMode = 'fuzzy' | 'exact'

/** A list that can be searched both ways. */
export interface Searcher<T> {
  fuse: Fuse<T>
  items: T[]
  /** texts an exact search looks in, most important first */
  names: (item: T) => (string | undefined)[]
}

export function createSearch(items: Item[]): Searcher<Item> {
  const fuse = new Fuse(items, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'internalName', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  })
  return { fuse, items, names: (i) => [i.name, i.internalName] }
}

/** How well a name contains the query: 0 equal, 1 starts with it, 2 at a word start, 3 anywhere. */
function exactScore(name: string, q: string): number | undefined {
  const n = name.toLowerCase()
  const at = n.indexOf(q)
  if (at < 0) return undefined
  if (n === q) return 0
  if (at === 0) return 1
  let i = at
  while (i >= 0) {
    if (!/[a-z0-9]/.test(n[i - 1] ?? ' ')) return 2
    i = n.indexOf(q, i + 1)
  }
  return 3
}

/** item key -> rank (0 = best), or null when the query is empty. */
export function searchRanks<T extends { key: string }>(
  searcher: Searcher<T>,
  query: string,
  mode: SearchMode = 'fuzzy',
): Map<string, number> | null {
  const q = query.trim()
  if (!q) return null
  if (mode === 'fuzzy') return new Map(searcher.fuse.search(q).map((r, i) => [r.item.key, i]))
  const lower = q.toLowerCase()
  const hits: { key: string; score: number; name: string }[] = []
  for (const item of searcher.items) {
    const names = searcher.names(item)
    const scores = names.flatMap((n, k) => {
      const s = n ? exactScore(n, lower) : undefined
      // a hit in a less important text (e.g. the internal name) ranks after the name's
      return s === undefined ? [] : [s + k * 4]
    })
    if (scores.length) hits.push({ key: item.key, score: Math.min(...scores), name: names[0] ?? '' })
  }
  hits.sort((a, b) => a.score - b.score || collator.compare(a.name, b.name))
  return new Map(hits.map((h, i) => [h.key, i]))
}

export const percent = (t: Tally) => (t.total ? (t.obtained / t.total) * 100 : 0)

export function formatPercent(t: Tally): string {
  if (!t.total) return '–'
  // two decimals, rounded down: 100.00% only when everything is obtained
  return `${(Math.floor(percent(t) * 100) / 100).toFixed(2)}%`
}
