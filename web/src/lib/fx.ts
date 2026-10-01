import { spriteOf } from './sprites'

// A tiny effects engine for the weapon easter eggs (G8): sprites that fly, fall, bounce and fade
// on a temporary full-screen canvas that ignores the mouse. Physics in 60 fps steps.

export interface Drawable {
  /** draws the sprite centered at (0, 0) */
  draw(ctx: CanvasRenderingContext2D): void
}

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  /** rotation in radians; `spin` per step */
  rot?: number
  spin?: number
  /** downward acceleration per step */
  gravity?: number
  /** milliseconds alive / until it fades out (last 400 ms) */
  age?: number
  life: number
  sprite: Drawable
  /** custom behavior each step; return false to remove it */
  update?(p: Projectile, step: number, w: number, h: number): boolean | void
  /** drawn before the sprite (trails) */
  under?(ctx: CanvasRenderingContext2D, p: Projectile): void
}

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let items: Projectile[] = []
let last = 0

export function spawn(...ps: Projectile[]) {
  for (const p of ps) items.push({ age: 0, rot: 0, spin: 0, gravity: 0, ...p })
  if (canvas) return
  canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '9997',
  })
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.imageSmoothingEnabled = false
  last = performance.now()
  requestAnimationFrame(frame)
}

function frame(now: number) {
  if (!ctx || !canvas) return
  const dt = Math.min(50, now - last)
  last = now
  const step = dt / (1000 / 60)
  const w = window.innerWidth
  const h = window.innerHeight
  ctx.clearRect(0, 0, w, h)
  items = items.filter((p) => {
    p.age! += dt
    if (p.age! > p.life) return false
    p.vy += p.gravity! * step
    p.x += p.vx * step
    p.y += p.vy * step
    p.rot! += p.spin! * step
    if (p.update?.(p, step, w, h) === false) return false
    ctx!.globalAlpha = Math.max(0, Math.min(1, (p.life - p.age!) / 400))
    p.under?.(ctx!, p)
    ctx!.save()
    ctx!.translate(p.x, p.y)
    ctx!.rotate(p.rot!)
    p.sprite.draw(ctx!)
    ctx!.restore()
    return true
  })
  ctx.globalAlpha = 1
  if (items.length) requestAnimationFrame(frame)
  else {
    canvas.remove()
    canvas = ctx = null
  }
}

/** A pixel-art sprite from rows of color chars ('.' = transparent), `scale` px per pixel. */
export function pixelSprite(rows: readonly string[], colors: Record<string, string>, scale: number): Drawable {
  const w = rows[0].length * scale
  const h = rows.length * scale
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.' || !colors[ch]) return
      g.fillStyle = colors[ch]
      g.fillRect(x * scale, y * scale, scale, scale)
    }),
  )
  return { draw: (ctx) => ctx.drawImage(c, -w / 2, -h / 2) }
}

/** A wiki icon as a sprite (from the sprite sheets, else the wiki), `scale` times its size. */
export function iconSprite(src: string | undefined, scale: number): Drawable {
  const sprite = spriteOf(src)
  const img = new Image()
  img.src = sprite ? `${import.meta.env.BASE_URL}${sprite.file}` : (src ?? '')
  return {
    draw(ctx) {
      if (!img.complete || !img.naturalWidth) return
      const [sx, sy, sw, sh] = sprite ? [sprite.x, sprite.y, sprite.w, sprite.h] : [0, 0, img.width, img.height]
      ctx.drawImage(img, sx, sy, sw, sh, (-sw * scale) / 2, (-sh * scale) / 2, sw * scale, sh * scale)
    },
  }
}

/** Bounce off the window edges; returns how often it bounced in this step. */
export function bounceInWindow(p: Projectile, w: number, h: number, margin = 12): number {
  let n = 0
  if (p.x < margin || p.x > w - margin) {
    p.vx = -p.vx
    p.x = Math.max(margin, Math.min(w - margin, p.x))
    n++
  }
  if (p.y < margin || p.y > h - margin) {
    p.vy = -p.vy
    p.y = Math.max(margin, Math.min(h - margin, p.y))
    n++
  }
  return n
}
