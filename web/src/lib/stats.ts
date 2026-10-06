import type { Playthrough } from './saveFile'
import type { GroupEntry, Item } from './types'
import type { AnyGroup } from './filterView'

// Statistics of a playthrough (ST): the numbers behind the charts of the statistics view, computed
// from what the progress file records - the time of the last change of every item and bestiary
// entry (changedAt, bestiaryChangedAt) and the first completion of every filter option
// (completedAt). The file keeps no history, so an item unchecked later leaves no trace: the
// series count what is checked now, by the time it was checked.

export const DAY = 86_400_000

/**
 * The local calendar day of a time as a day number: the UTC day of the same year, month and date
 * (whole numbers, so days can be compared and counted). `dayDate` turns it back into a Date to be
 * formatted with `timeZone: 'UTC'`.
 */
export function dayOf(time: string | number): number {
  const d = new Date(time)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY
}

export const dayDate = (day: number) => new Date(day * DAY)

export const today = () => dayOf(Date.now())

/** A day formatted like a date ("3 Sep", "3 Sep 2025", "Tue, 3 Sep 2026"). */
export function formatDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return dayDate(day).toLocaleDateString([], { timeZone: 'UTC', ...options })
}

/** Monday to Sunday: 0-6 */
export const weekdayOf = (day: number) => (dayDate(day).getUTCDay() + 6) % 7

/** The Monday of the week of a day. */
export const weekStart = (day: number) => day - weekdayOf(day)

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ------------------------------------------------------------------ series

export type BucketSize = 'day' | 'week' | 'month'

export interface Bucket {
  /** first day */
  start: number
  /** day after the last */
  end: number
  /** changes in the bucket */
  count: number
  /** everything up to and including the bucket */
  cumulative: number
}

export type Range = 'all' | 30 | 90

function monthStart(day: number): number {
  const d = dayDate(day)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY
}

function nextMonth(day: number): number {
  const d = dayDate(day)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY
}

export function bucketStart(day: number, size: BucketSize): number {
  return size === 'day' ? day : size === 'week' ? weekStart(day) : monthStart(day)
}

export function bucketEnd(start: number, size: BucketSize): number {
  return size === 'day' ? start + 1 : size === 'week' ? start + 7 : nextMonth(start)
}

/** Days per bucket, chosen so the chart has a readable number of columns. */
export function autoBucketSize(spanDays: number): BucketSize {
  return spanDays <= 70 ? 'day' : spanDays <= 450 ? 'week' : 'month'
}

export interface Series {
  buckets: Bucket[]
  size: BucketSize
  /** first day shown */
  from: number
  /** changes before `from` (the cumulative line starts there) */
  before: number
}

/**
 * The days (`days`, one per change) counted per bucket from the start of the playthrough (or the
 * first change, if earlier) up to today - or only the last 30 / 90 days, each day a bucket.
 */
export function series(days: number[], createdDay: number, range: Range, now = today()): Series {
  const first = days.length ? Math.min(createdDay, ...days) : createdDay
  const from = range === 'all' ? first : Math.max(first, now - range + 1)
  const size = range === 'all' ? autoBucketSize(now - from + 1) : 'day'
  const counts = new Map<number, number>()
  let before = 0
  for (const d of days) {
    if (d < from) before++
    else if (d <= now) {
      const b = bucketStart(d, size)
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
  }
  const buckets: Bucket[] = []
  let cumulative = before
  for (let start = bucketStart(from, size); start <= now; start = bucketEnd(start, size)) {
    const count = counts.get(start) ?? 0
    cumulative += count
    buckets.push({ start, end: bucketEnd(start, size), count, cumulative })
  }
  return { buckets, size, from, before }
}

/** "3 Sep", "3–9 Sep", "30 Sep – 6 Oct", "Sep 2026" - the days a bucket covers. */
export function bucketLabel(b: Bucket, size: BucketSize): string {
  if (size === 'day') return formatDay(b.start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  if (size === 'month') return formatDay(b.start, { month: 'long', year: 'numeric' })
  const last = b.end - 1
  const a = dayDate(b.start)
  const z = dayDate(last)
  if (a.getUTCMonth() === z.getUTCMonth())
    return `${a.getUTCDate()}–${formatDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`
  return `${formatDay(b.start, { day: 'numeric', month: 'short' })} – ${formatDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

// ---------------------------------------------------------------- activity

export interface Activity {
  /** changes per day */
  byDay: Map<number, number>
  /** days with changes */
  activeDays: number
  /** consecutive days with changes up to today (or yesterday - today is not over) */
  currentStreak: number
  longestStreak: number
  /** changes per weekday, Monday first */
  weekdays: number[]
  /** the weekday with the most changes (null without any) */
  busiestWeekday: number | null
}

export function activity(days: number[], now = today()): Activity {
  const byDay = new Map<number, number>()
  const weekdays = Array<number>(7).fill(0)
  for (const d of days) {
    if (d > now) continue
    byDay.set(d, (byDay.get(d) ?? 0) + 1)
    weekdays[weekdayOf(d)]++
  }
  const sorted = [...byDay.keys()].sort((a, b) => a - b)
  let longest = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  let current = 0
  for (let d = byDay.has(now) ? now : now - 1; byDay.has(d); d--) current++
  const max = Math.max(...weekdays)
  return {
    byDay,
    activeDays: byDay.size,
    currentStreak: current,
    longestStreak: longest,
    weekdays,
    busiestWeekday: max > 0 ? weekdays.indexOf(max) : null,
  }
}

// -------------------------------------------------------------------- pace

export interface Pace {
  obtained: number
  total: number
  remaining: number
  /** days the rate is averaged over */
  days: number
  /** changes per day in that time */
  perDay: number
  /** the day everything would be done at this rate; null without a rate or when done */
  projected: number | null
}

/**
 * How fast the collection grows: the changes of the last `range` days (all: since the start of the
 * playthrough) per day, and when the rest would be done at that pace.
 */
export function pace(
  days: number[],
  createdDay: number,
  total: number,
  obtained: number,
  range: Range,
  now = today(),
): Pace {
  const from = range === 'all' ? Math.min(createdDay, now) : now - range + 1
  const span = now - from + 1
  const changes = days.filter((d) => d >= from && d <= now).length
  const perDay = changes / span
  const remaining = total - obtained
  const projected = remaining > 0 && perDay > 0 ? now + Math.ceil(remaining / perDay) : null
  return { obtained, total, remaining, days: span, perDay, projected }
}

// --------------------------------------------------------------- completed

export interface CompletedOption {
  key: string
  time: string
  day: number
  name: string
  icon?: string
  /** the group, e.g. "Sold by" or "Categories › Accessories" */
  context: string
  kind: 'items' | 'bestiary'
}

/** The filter options of a playthrough in the order they were first completed, newest first;
 * options the data no longer has are left out. */
export function completedOptions(
  pt: Playthrough,
  itemGroups: AnyGroup[],
  bestiaryGroups: AnyGroup[],
): CompletedOption[] {
  const index = (groups: AnyGroup[]) => {
    const map = new Map<string, { name: string; icon?: string; context: string }>()
    for (const g of groups)
      for (const e of g.entries) {
        map.set(`${g.key}/${e.id}`, { name: e.name, icon: e.icon, context: g.label })
        for (const c of e.children ?? [])
          map.set(`${g.key}/${c.id}`, { name: c.name, icon: c.icon, context: `${g.label} › ${e.name}` })
      }
    return map
  }
  const items = index(itemGroups)
  const bestiary = index(bestiaryGroups)
  const out: CompletedOption[] = []
  for (const [key, time] of Object.entries(pt.completedAt)) {
    const kind = key.startsWith('bestiary:') ? 'bestiary' : 'items'
    const info = kind === 'bestiary' ? bestiary.get(key.slice('bestiary:'.length)) : items.get(key)
    if (info) out.push({ key, time, day: dayOf(time), kind, ...info })
  }
  return out.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
}

// --------------------------------------------------------------- breakdown

export interface BreakdownRow extends GroupEntry {
  total: number
  obtained: number
}

/** Obtained / total per option of a group (categories, "Obtained by"), ignored items left out;
 * the most complete first. */
export function breakdown(
  items: Item[],
  checked: Set<string>,
  ignored: Set<string>,
  entries: GroupEntry[],
  idsOf: (item: Item) => string[],
): BreakdownRow[] {
  const tallies = new Map<string, { total: number; obtained: number }>()
  for (const item of items) {
    if (ignored.has(item.key)) continue
    const have = checked.has(item.key)
    for (const id of idsOf(item)) {
      let t = tallies.get(id)
      if (!t) tallies.set(id, (t = { total: 0, obtained: 0 }))
      t.total++
      if (have) t.obtained++
    }
  }
  return entries
    .flatMap((e) => {
      const t = tallies.get(e.id)
      return t?.total ? [{ ...e, ...t }] : []
    })
    .sort((a, b) => b.obtained / b.total - a.obtained / a.total || b.total - a.total)
}

// ------------------------------------------------------------------ format

/** "81 h 43 min", "12 min", "45 s" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h.toLocaleString('en')} h ${m} min`
  if (m > 0) return `${m} min`
  return `${Math.round(seconds)} s`
}

/** "1.5" / "0.25" / "12" - a rate with the precision it needs */
export function formatRate(perDay: number): string {
  if (perDay >= 10) return Math.round(perDay).toLocaleString('en')
  if (perDay >= 1) return perDay.toFixed(1)
  return perDay.toFixed(2)
}

/** Round axis ticks for a maximum: 0, step, 2·step, … up to at least `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10
  const ticks: number[] = []
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}
