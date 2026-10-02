import { useStore } from '@/store'
import { iconSprite, spawn } from './fx'
import { prefersReducedMotion } from './season'

// Bestiary complete (G8): a parade of critters across the bottom of the window, right to left
// (the game's sprites face left): hoppers, walkers and flyers, with a golden bunny at the end.

type Gait = 'hop' | 'walk' | 'fly'

const PARADE: [name: string, gait: Gait][] = [
  ['Bunny', 'hop'],
  ['Squirrel', 'walk'],
  ['Bird', 'fly'],
  ['Frog', 'hop'],
  ['Butterfly', 'fly'],
  ['Mouse', 'walk'],
  ['Duck', 'walk'],
  ['Dragonfly', 'fly'],
  ['Turtle', 'walk'],
  ['Gold Bunny', 'hop'],
]

const GAP = 80
const SPEED = 2.4

export function critterParade() {
  if (prefersReducedMotion()) return
  const entries = useStore.getState().data?.bestiary.entries ?? []
  const w = window.innerWidth
  const h = window.innerHeight
  PARADE.forEach(([name, gait], k) => {
    const icon = entries.find((e) => e.name === name)?.icon
    if (!icon) return
    const x = w + 40 + k * GAP
    const ground = h - 24
    const phase = k * 0.9
    spawn({
      x,
      y: gait === 'fly' ? h - 110 : ground,
      vx: -SPEED * (gait === 'walk' ? 0.85 : 1),
      vy: 0,
      // until it has left the window on the left
      life: ((x + 80) / SPEED) * (1000 / 60) * 1.3,
      // the wiki's GIF, not the still frame of the sprite sheets
      sprite: iconSprite(icon, 1, true),
      update(p) {
        const t = p.age! / 1000
        if (gait === 'hop') p.y = ground - Math.abs(Math.sin(t * 5 + phase)) * 26
        else if (gait === 'walk') p.y = ground - Math.abs(Math.sin(t * 9 + phase)) * 2
        else p.y = h - 110 + Math.sin(t * 3 + phase) * 30
        return p.x > -60
      },
    })
  })
}
