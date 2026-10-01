import type { FilterEntry, FilterGroup, Tally } from './filtering'
import { ordered } from './layout'

// What the filter sidebar shows where (pure logic, no React): the options of a group,
// the "Completed" / "Hidden" sections, and the filter search with its keyboard targets.

// groups whose options can be sorted by name (the others have a natural order);
// ids with the scope's prefix
export const SORTABLE = new Set(['category', 'obtain', 'vendor', 'event', 'biome', 'bestiary:event', 'bestiary:biome'])

export type AnyGroup = FilterGroup<string>
export type AnyFacets = Record<string, Map<string, Tally>>

/** Where an option is shown: its group, "Completed" or "Hidden". */
export interface Placement {
  isHidden(group: string, id: string): boolean
  /** at 100% over the whole playthrough and "move completed" is on */
  isDone(group: string, id: string): boolean
  /** has items in the current context (filters, search), or is selected */
  hasItems(group: string, id: string): boolean
  /** has items in the playthrough at all (else never shown); options without items in the
   * current context are shown grayed out instead of disappearing */
  exists(group: string, id: string): boolean
  /** `name` for the "hidden – Undo" message */
  toggleHidden(group: string, id: string, name?: string): void
}

export const complete = (t?: Tally) => !!t && t.total > 0 && t.obtained === t.total

// "Other …" fallback entries stay last
export const byName = (a: FilterEntry, b: FilterEntry) =>
  Number(!!a.fallback) - Number(!!b.fallback) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })

export function sortEntries(entries: FilterEntry[]): FilterEntry[] {
  return [...entries].sort(byName).map((e) => (e.children ? { ...e, children: [...e.children].sort(byName) } : e))
}

/** The search text at the start of a word ("wing" finds "Wings", not "Glowing"). */
export const nameMatches = (name: string, q: string) => {
  const n = name.toLowerCase()
  let i = n.indexOf(q)
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(n[i - 1])) return true
    i = n.indexOf(q, i + 1)
  }
  return false
}

/** Options of a group in display order (default, or A–Z if chosen for the group). */
export function orderedEntries(group: AnyGroup, prefix: string, entryOrder: Record<string, string>): FilterEntry[] {
  const key = prefix + group.key
  return SORTABLE.has(key) && entryOrder[key] === 'name' ? sortEntries(group.entries) : group.entries
}

/**
 * What a group shows: options with items that are neither hidden nor completed-and-moved,
 * narrowed by the filter search (the whole group if its name matches; a matching parent keeps
 * its children, a matching child keeps its parent, whose children are then shown expanded).
 */
export function groupView(group: AnyGroup, ordered: FilterEntry[], place: Placement, q: string) {
  const here = (e: FilterEntry) =>
    place.exists(group.key, e.id) && !place.isHidden(group.key, e.id) && !place.isDone(group.key, e.id)
  const groupMatch = !q || nameMatches(group.label, q)
  const shownChild = (parent: FilterEntry) => (c: FilterEntry) =>
    here(c) && (groupMatch || nameMatches(parent.name, q) || nameMatches(c.name, q))
  const entries = ordered.filter(
    (e) =>
      !place.isHidden(group.key, e.id) &&
      !place.isDone(group.key, e.id) &&
      (place.exists(group.key, e.id) || !!e.children?.some(here)) &&
      (groupMatch || nameMatches(e.name, q) || !!e.children?.some(shownChild(e))),
  )
  // children shown only because they matched (the parent itself did not)
  const expandFor = (e: FilterEntry) =>
    !!q && !groupMatch && !nameMatches(e.name, q) && !!e.children?.some(shownChild(e))
  return { entries, shownChild, groupMatch, expandFor }
}

/** Options moved to "Completed" or "Hidden", per group; "Completed" follows the filter search. */
export function movedLists(kind: 'completed' | 'hidden', groups: AnyGroup[], place: Placement, q: string) {
  const moved = (g: AnyGroup, e: FilterEntry) =>
    kind === 'hidden'
      ? place.isHidden(g.key, e.id)
      : !place.isHidden(g.key, e.id) && place.isDone(g.key, e.id) && place.exists(g.key, e.id)
  return groups
    .map((g) => {
      const list: FilterEntry[] = []
      for (const e of g.entries) {
        if (moved(g, e)) list.push(e)
        else if (!place.isHidden(g.key, e.id) && !place.isDone(g.key, e.id))
          for (const c of e.children ?? []) if (moved(g, c)) list.push(c)
      }
      const shown = q && !nameMatches(g.label, q) ? list.filter((e) => nameMatches(e.name, q)) : list
      return { group: g, list: shown }
    })
    .filter((x) => x.list.length)
}

export interface SearchTarget {
  group: string
  id: string
  name: string
}

/**
 * Keyboard targets of the filter search, in screen order: shown options whose own name (or
 * group name) matches, and the parents shown for a matching subentry - then "Completed".
 */
export function searchTargets(
  groups: AnyGroup[],
  place: Placement,
  q: string,
  prefix: string,
  entryOrder: Record<string, string>,
  withCompleted: boolean,
): SearchTarget[] {
  if (!q) return []
  const out: SearchTarget[] = []
  for (const g of groups) {
    const { entries, shownChild, groupMatch, expandFor } = groupView(g, orderedEntries(g, prefix, entryOrder), place, q)
    for (const e of entries) {
      // a parent shown for a matching subentry is a target too (screen order: parent, then children)
      if (groupMatch || nameMatches(e.name, q) || expandFor(e)) out.push({ group: g.key, id: e.id, name: e.name })
      if (expandFor(e))
        for (const c of e.children ?? [])
          if (shownChild(e)(c) && nameMatches(c.name, q)) out.push({ group: g.key, id: c.id, name: c.name })
    }
  }
  if (withCompleted)
    for (const { group, list } of movedLists('completed', groups, place, q))
      for (const e of list) out.push({ group: group.key, id: e.id, name: e.name })
  return out
}

// ------------------------------------------------------------ almost done

/** The "Almost done" group: a group key of its own in the saved group order. */
export const ALMOST_DONE = 'almost-done'
export const ALMOST_DONE_LABEL = 'Almost done'

/** Group keys in the saved order; "Almost done" starts at the top (also for an older saved order). */
export function groupOrder(keys: string[], saved: string[]): string[] {
  return ordered([ALMOST_DONE, ...keys], saved.includes(ALMOST_DONE) ? saved : [ALMOST_DONE, ...saved])
}

// options that are states or overlap each other, not collections to complete
export const NOT_RANKED = new Set(['progression', 'crafting'])

export interface AlmostDone {
  group: AnyGroup
  entry: FilterEntry
  /** parent option of a subgroup, e.g. "Accessories" for "Wings" */
  parent?: FilterEntry
}

/**
 * The options closest to completion over the whole playthrough (`totals`, without filters):
 * highest percentage first, then fewer missing; at least `min` items, started, not complete,
 * not hidden. Subgroups count on their own.
 */
export function almostDone(groups: AnyGroup[], totals: AnyFacets, place: Placement, count = 5, min = 5): AlmostDone[] {
  const out: (AlmostDone & { t: Tally })[] = []
  const consider = (group: AnyGroup, entry: FilterEntry, parent?: FilterEntry) => {
    const t = totals[group.key]?.get(entry.id)
    if (!t || t.total < min || t.obtained === 0 || t.obtained === t.total) return
    if (place.isHidden(group.key, entry.id)) return
    out.push({ group, entry, parent, t })
  }
  for (const g of groups) {
    if (NOT_RANKED.has(g.key)) continue
    for (const e of g.entries) {
      consider(g, e)
      for (const c of e.children ?? []) consider(g, c, e)
    }
  }
  const missing = (t: Tally) => t.total - t.obtained
  return out
    .sort(
      (a, b) =>
        b.t.obtained / b.t.total - a.t.obtained / a.t.total ||
        missing(a.t) - missing(b.t) ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, count)
}
