// Seasons like the game's: Halloween (Oct 10 - Nov 1), Christmas (Dec 15 - 31), and Terraria's
// birthday (May 16, released 2011) - plus a few more for the logo (G8).
//
// Testing: `?date=2026-10-31` (or `?date=2026-06-01T02:30`) makes every seasonal easter egg use
// that date and time instead of the clock. Only for what is shown - nothing is saved, and
// "once a year" things are not used up.

export type Season = 'halloween' | 'christmas' | 'birthday' | null
export type LogoTheme = 'halloween' | 'christmas' | 'birthday' | 'aprilfools' | 'valentine' | null

const override = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get('date')
    const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
    // a date alone means noon (not "night")
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0)) : null
  } catch {
    return null
  }
})()

/** The date and time is set by `?date=` (testing). */
export const dateOverridden = override !== null

/** The current date and time - or the one from `?date=`. */
export const now = () => (override ? new Date(override) : new Date())

const md = (date: Date) => [date.getMonth() + 1, date.getDate()] as const

export function seasonOf(date = now()): Season {
  const [m, d] = md(date)
  if ((m === 10 && d >= 10) || (m === 11 && d === 1)) return 'halloween'
  if (m === 12 && d >= 15) return 'christmas'
  if (m === 5 && d === 16) return 'birthday'
  return null
}

/** The look of the logo (and the tab icon) today. */
export function logoThemeOf(date = now()): LogoTheme {
  const [m, d] = md(date)
  if (m === 4 && d === 1) return 'aprilfools'
  if (m === 2 && d === 14) return 'valentine'
  return seasonOf(date)
}

/** New Year's Eve and New Year's Day: fireworks when the logo is clicked. */
export function isNewYear(date = now()): boolean {
  const [m, d] = md(date)
  return (m === 12 && d === 31) || (m === 1 && d === 1)
}

/** Late at night (midnight to 5 am): fireflies around the logo. */
export const isNight = (date = now()) => date.getHours() < 5

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
