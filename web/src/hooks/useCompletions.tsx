import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useActivePlaythrough, useStore } from '@/store'
import { findPlaythrough } from '@/lib/saveFile'
import { usePrefs } from '@/lib/prefs'
import { buildFilterGroups, computeFacets, type Facets } from '@/lib/filtering'
import {
  BESTIARY_GROUP_KEYS,
  bestiaryEntryGroups,
  buildBestiaryGroups,
  emptyBestiarySelection,
  entriesForPlaythrough,
} from '@/lib/bestiary'
import { NOT_RANKED, type AnyFacets, type AnyGroup } from '@/lib/filterView'
import { confettiBurst } from '@/lib/confetti'
import { CompletionToast, type Completed } from '@/components/CompletionToast'

// "Filter complete!": when checking items (by hand, "Check all" or a world sync) brings filter
// options to 100% - over the whole playthrough, not the current filters - a toast in the style
// of Terraria's achievement pop-up and a burst of confetti. Changes within a short time (a sync,
// quick clicks) give one toast for all of them - one for the item filters and one for the
// bestiary filters, so a world sync that completes both is easy to read.

export type CompletionKind = 'items' | 'bestiary'

const EMPTY = new Set<string>()
const MERGE_MS = 400
const pending: Record<CompletionKind, Completed[]> = { items: [], bestiary: [] }
const timers: Partial<Record<CompletionKind, ReturnType<typeof setTimeout>>> = {}

function queue(kind: CompletionKind, list: Completed[]) {
  pending[kind].push(...list)
  clearTimeout(timers[kind])
  timers[kind] = setTimeout(() => {
    const done = pending[kind]
    pending[kind] = []
    if (done.length) celebrate(kind, done)
  }, MERGE_MS)
}

function celebrate(kind: CompletionKind, done: Completed[]) {
  toast.custom(() => <CompletionToast kind={kind} done={done} />, { position: 'top-center', duration: 6000 })
  // from just below the toast
  confettiBurst(window.innerWidth / 2, 70)
}

/** Options at 100% (at least one item), hidden ones and non-collections left out. */
function completedOptions(groups: AnyGroup[], totals: AnyFacets, hidden: Set<string>, prefix: string) {
  const out = new Map<string, Completed>()
  for (const g of groups) {
    if (NOT_RANKED.has(g.key)) continue
    const check = (e: AnyGroup['entries'][number], parent?: AnyGroup['entries'][number]) => {
      const t = totals[g.key]?.get(e.id)
      if (!t || !t.total || t.obtained !== t.total || hidden.has(`${prefix}${g.key}/${e.id}`)) return
      out.set(`${g.key}/${e.id}`, {
        name: e.name,
        icon: e.icon,
        context: parent ? `${g.label} › ${parent.name}` : g.label,
      })
    }
    for (const e of g.entries) {
      check(e)
      for (const c of e.children ?? []) check(c, e)
    }
  }
  return out
}

/**
 * Watches one sidebar's options (items or bestiary): newly completed ones are celebrated, but only
 * when the tracked state (`progress`, e.g. the checked list) changed - not when a file is loaded,
 * the playthrough switched or settings change the counts.
 */
function useCompletions(
  groups: AnyGroup[],
  totals: AnyFacets,
  progress: unknown,
  playthroughId: string | undefined,
  prefix: string,
) {
  const hiddenList = usePrefs((s) => s.hiddenFilters)
  const enabled = usePrefs((s) => s.layout.celebrate)
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList])
  const prev = useRef<{ id?: string; progress: unknown; done: Map<string, Completed> } | null>(null)

  useEffect(() => {
    const done = completedOptions(groups, totals, hidden, prefix)
    const p = prev.current
    prev.current = { id: playthroughId, progress, done }
    if (!enabled || !p || p.id !== playthroughId || p.progress === progress) return
    const newly = [...done].filter(([k]) => !p.done.has(k)).map(([, c]) => c)
    if (newly.length) queue(prefix ? 'bestiary' : 'items', newly)
  }, [groups, totals, hidden, prefix, playthroughId, progress, enabled])
}

/**
 * When each filter option was completed (Playthrough.completedAt): options at 100% get the current
 * time if they have none, options no longer complete lose it. Hidden options count too. Runs
 * only with counts (not while the data or the view is still loading).
 */
function useCompletedAt(groups: AnyGroup[], totals: AnyFacets, playthroughId: string | undefined, prefix: string) {
  const completedAt = useStore((s) => findPlaythrough(s.doc, playthroughId ?? '')?.completedAt)
  const updatePlaythrough = useStore((s) => s.updatePlaythrough)

  useEffect(() => {
    if (!playthroughId || !completedAt || !Object.values(totals).some((m) => m.size)) return
    const done = new Set([...completedOptions(groups, totals, EMPTY, prefix).keys()].map((k) => prefix + k))
    const mine = (k: string) => (prefix ? k.startsWith(prefix) : !k.startsWith('bestiary:'))
    const stale = Object.keys(completedAt).filter((k) => mine(k) && !done.has(k))
    const fresh = [...done].filter((k) => !completedAt[k])
    if (!stale.length && !fresh.length) return
    const now = new Date().toISOString()
    updatePlaythrough(playthroughId, (p) => {
      const next = { ...p.completedAt }
      for (const k of stale) delete next[k]
      for (const k of fresh) next[k] = now
      return { ...p, completedAt: next }
    })
  }, [groups, totals, playthroughId, prefix, completedAt, updatePlaythrough])
}

/** Item filters: the totals the main view already computes. */
export function useItemCompletions(available: Facets | undefined) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()
  const groups = useMemo(() => buildFilterGroups(data) as AnyGroup[], [data])
  // checking and ignoring both change what is complete
  const progress = useMemo(() => [pt?.checked, pt?.ignored], [pt?.checked, pt?.ignored])
  useCompletions(groups, (available ?? {}) as AnyFacets, progress, pt?.id, '')
  useCompletedAt(groups, (available ?? {}) as AnyFacets, pt?.id, '')
}

/** Bestiary filters: counted here, the bestiary view is only computed while it is shown. */
export function useBestiaryCompletions() {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()
  const groups = useMemo(() => buildBestiaryGroups(data) as AnyGroup[], [data])
  const platform = pt?.platform
  const gameVersion = pt?.gameVersion ?? null
  const entries = useMemo(
    () => (platform ? entriesForPlaythrough(data, { platform, gameVersion }) : []),
    [data, platform, gameVersion],
  )
  const unlocked = pt?.bestiary
  const totals = useMemo(
    () =>
      computeFacets({
        keys: BESTIARY_GROUP_KEYS,
        items: entries,
        entriesOf: bestiaryEntryGroups,
        checked: new Set(unlocked),
        ignored: EMPTY,
        selection: emptyBestiarySelection(),
        searchRank: null,
      }).available as AnyFacets,
    [entries, unlocked],
  )
  useCompletions(groups, totals, unlocked, pt?.id, 'bestiary:')
  useCompletedAt(groups, totals, pt?.id, 'bestiary:')
}
