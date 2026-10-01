import { toast } from 'sonner'
import { AchievementToast } from '@/components/CompletionToast'
import { confettiBurst, GOLD_COLORS } from './confetti'
import { prefersReducedMotion } from './season'
import { usePrefs } from './prefs'
import { useStore } from '@/store'

const prefsNow = () => usePrefs.getState()

// Easter eggs (G8): short visual effects and achievement-style toasts. Nothing here changes data
// or blocks the app; motion is left out with "reduced motion" (the toast still shows).

const BEE = 'https://terraria.wiki.gg/images/Bee.gif'
const BUNNY = 'https://terraria.wiki.gg/images/Bunny.gif'

/** The icon of an item (key) from the loaded data, for the toasts. */
export const itemIcon = (key: string) => useStore.getState().data?.itemsByKey.get(key)?.icon

export function achievement(title: string, text: string, icon?: string) {
  toast.custom(
    () => (
      <AchievementToast title={title} icon={icon}>
        <div className="text-xs">{text}</div>
      </AchievementToast>
    ),
    { position: 'top-center', duration: 5000 },
  )
}

/** A class on <html> for `ms` milliseconds (CSS in index.css). */
function classFor(name: string, ms: number, after?: string) {
  const root = document.documentElement
  root.classList.add(name)
  setTimeout(() => {
    root.classList.remove(name)
    if (after) {
      root.classList.add(after)
      setTimeout(() => root.classList.remove(after), 800)
    }
  }, ms)
}

/** The page upside down for a few seconds. */
export function flipPage(ms = 4000) {
  if (!prefersReducedMotion()) classFor('egg-flip', ms, 'egg-unflip')
}

/** Wobbly, swapped colors for a few seconds. */
export function drunk(ms = 5000) {
  if (!prefersReducedMotion()) classFor('egg-drunk', ms)
}

/** Red accents until the page is reloaded (or for `ms`). */
export function worthy(ms?: number) {
  document.documentElement.classList.add('egg-worthy')
  if (ms) setTimeout(() => document.documentElement.classList.remove('egg-worthy'), ms)
}

/** Fixed-position image that removes itself after its animation. */
function sprite(src: string, size: number, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  const img = document.createElement('img')
  img.src = src
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  Object.assign(img.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${size}px`,
    height: 'auto',
    pointerEvents: 'none',
    zIndex: '9998',
    imageRendering: 'pixelated',
  })
  document.body.appendChild(img)
  img.animate(keyframes, options).finished.finally(() => img.remove())
}

/** Bees buzzing across the screen. */
export function bees(count = 14) {
  if (prefersReducedMotion()) return
  const w = window.innerWidth
  const h = window.innerHeight
  for (let i = 0; i < count; i++) {
    const fromLeft = Math.random() < 0.5
    const y = Math.random() * h * 0.8 + h * 0.1
    const steps = Array.from({ length: 6 }, (_, k) => {
      const t = k / 5
      const x = fromLeft ? -40 + t * (w + 80) : w + 40 - t * (w + 80)
      const yy = y + Math.sin(t * Math.PI * 4 + i) * 40 + (Math.random() - 0.5) * 30
      return { transform: `translate(${x}px, ${yy}px) scaleX(${fromLeft ? -1 : 1})` }
    })
    sprite(BEE, 22, steps, { duration: 3500 + Math.random() * 2500, delay: Math.random() * 1500, easing: 'linear' })
  }
}

/** A bunny hopping along the bottom of the screen. */
export function bunny() {
  if (prefersReducedMotion()) return
  const w = window.innerWidth
  const y = window.innerHeight - 34
  const hops = 14
  const frames: Keyframe[] = []
  for (let k = 0; k <= hops * 2; k++) {
    const x = -40 + (k / (hops * 2)) * (w + 80)
    frames.push({ transform: `translate(${x}px, ${y - (k % 2 ? 18 : 0)}px) scaleX(-1)` })
  }
  sprite(BUNNY, 30, frames, { duration: 9000, easing: 'linear' })
}

/** Lots of confetti from several places. */
export function bigConfetti(colors?: string[]) {
  const w = window.innerWidth
  for (const [x, delay] of [
    [w * 0.2, 0],
    [w * 0.5, 250],
    [w * 0.8, 500],
  ] as const)
    setTimeout(() => confettiBurst(x, 60, 160, 120, colors), delay)
}

export const goldConfetti = () => bigConfetti(GOLD_COLORS)

/** Checking the Rod of Discord: its row blinks away and back, like a teleport (once a session). */
let rodUsed = false
export function rodOfDiscord(from: Element | null) {
  if (rodUsed || !prefsNow().layout.easterEggs) return
  rodUsed = true
  const row = from?.closest('tr')
  if (row && !prefersReducedMotion())
    row.animate(
      [
        { transform: 'none', opacity: 1, filter: 'none' },
        { transform: 'translateX(60px)', opacity: 0, filter: 'drop-shadow(0 0 6px #c86bff)', offset: 0.35 },
        { transform: 'translateX(-60px)', opacity: 0, offset: 0.36 },
        { transform: 'none', opacity: 1, filter: 'drop-shadow(0 0 6px #c86bff)', offset: 0.75 },
        { transform: 'none', opacity: 1, filter: 'none' },
      ],
      { duration: 900, easing: 'ease-out' },
    )
  achievement('Whoosh!', 'Teleported – and no Chaos State this time.', itemIcon('RodofDiscord'))
}
