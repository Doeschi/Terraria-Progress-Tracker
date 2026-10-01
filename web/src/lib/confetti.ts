// A short burst of pixel confetti in the style of Terraria's (Confetti Gun, parties): small
// single-colored squares that tumble - flipping between wide and thin like a 2D sprite - and
// fall. Drawn on a temporary full-screen canvas that ignores the mouse.

import { prefersReducedMotion, seasonOf } from './season'

// the game's confetti colors; orange and purple at Halloween
export const CONFETTI_COLORS = ['#ff4b4b', '#4bdc4b', '#4b8cff', '#ffd23c', '#ff6ee6']
export const HALLOWEEN_COLORS = ['#ff7a1a', '#ffb02e', '#8a3cff', '#3d2a52', '#ff7a1a']
export const GOLD_COLORS = ['#ffd23c', '#f5b81c', '#fff1a8', '#d9a93a', '#ffe680']
// one "game pixel" in screen pixels: flakes are 2×2 game pixels, positions snap to it
const PX = 2
const DURATION = 3000
const FADE = 500

interface Flake {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  /** tumble angle and speed: the width is |cos| of it */
  spin: number
  spinSpeed: number
  sway: number
}

/**
 * Burst from a line around (x, y) (± `spread`) in viewport pixels, e.g. a toast. Skipped for
 * reduced motion. Colors: the game's (orange at Halloween) unless given.
 */
export function confettiBurst(x: number, y: number, count = 140, spread = 160, colors?: string[]) {
  if (typeof window === 'undefined' || prefersReducedMotion()) return
  const palette = colors ?? (seasonOf() === 'halloween' ? HALLOWEEN_COLORS : CONFETTI_COLORS)
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '9999',
    imageRendering: 'pixelated',
  })
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.remove()
  ctx.scale(dpr, dpr)

  const flakes: Flake[] = Array.from({ length: count }, () => {
    // mostly sideways and upwards, like a party popper
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
    const speed = 7 + Math.random() * 11
    return {
      // across the width of the toast
      x: x + (Math.random() - 0.5) * spread * 2,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.8,
      size: (Math.random() < 0.3 ? 3 : 2) * PX,
      color: palette[Math.floor(Math.random() * palette.length)],
      spin: Math.random() * Math.PI,
      spinSpeed: 0.15 + Math.random() * 0.25,
      sway: Math.random() * Math.PI * 2,
    }
  })

  const start = performance.now()
  let last = start
  const frame = (now: number) => {
    const t = now - start
    // physics in 60 fps steps, whatever the display rate
    const step = Math.min(3, (now - last) / (1000 / 60))
    last = now
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    ctx.globalAlpha = t > DURATION - FADE ? Math.max(0, (DURATION - t) / FADE) : 1
    for (const f of flakes) {
      f.vy += 0.28 * step // gravity
      f.vx *= Math.pow(0.975, step) // air drag
      f.vy = Math.min(f.vy, 3.2) // flutters down slowly
      f.sway += 0.1 * step
      f.x += (f.vx + Math.sin(f.sway) * 0.6) * step
      f.y += f.vy * step
      f.spin += f.spinSpeed * step
      // tumbling: full width, thinner, a line - in whole game pixels
      const w = Math.max(PX, Math.round((Math.abs(Math.cos(f.spin)) * f.size) / PX) * PX)
      const snap = (v: number) => Math.round(v / PX) * PX
      ctx.fillStyle = f.color
      ctx.fillRect(snap(f.x - w / 2), snap(f.y - f.size / 2), w, f.size)
    }
    if (t < DURATION) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
