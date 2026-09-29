// Small text helpers shared by the components.

/** "1 container" / "3 containers" (`many` for irregular plurals); plain numbers like the tallies. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Display name of an id in a list of { id, name } entries (the id itself if unknown). */
export function nameOf(list: readonly { id: string; name: string }[], id: string): string {
  return list.find((x) => x.id === id)?.name ?? id
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Date and time, e.g. "29 Sep 2026, 14:05"; undefined for no date. */
export const formatDate = (iso?: string) => (iso ? dateFormat.format(new Date(iso)) : undefined)

/** Time of day, e.g. "14:05". */
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** "today, 14:05" / "yesterday, 09:12" / "3 Sep, 18:40" (the year only if not this year). */
export function formatRelativeDay(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(d)) / 86_400_000)
  const time = formatTime(iso)
  if (days === 0) return `today, ${time}`
  if (days === 1) return `yesterday, ${time}`
  const date = d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
  return `${date}, ${time}`
}
