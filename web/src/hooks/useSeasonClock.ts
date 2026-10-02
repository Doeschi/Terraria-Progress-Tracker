import { useSyncExternalStore } from 'react'
import { isNewYear, isNight, logoThemeOf } from '@/lib/season'

// The seasonal easter eggs (G8) follow the clock while the app stays open: the date is checked once
// a minute, and what depends on it is rendered again when the season, the logo's look, New Year or
// the night (fireflies) changes - e.g. at midnight, without reloading the page.

const CHECK_EVERY = 60_000

const keyNow = () => `${logoThemeOf()}|${isNewYear()}|${isNight()}`

let current = keyNow()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer)
    timer = setInterval(() => {
      const next = keyNow()
      if (next === current) return
      current = next
      for (const l of listeners) l()
    }, CHECK_EVERY)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** Changes when the seasonal state changes (checked once a minute): a dependency for whatever reads
 * the season, the logo theme, New Year or the night. */
export function useSeasonClock(): string {
  return useSyncExternalStore(subscribe, () => current)
}
