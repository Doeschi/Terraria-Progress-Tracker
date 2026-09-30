import { useDeferredValue, useMemo } from 'react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
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

export interface TrackerView extends Counts {
  visible: Item[]
  platformItems: Item[]
  checked: Set<string>
  ignored: Set<string>
  searching: boolean
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
    const milestonesOf = (item: Item) => {
      const n = item.milestone ? order.indexOf(item.milestone) : -1
      if (n < 0) return []
      return progressionMode === 'upTo' ? order.slice(n) : [order[n]]
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
        ),
      ]),
    )
  }, [data, difficulty, progressionMode])
  const fuse = useMemo(() => createSearch(platformItems), [platformItems])
  const ranks = useMemo(() => searchRanks(fuse, search), [fuse, search])
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

  // independent of view mode and sort order
  const counts = useMemo(
    () =>
      computeCounts({
        items: platformItems,
        entriesOf: (item) => ({ ...entries.get(item.key)!, crafting: crafting.get(item.key) ?? NONE }),
        checked,
        ignored,
        selection,
        searchRank: ranks,
      }),
    [platformItems, entries, crafting, checked, ignored, selection, ranks],
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
    () => (pt ? { ...counts, visible, platformItems, checked, ignored, searching: !!ranks } : null),
    [pt, counts, visible, platformItems, checked, ignored, ranks],
  )
}
