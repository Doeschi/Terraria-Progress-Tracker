import { useDeferredValue, useMemo } from 'react'
import { useActivePlaythrough, useStore } from '@/store'
import { computeFacets, searchRanks, type Counts, type Tally } from '@/lib/filtering'
import { usePrefs } from '@/lib/prefs'
import {
  BESTIARY_GROUP_KEYS,
  bestiaryEntryGroups,
  createBestiarySearch,
  entriesForPlaythrough,
  type BestiaryGroupKey,
} from '@/lib/bestiary'
import type { BestiaryEntry } from '@/lib/types'

const NOTHING = new Set<string>()

export interface BestiaryView extends Counts<BestiaryGroupKey> {
  visible: BestiaryEntry[]
  unlocked: Set<string>
  searching: boolean
}

/** Bestiary entries of the active playthrough (platform, game version). */
function usePlaythroughEntries(): BestiaryEntry[] {
  const data = useStore((s) => s.data)
  const pt = useActivePlaythrough()
  const platform = pt?.platform
  const gameVersion = pt?.gameVersion ?? null
  return useMemo(
    () => (data && platform ? entriesForPlaythrough(data, { platform, gameVersion }) : []),
    [data, platform, gameVersion],
  )
}

/** Overall bestiary progress (header). */
export function useBestiaryProgress(): Tally {
  const entries = usePlaythroughEntries()
  const unlockedList = useActivePlaythrough()?.bestiary
  return useMemo(() => {
    const unlocked = new Set(unlockedList)
    return { total: entries.length, obtained: entries.filter((e) => unlocked.has(e.id)).length }
  }, [entries, unlockedList])
}

/** Everything the bestiary view shows. */
export function useBestiaryView(): BestiaryView {
  const entries = usePlaythroughEntries()
  const pt = useActivePlaythrough()
  const selection = useStore((s) => s.bestiarySelection)
  const search = useDeferredValue(useStore((s) => s.bestiarySearch))
  const view = useStore((s) => s.bestiaryView)

  const unlocked = useMemo(() => new Set(pt?.bestiary), [pt?.bestiary])
  const searcher = useMemo(() => createBestiarySearch(entries), [entries])
  const searchMode = usePrefs((s) => s.searchMode)
  const ranks = useMemo(() => searchRanks(searcher, search, searchMode), [searcher, search, searchMode])

  const counts = useMemo(
    () =>
      computeFacets({
        keys: BESTIARY_GROUP_KEYS,
        items: entries,
        entriesOf: bestiaryEntryGroups,
        checked: unlocked,
        ignored: NOTHING,
        selection,
        searchRank: ranks,
      }),
    [entries, unlocked, selection, ranks],
  )

  const visible = useMemo(() => {
    const list = entries.filter(
      (e) => counts.matching.has(e.id) && (view === 'all' || (view === 'unlocked') === unlocked.has(e.id)),
    )
    // in-game order, or by relevance while searching
    return ranks ? list.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!) : list
  }, [entries, counts.matching, unlocked, view, ranks])

  return { ...counts, visible, unlocked, searching: !!ranks }
}
