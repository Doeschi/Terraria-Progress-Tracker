import type { LogoTheme } from './season'

// Pixel art of the logo (16 × 16): the plant above a progress bar. The sprout is the normal logo
// (public/favicon.svg); the tree stages and the seasonal looks belong to the logo easter eggs
// (HeaderLogo, G8). Own pixel art, no game sprites.

const PALETTE: Record<string, string> = {
  K: '#1d1a26', // outline
  G: '#4cc96a', // leaf, bar fill
  g: '#23863f', // leaf shade, bar fill shade
  S: '#6aa84f', // stem
  B: '#a8703a', // trunk
  b: '#6e4520', // trunk shade
  e: '#3a4152', // empty bar
  O: '#ff7a1a', // orange (pumpkin)
  o: '#c4580a',
  u: '#4b2a6b', // purple (Halloween bar)
  W: '#f5f5f5', // snow, fur
  R: '#e63b4e', // red
  r: '#9e1e30',
  P: '#ff9aa8', // pink
  Y: '#f5c542', // gold, star
  C: '#4b8cff', // blue
  V: '#a259ff', // violet
}

type Grid = readonly string[]

/** The plant (rows 0–10, above the bar). */
export const PLANTS = {
  sprout: [
    '................',
    '................',
    '..KKKK..........',
    '.KGGGGK.....KKK.',
    '.KGgggGK...KGGGK',
    '..KGGggGK.KGggGK',
    '...KKGGgSKGgGGK.',
    '.....KKKSKKKKK..',
    '.......KSK......',
    '.......KSK......',
    '........S.......',
  ],
  sapling: [
    '................',
    '................',
    '......KKK.......',
    '.....KGGGK......',
    '..KK.KGgGK.KK...',
    '.KGGKKGGGKKGGK..',
    '.KGgGKKSKKGgGK..',
    '..KKKKKSKKKKK...',
    '.......KSK......',
    '.......KSK......',
    '........S.......',
  ],
  young: [
    '................',
    '................',
    '......KKKK......',
    '.....KGGGGK.....',
    '....KGGgGGGK....',
    '....KGGGGgGK....',
    '....KGgGGGGK....',
    '.....KKbBKK.....',
    '......KbBK......',
    '......KbBK......',
    '......KbBK......',
  ],
  tree: [
    '.....KKKKKK.....',
    '...KKGGGGGGKK...',
    '..KGGGgGGGGGGK..',
    '.KGGGGGGGgGGGGK.',
    '.KGgGGGGGGGGgGK.',
    '.KGGGGGgGGGGGGK.',
    '..KGgGGGGGGgGK..',
    '...KKKKbBKKKK...',
    '......KbBKKK....',
    '......KbBK......',
    '.....KbbBBK.....',
  ],
} satisfies Record<string, Grid>

export type PlantStage = keyof typeof PLANTS

/** Pixels drawn over the plant: [x, y, color char]. */
type Overlay = readonly (readonly [number, number, string])[]

interface ThemeArt {
  /** colors replaced for this look */
  palette?: Record<string, string>
  /** other drawings for some stages */
  plants?: Partial<Record<PlantStage, Grid>>
  /** pixels drawn over a stage (hats, a pumpkin, balloons) */
  overlay?: Partial<Record<PlantStage, Overlay>>
  /** bar fill: the color char of inner pixel i (0–13) in the light / shade row */
  bar?: (i: number, shade: boolean) => string
  /** empty bar color char */
  empty?: string
  /** upside down (April Fools: the sprout grows downwards out of the bar) */
  flip?: boolean
}

const SANTA_HAT: Overlay = [
  [10, 1, 'W'],
  [9, 2, 'R'],
  [8, 3, 'R'],
  [9, 3, 'R'],
  [8, 4, 'R'],
  [9, 4, 'R'],
  [10, 4, 'R'],
  [7, 5, 'W'],
  [8, 5, 'W'],
  [9, 5, 'W'],
  [10, 5, 'W'],
]
// snow on the top edges of the leaves
const SNOW: Overlay = [
  [2, 3, 'W'],
  [3, 3, 'W'],
  [4, 3, 'W'],
  [5, 3, 'W'],
  [12, 4, 'W'],
  [13, 4, 'W'],
  [14, 4, 'W'],
]
const PARTY_HAT: Overlay = [
  [9, 1, 'Y'],
  [9, 2, 'P'],
  [8, 3, 'C'],
  [9, 3, 'C'],
  [8, 4, 'Y'],
  [9, 4, 'P'],
  [10, 4, 'Y'],
  [7, 5, 'P'],
  [8, 5, 'C'],
  [9, 5, 'P'],
  [10, 5, 'C'],
]
// a little jack-o'-lantern in the free space right of the stem
const PUMPKIN: Overlay = [
  [12, 8, 'S'],
  [10, 9, 'K'],
  [11, 9, 'Y'],
  [12, 9, 'O'],
  [13, 9, 'Y'],
  [14, 9, 'K'],
  [10, 10, 'K'],
  [11, 10, 'O'],
  [12, 10, 'Y'],
  [13, 10, 'o'],
  [14, 10, 'K'],
]
const BALLOONS: Overlay = [
  [13, 0, 'P'],
  [14, 0, 'P'],
  [13, 1, 'P'],
  [14, 1, 'r'],
  [14, 2, 'K'],
  [1, 0, 'C'],
  [2, 0, 'C'],
  [1, 1, 'C'],
  [2, 1, 'V'],
  [1, 2, 'K'],
]
const RAINBOW = ['R', 'O', 'Y', 'G', 'C', 'V']

const THEMES: Record<Exclude<LogoTheme, null>, ThemeArt> = {
  halloween: {
    palette: { G: '#ff8c1a', g: '#c4580a' },
    overlay: { sprout: PUMPKIN },
    plants: {
      // a bare, crooked tree with a jack-o'-lantern
      tree: [
        '................',
        '..K.....K....K..',
        '...K....K...K...',
        '...KK..KK..KK...',
        '....KK.KK.KK....',
        '.....KKKKKK.....',
        '......KKKK......',
        '......KbbK......',
        '......KbbK...S..',
        '......KbbK.KOOOK',
        '.....KbbbbKKYOYK',
      ],
    },
    bar: (_i, shade) => (shade ? 'o' : 'O'),
    empty: 'u',
  },
  christmas: {
    overlay: { sprout: [...SNOW, ...SANTA_HAT] },
    plants: {
      // a decorated pine with a star
      tree: [
        '.......Y........',
        '......YYY.......',
        '......KYK.......',
        '.....KGGGK......',
        '....KGGRGGK.....',
        '.....KGGGK......',
        '....KGGGGGK.....',
        '...KGCGGGYGK....',
        '..KGGGGRGGGGK...',
        '..KKKKKbKKKKK...',
        '......KbK.......',
      ],
    },
    // candy cane stripes
    bar: (i, shade) => (i % 2 ? (shade ? 'r' : 'R') : 'W'),
  },
  birthday: {
    overlay: { sprout: PARTY_HAT, tree: BALLOONS },
    bar: (i) => RAINBOW[i % RAINBOW.length],
  },
  valentine: {
    plants: {
      // two little hearts instead of leaves
      sprout: [
        '................',
        '................',
        '................',
        '.KK.KK....KK.KK.',
        'KRRKRRK..KRRKRRK',
        'KRPRRRK..KRRRPRK',
        '.KRRRK.SSSKRRRK.',
        '..KRK...S..KRK..',
        '...K....S...K...',
        '.......KSK......',
        '........S.......',
      ],
    },
    bar: (_i, shade) => (shade ? 'R' : 'P'),
  },
  aprilfools: { flip: true },
  // items and bestiary complete (G8): a golden tree on a full golden bar
  golden: {
    palette: { G: '#f5c542', g: '#c9971c', S: '#d9ac3a', B: '#b8860b', b: '#8a6508' },
  },
}

/** The bar (rows 11–14) with `fill` of its 14 inner pixels filled; the logo has 9. */
export function barRows(fill: number, theme: LogoTheme = null): string[] {
  const f = Math.max(0, Math.min(14, Math.round(fill)))
  const art = theme ? THEMES[theme] : undefined
  const row = (shade: boolean) =>
    Array.from({ length: 14 }, (_, i) =>
      i < f ? (art?.bar?.(i, shade) ?? (shade ? 'g' : 'G')) : (art?.empty ?? 'e'),
    ).join('')
  return ['KKKKKKKKKKKKKKKK', `K${row(false)}K`, `K${row(true)}K`, 'KKKKKKKKKKKKKKKK']
}

export interface Pixel {
  x: number
  y: number
  w: number
  fill: string
}

/** Rows of a pixel grid as rects (runs of one color merged), row offset `y0`. */
export function pixelRects(rows: Grid, y0 = 0, palette: Record<string, string> = PALETTE): Pixel[] {
  const out: Pixel[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x]
      let w = 1
      while (x + w < row.length && row[x + w] === ch) w++
      if (ch !== '.') out.push({ x, y: y + y0, w, fill: palette[ch] ?? PALETTE[ch] })
      x += w
    }
  })
  return out
}

/** The plant of a stage in a look: its pixels (overlay included) - and the bar's. */
export function logoPixels(stage: PlantStage, fill: number, theme: LogoTheme) {
  const art = theme ? THEMES[theme] : undefined
  const palette = { ...PALETTE, ...art?.palette }
  const grid = (art?.plants?.[stage] ?? PLANTS[stage]).map((r) => r.split(''))
  for (const [x, y, ch] of art?.overlay?.[stage] ?? []) grid[y][x] = ch
  return {
    plant: pixelRects(
      grid.map((r) => r.join('')),
      0,
      palette,
    ),
    bar: pixelRects(barRows(fill, theme), 11, palette),
    flip: !!art?.flip,
  }
}

/** The logo of a look as an SVG document (the tab icon). */
export function logoSvgMarkup(theme: LogoTheme): string {
  const { plant, bar, flip } = logoPixels('sprout', 9, theme)
  const rects = [...plant, ...bar]
    .map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="1" fill="${p.fill}"/>`)
    .join('')
  const body = flip ? `<g transform="translate(0 16) scale(1 -1)">${rects}</g>` : rects
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`
}
