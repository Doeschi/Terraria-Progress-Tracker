// Seasons like the game's: Halloween (Oct 10 - Nov 1), Christmas (Dec 15 - 31), and Terraria's
// birthday (May 16, released 2011).

export type Season = 'halloween' | 'christmas' | 'birthday' | null

export function seasonOf(date = new Date()): Season {
  const m = date.getMonth() + 1
  const d = date.getDate()
  if ((m === 10 && d >= 10) || (m === 11 && d === 1)) return 'halloween'
  if (m === 12 && d >= 15) return 'christmas'
  if (m === 5 && d === 16) return 'birthday'
  return null
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
