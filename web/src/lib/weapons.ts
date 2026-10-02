import { create } from 'zustand'
import { bounceInWindow, iconSprite, pixelSprite, spawn, type Projectile } from './fx'
import { confettiBurst } from './confetti'
import { achievement, itemIcon } from './eggs'
import { PLANTS } from './logoArt'
import { prefersReducedMotion } from './season'

// Weapon easter eggs (G8): on some visits, special weapons the player has checked show a bigger
// icon in the list. Click it to pick the weapon up, click to swing it (again and again) - with an effect like
// in the game (own pixel art). `?weapons=awake` wakes them up for testing.

/** On about 1 in 4 visits the weapons are "awake" (their big icons are shown). */
export const weaponsAwake = (() => {
  try {
    if (new URLSearchParams(window.location.search).get('weapons') === 'awake') return true
  } catch {
    // ignore
  }
  return Math.random() < 0.25
})()

/** Picking up needs a mouse (or pen) and motion. */
export const canWield = () =>
  !prefersReducedMotion() && typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches

type Vec = { x: number; y: number }
/** origin: where the weapon was swung; dir: unit vector of the swing */
type Effect = (origin: Vec, dir: Vec) => void

const rand = (a: number, b: number) => a + Math.random() * (b - a)

// ------------------------------------------------------------------ sprites (own pixel art)

const CAT = pixelSprite(
  [
    '.K......K.',
    'KPK....KPK',
    'KWWKKKKWWK',
    'KWWWWWWWWK',
    'KWKWWWWKWK',
    'KWWWPPWWWK',
    'KWWWWWWWWK',
    '.KWWWWWWK.',
    '..KKKKKK..',
  ],
  { K: '#1d1a26', W: '#ececf2', P: '#ff8fb1' },
  3,
)
const RAINBOW = ['#ff4b4b', '#ff9b2e', '#ffe14a', '#4bdc4b', '#4b8cff', '#a259ff']

const STAR_ROWS = ['....Y....', '....Y....', '...YYY...', 'YYYYWYYYY', '...YYY...', '...Y.Y...', '..Y...Y..']
const PINK_STAR = pixelSprite(STAR_ROWS, { Y: '#ff6ec7', W: '#ffffff' }, 3)
const GOLD_STAR = pixelSprite(STAR_ROWS, { Y: '#ffd23c', W: '#ffffff' }, 3)

const BEAM_ROWS = ['...GGGGG....', '.GGLLLLLGG..', 'GLLWWWWWLLGG', '.GGLLLLLGG..', '...GGGGG....']
const PURPLE_BEAM = pixelSprite(BEAM_ROWS, { G: '#6a2bb0', L: '#a76bf0', W: '#f1e4ff' }, 4)

const PUMPKIN = pixelSprite(
  ['...FF....', '..FFFF...', '....S....', '.KOOOOOK.', 'KOYOOOYOK', 'KOOOOOOOK', 'KOOYYYOOK', '.KOOOOOK.', '..KKKKK..'],
  { F: '#ffd23c', S: '#5a8a2a', K: '#1d1a26', O: '#ff7a1a', Y: '#ffe14a' },
  3,
)
const SEED = pixelSprite(['.b.', 'bBb', '.b.'], { B: '#a8703a', b: '#6e4520' }, 3)
const SPROUT = pixelSprite(PLANTS.sprout.slice(2), { K: '#1d1a26', G: '#4cc96a', g: '#23863f', S: '#6aa84f' }, 2)

// ------------------------------------------------------------------ effects

/** A cat with a rainbow trail that bounces off the window edges a few times. */
const meowmere: Effect = (o, d) => {
  const trail: Vec[] = []
  let bounces = 0
  spawn({
    x: o.x,
    y: o.y,
    vx: d.x * 10,
    vy: d.y * 10,
    life: 7000,
    sprite: CAT,
    update(p, _s, w, h) {
      trail.push({ x: p.x, y: p.y })
      if (trail.length > 28) trail.shift()
      bounces += bounceInWindow(p, w, h, 16)
      // fades out after a few bounces
      if (bounces >= 5 && p.life > p.age! + 400) p.life = p.age! + 400
    },
    under(ctx) {
      trail.forEach((t, i) =>
        RAINBOW.forEach((c, k) => {
          ctx.fillStyle = c
          ctx.fillRect(t.x - 4, t.y - 9 + k * 3, 6, 3 + (i % 2))
        }),
      )
    },
  })
}

/** Ghost copies of famous swords swirl around the cursor and fade. */
const zenith: Effect = (o) => {
  const keys = ['TerraBlade', 'Starfury', 'Meowmere', 'InfluxWaver', 'StarWrath', 'TheHorsemansBlade']
  keys.forEach((key, k) => {
    const a0 = (k / keys.length) * Math.PI * 2
    spawn({
      x: o.x,
      y: o.y,
      vx: 0,
      vy: 0,
      life: 1800,
      sprite: iconSprite(itemIcon(key), 1.5),
      update(p) {
        const t = p.age! / p.life
        const a = a0 + t * Math.PI * 3
        const r = Math.sin(Math.PI * t) * 140
        p.x = o.x + Math.cos(a) * r * 1.3
        p.y = o.y + Math.sin(a) * r * 0.8
        p.rot = a + Math.PI / 4
      },
    })
  })
}

/** Stars fall from the top of the window onto the spot; a sparkle where they land. */
const fallingStars =
  (sprite: Projectile['sprite'], count: number, colors: string[]): Effect =>
  (o) => {
    for (let k = 0; k < count; k++) {
      const tx = o.x + (k - (count - 1) / 2) * 40
      const sx = tx - 220 + rand(-30, 30)
      const sy = -30 - k * 60
      const len = Math.hypot(tx - sx, o.y - sy)
      const speed = 14
      spawn({
        x: sx,
        y: sy,
        vx: ((tx - sx) / len) * speed,
        vy: ((o.y - sy) / len) * speed,
        spin: 0.25,
        life: 5000,
        sprite,
        update(p) {
          if (p.y >= o.y) {
            confettiBurst(p.x, p.y, 14, 4, colors)
            return false
          }
        },
      })
    }
  }

/** A sword beam straight across the window. */
const beam =
  (sprite: Projectile['sprite'], speed: number): Effect =>
  (o, d) =>
    spawn({
      x: o.x,
      y: o.y,
      vx: d.x * speed,
      vy: d.y * speed,
      rot: Math.atan2(d.y, d.x),
      life: 4000,
      sprite,
      update: (p, _s, w, h) => p.x > -40 && p.x < w + 40 && p.y > -40 && p.y < h + 40,
    })

/** Terra Blade: a green shockwave - crescents that grow out of the swing and fade. */
const terraBlade: Effect = (o, d) => {
  const wave = (delay: number, reach: number) =>
    setTimeout(() => {
      let t = 0
      spawn({
        x: o.x,
        y: o.y,
        vx: d.x * 2.5,
        vy: d.y * 2.5,
        rot: Math.atan2(d.y, d.x),
        life: 750,
        sprite: {
          draw(ctx) {
            const r = 20 + t * reach
            ctx.lineCap = 'round'
            for (const [color, width] of [
              ['#1f8a3a', 18],
              ['#5be37a', 10],
              ['#e9ffe9', 4],
            ] as const) {
              ctx.strokeStyle = color
              ctx.lineWidth = width * (1 - t * 0.7)
              ctx.beginPath()
              ctx.arc(0, 0, r, -1.1, 1.1)
              ctx.stroke()
            }
          },
        },
        update(p) {
          t = p.age! / p.life
        },
      })
    }, delay)
  wave(0, 180)
  wave(120, 120)
}

/** Flaming pumpkin heads that bounce along the bottom of the window. */
const horseman: Effect = (o, d) => {
  for (let k = 0; k < 3; k++) {
    let bounces = 0
    spawn({
      x: o.x,
      y: o.y,
      vx: d.x * rand(4, 8) + rand(-2, 2),
      vy: rand(-9, -5),
      gravity: 0.35,
      life: 5000,
      sprite: PUMPKIN,
      update(p, _s, w, h) {
        p.spin = p.vx * 0.03
        if (p.y > h - 16) {
          p.y = h - 16
          p.vy *= -0.6
          p.vx *= 0.85
          if (++bounces >= 4 && p.life > p.age! + 400) p.life = p.age! + 400
        }
        if (p.x < 16 || p.x > w - 16) p.vx = -p.vx
      },
    })
  }
}

/** A small swarm of bees in the swing direction. */
const beeKeeper: Effect = (o, d) => {
  for (let k = 0; k < 9; k++) {
    const phase = rand(0, Math.PI * 2)
    const speed = rand(4, 8)
    spawn({
      x: o.x,
      y: o.y,
      vx: d.x * speed + rand(-1.5, 1.5),
      vy: d.y * speed + rand(-1.5, 1.5),
      life: 2600,
      sprite: iconSprite('https://terraria.wiki.gg/images/Bee.gif', 1.2, true),
      update(p) {
        p.y += Math.sin(p.age! / 90 + phase) * 1.4
      },
    })
  }
}

/** Seeds fly out, land at the bottom of the window and sprout for a moment. */
const seedler: Effect = (o, d) => {
  for (let k = 0; k < 6; k++)
    spawn({
      x: o.x,
      y: o.y,
      vx: d.x * rand(3, 9) + rand(-2, 2),
      vy: rand(-8, -4),
      gravity: 0.4,
      spin: 0.3,
      life: 5000,
      sprite: SEED,
      update(p, _s, _w, h) {
        if (p.y < h - 6) return
        spawn({
          x: p.x,
          y: h - 18,
          vx: 0,
          vy: 0,
          life: 1800,
          sprite: SPROUT,
        })
        return false
      },
    })
}

/** No swing - a little stab - and the truth about it. */
const copperShortsword: Effect = () =>
  achievement('The ultimate weapon.', 'Nothing can stop you now.', itemIcon('CopperShortsword'))

export interface Weapon {
  effect: Effect
  /** a stab instead of a swing */
  stab?: boolean
}

/** Item key -> the weapon's easter egg. */
export const WEAPONS: Record<string, Weapon> = {
  Meowmere: { effect: meowmere },
  Zenith: { effect: zenith },
  StarWrath: { effect: fallingStars(PINK_STAR, 3, ['#ff6ec7', '#ffffff', '#ffb3e0']) },
  Starfury: { effect: fallingStars(GOLD_STAR, 1, ['#ffd23c', '#ffffff', '#fff1a8']) },
  TerraBlade: { effect: terraBlade },
  NightsEdge: { effect: beam(PURPLE_BEAM, 11) },
  TheHorsemansBlade: { effect: horseman },
  BeeKeeper: { effect: beeKeeper },
  Seedler: { effect: seedler },
  CopperShortsword: { effect: copperShortsword, stab: true },
}

/** The weapon being carried (picked up from the list), if any. */
export const useHeldWeapon = create<{
  /** the weapon and where it was picked up (the mouse position) */
  held: { key: string; icon?: string; x: number; y: number } | null
  pickUp(key: string, icon: string | undefined, x: number, y: number): void
  drop(): void
}>()((set) => ({
  held: null,
  pickUp: (key, icon, x, y) => set({ held: { key, icon, x, y } }),
  drop: () => set({ held: null }),
}))
