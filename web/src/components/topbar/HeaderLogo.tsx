import { useMemo, useRef, useState } from 'react'
import { usePrefs } from '@/lib/prefs'
import { isNewYear, isNight, logoThemeOf, prefersReducedMotion } from '@/lib/season'
import { useSeasonClock } from '@/hooks/useSeasonClock'
import type { PlantStage } from '@/lib/logoArt'
import { achievement, itemIcon } from '@/lib/eggs'
import { confettiBurst } from '@/lib/confetti'
import { useTrophies } from '@/lib/trophies'
import { Logo } from '../Logo'
import { LogoArt } from '../LogoArt'

// The logo in the header, with an easter egg (G8): every click wiggles the sprout and fills the
// progress bar a bit; after 10 clicks a tree grows out of it and stays in the logo; a few more
// clicks chop it down. Only for this session; plain logo with easter eggs off.
// Seasonal (lib/season.ts, `?date=` to test): the look of the logo and its tree, fireworks on
// clicks at New Year, fireflies at night. A playthrough with all items and the whole bestiary
// shows a golden tree (the trophy: it sways and sparkles, but cannot be chopped).

const CLICKS_TO_GROW = 10
const CHOPS = 3
const LOGO_FILL = 9 // the bar of the normal logo
const WOOD = ['#a8703a', '#6e4520', '#c48a4f', '#4cc96a']
const FIREWORKS = ['#ffd23c', '#ff4b4b', '#4b8cff', '#ff6ee6', '#ffffff']
const GOLD = ['#ffd23c', '#f5c542', '#fff1a8', '#ffffff']

export function HeaderLogo() {
  const enabled = usePrefs((s) => s.layout.easterEggs)
  const [stage, setStage] = useState<PlantStage>('sprout')
  const [clicks, setClicks] = useState(0)
  const [chops, setChops] = useState(0)
  const busy = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const plantRef = useRef<SVGGElement>(null)
  // fixed for the session (the date does not change while the page is open, near enough)
  // follows the clock while the app stays open: fireflies from midnight, the look of a special day
  const clock = useSeasonClock()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const season = useMemo(() => ({ theme: logoThemeOf(), newYear: isNewYear(), night: isNight() }), [clock])
  const golden = useTrophies((s) => s.all)

  if (!enabled) return <Logo size={32} />

  const motion = !prefersReducedMotion()
  const fill = stage === 'sprout' ? LOGO_FILL + ((14 - LOGO_FILL) * clicks) / CLICKS_TO_GROW : 14

  const sway = (deg: number, ms: number) =>
    motion &&
    plantRef.current?.animate(
      [
        { transform: 'rotate(0)' },
        { transform: `rotate(${-deg}deg)` },
        { transform: `rotate(${deg}deg)` },
        { transform: 'rotate(0)' },
      ],
      { duration: ms, easing: 'ease-in-out' },
    )

  const grow = async () => {
    busy.current = true
    const svg = svgRef.current
    // pops up in place while it grows (from its center, staying within the header), then back
    // to logo size
    const big =
      motion &&
      svg?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.75 }, { transform: 'scale(1.5)' }],
        {
          duration: 1500,
          easing: 'ease-out',
          fill: 'forwards',
        },
      )
    for (const [s, at] of [
      ['sapling', 0],
      ['young', 500],
      ['tree', 1000],
    ] as const)
      setTimeout(() => setStage(s), motion ? at : 0)
    if (big) {
      await big.finished
      await svg!.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-in' })
        .finished
      big.cancel()
    }
    achievement('From tiny sprouts…', '…mighty trees grow.', itemIcon('Acorn'))
    busy.current = false
  }

  const chop = async () => {
    busy.current = true
    const r = svgRef.current?.getBoundingClientRect()
    if (r) confettiBurst(r.left + r.width / 2, r.top + r.height * 0.6, 40, 10, WOOD)
    if (motion)
      await plantRef.current?.animate(
        [
          { transform: 'rotate(0)', opacity: 1 },
          { transform: 'rotate(90deg)', opacity: 0 },
        ],
        {
          duration: 700,
          easing: 'ease-in',
          fill: 'forwards',
        },
      ).finished
    plantRef.current?.getAnimations().forEach((a) => a.cancel())
    achievement('Timber!', 'Back to a little sprout.', itemIcon('Wood'))
    setStage('sprout')
    setClicks(0)
    setChops(0)
    busy.current = false
  }

  const onClick = () => {
    if (golden) {
      const r = svgRef.current?.getBoundingClientRect()
      if (r) confettiBurst(r.left + r.width / 2, r.top + r.height * 0.4, 24, 5, GOLD)
      sway(6, 400)
      return
    }
    if (season.newYear) {
      const r = svgRef.current?.getBoundingClientRect()
      if (r) confettiBurst(r.left + r.width / 2, r.top + 4, 45, 6, FIREWORKS)
    }
    if (busy.current) return
    if (stage === 'tree') {
      const n = chops + 1
      if (n >= CHOPS) void chop()
      else {
        setChops(n)
        sway(6, 300)
      }
      return
    }
    if (stage !== 'sprout') return
    const n = clicks + 1
    setClicks(n)
    if (n >= CLICKS_TO_GROW) void grow()
    else sway(12, 450)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative z-50 shrink-0 cursor-default rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="Terraria Progress Tracker"
    >
      <LogoArt
        size={32}
        stage={golden ? 'tree' : stage}
        fill={golden ? 14 : fill}
        theme={golden ? 'golden' : season.theme}
        svgRef={svgRef}
        plantRef={plantRef}
        style={{ transformOrigin: '50% 50%' }}
      />
      {season.night && motion && (
        // fireflies late at night
        <span className="pointer-events-none absolute inset-0" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={`egg-firefly egg-firefly-${n}`} />
          ))}
        </span>
      )}
    </button>
  )
}
