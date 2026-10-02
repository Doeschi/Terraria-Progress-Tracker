import { itemSources } from '@/lib/sources'
import { useDeferredValue, useMemo } from 'react'
import { useActivePlayer, useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { playerStock, STORAGE_TEXT } from '@/lib/player'
import { usePrefs } from '@/lib/prefs'
import { chestStock, craftingEntries } from '@/lib/recipes'
import {
  computeCounts,
  createSearch,
  itemEntries,
  orderItems,
  searchRanks,
  visibleItems,
  type Counts,
} from '@/lib/filtering'
import { itemsForPlaythrough } from '@/lib/availability'
import { bossesBySource, itemBosses, itemContainers } from '@/lib/drops'
import type { Item } from '@/lib/types'
import { AVAILABLE_NOW } from '@/lib/worldProgress'
import { useWorldProgress } from './useWorldProgress'

export interface TrackerView extends Counts {
  visible: Item[]
  platformItems: Item[]
  checked: Set<string>
  ignored: Set<string>
  searching: boolean
  /** item key -> amount owned: in the player's chests (whole world) and on the loaded player;
   * null without a loaded world or player */
  owned: Map<string, Owned> | null
}

/** How many of an item the player owns, and where ("in chests", "in the Void Vault", ...). */
export interface Owned {
  total: number
  places: [where: string, amount: number][]
}

const NONE: string[] = []

// name-sorted copy of each item list
const sortCache = new WeakMap<Item[], Item[]>()

function sortedByName(items: Item[]): Item[] {
  let list = sortCache.get(items)
  if (!list) sortCache.set(items, (list = orderItems(items, null)))
  return list
}

/** Everything the main screen shows for the active playthrough. */
export function useTrackerView(): TrackerView | null {
  const data = useStore((s) => s.data)
  const pt = useActivePlaythrough()
  const selection = useStore((s) => s.selection)
  const search = useDeferredValue(useStore((s) => s.search))
  const view = useStore((s) => s.view)
  const progressionMode = usePrefs((s) => s.progressionMode)
  const picked = useStore((s) => s.picked)
  // milestones reached in the loaded world: the option "Available now" (MS7)
  const reached = useWorldProgress()?.reached ?? null

  // items that exist in this playthrough (platform, difficulty, game version)
  const platform = pt?.platform
  const difficulty = pt?.difficulty
  const gameVersion = pt?.gameVersion ?? null
  const platformItems = useMemo(
    () => (data && platform && difficulty ? itemsForPlaythrough(data, { platform, difficulty, gameVersion }) : []),
    [data, platform, difficulty, gameVersion],
  )
  // filter memberships; boss and container drops depend on the difficulty
  const entries = useMemo(() => {
    if (!data || !difficulty) return new Map()
    const bySource = bossesBySource(data)
    const bossStage = new Map(data.bosses.map((b) => [b.id, b.stage]))
    const containerGroup = new Map(data.containerGroups.flatMap((g) => g.sources.map((s) => [s, g.id] as const)))
    const conditionGroup = new Map([...data.conditions.values()].map((c) => [c.id, c.group]))
    const order = data.milestones.map((m) => m.id)
    // "Sources & sets": only the picked options (FL18; the picker counts all of them itself)
    const allSources = itemSources(data, difficulty)
    const pickedSet = new Set(picked)
    const sources = new Map([...allSources].map(([k, ids]) => [k, ids.filter((id) => pickedSet.has(id))]))
    const milestonesOf = (item: Item) => {
      const n = item.milestone ? order.indexOf(item.milestone) : -1
      if (n < 0) return []
      const own = progressionMode === 'upTo' ? order.slice(n) : [order[n]]
      return reached?.has(order[n]) ? [AVAILABLE_NOW, ...own] : own
    }
    return new Map(
      data.items.map((i) => [
        i.key,
        itemEntries(
          i,
          milestonesOf(i),
          itemBosses(data, i, difficulty, bySource),
          bossStage,
          itemContainers(data, i, difficulty),
          containerGroup,
          conditionGroup,
          sources.get(i.key),
        ),
      ]),
    )
  }, [data, difficulty, progressionMode, reached, picked])
  const searcher = useMemo(() => createSearch(platformItems), [platformItems])
  const searchMode = usePrefs((s) => s.searchMode)
  const ranks = useMemo(() => searchRanks(searcher, search, searchMode), [searcher, search, searchMode])
  const checked = useMemo(() => new Set(pt?.checked), [pt?.checked])
  const ignored = useMemo(() => new Set(pt?.ignored), [pt?.ignored])

  // crafting filter: depends on the obtained items and the chests of the world
  const world = useActiveWorld()
  const detection = usePrefs((s) => s.chestDetection)
  const stationsRequired = usePrefs((s) => s.stationsRequired)
  const chests = useMemo(
    () => (data && world && platform ? chestStock(data, world, detection, platform) : null),
    [data, world, detection, platform],
  )
  const crafting = useMemo(
    () =>
      data && platform
        ? craftingEntries({ data, items: platformItems, platform, checked, chests, stationsRequired })
        : new Map<string, string[]>(),
    [data, platformItems, platform, checked, chests, stationsRequired],
  )

  // "Owned" column: the chests plus everything on the player
  const player = useActivePlayer()
  const owned = useMemo(() => {
    if (!data || !platform || (!chests && !player)) return null
    const out = new Map<string, Owned>()
    const add = (key: string, where: string, n: number) => {
      let o = out.get(key)
      if (!o) out.set(key, (o = { total: 0, places: [] }))
      o.total += n
      o.places.push([where, n])
    }
    for (const [key, n] of chests ?? []) add(key, 'in chests', n)
    if (player)
      for (const [key, { places }] of playerStock(data, player, platform))
        for (const [storage, n] of places) add(key, STORAGE_TEXT[storage], n)
    return out
  }, [data, platform, chests, player])

  // without a loaded world "Available now" is ignored (it stays selected for the next load)
  const effectiveSelection = useMemo(
    () =>
      reached || !selection.progression.includes(AVAILABLE_NOW)
        ? selection
        : { ...selection, progression: selection.progression.filter((id) => id !== AVAILABLE_NOW) },
    [selection, reached],
  )

  // independent of view mode and sort order
  const counts = useMemo(
    () =>
      computeCounts({
        items: platformItems,
        entriesOf: (item) => ({ ...entries.get(item.key)!, crafting: crafting.get(item.key) ?? NONE }),
        checked,
        ignored,
        selection: effectiveSelection,
        searchRank: ranks,
      }),
    [platformItems, entries, crafting, checked, ignored, effectiveSelection, ranks],
  )

  const ordered = useMemo(
    () => (ranks ? orderItems(platformItems, ranks) : sortedByName(platformItems)),
    [platformItems, ranks],
  )

  const visible = useMemo(
    () => visibleItems(ordered, counts.matching, checked, ignored, view),
    [ordered, counts.matching, checked, ignored, view],
  )

  return useMemo(
    () => (pt ? { ...counts, visible, platformItems, checked, ignored, searching: !!ranks, owned } : null),
    [pt, counts, visible, platformItems, checked, ignored, ranks, owned],
  )
}
