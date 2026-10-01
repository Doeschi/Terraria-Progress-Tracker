import { useMemo } from 'react'
import { usePrefs } from '@/lib/prefs'
import { seasonOf } from '@/lib/season'

/** A little pixel snow falling in the header at Christmas (G8; CSS in index.css). */
export function HeaderSnow() {
  const enabled = usePrefs((s) => s.layout.easterEggs)
  // fixed for the session: random positions, durations and delays per flake
  const flakes = useMemo(
    () =>
      Array.from({ length: 28 }, () => ({
        left: `${Math.random() * 100}%`,
        animationDuration: `${4 + Math.random() * 5}s`,
        animationDelay: `${-Math.random() * 9}s`,
        scale: Math.random() < 0.3 ? 1.5 : 1,
      })),
    [],
  )
  if (!enabled || seasonOf() !== 'christmas') return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {flakes.map(({ scale, ...style }, i) => (
        <span key={i} className="egg-snowflake" style={{ ...style, width: 4 * scale, height: 4 * scale }} />
      ))}
    </div>
  )
}
