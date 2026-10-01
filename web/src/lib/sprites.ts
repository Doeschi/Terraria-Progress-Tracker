import { useStore } from '@/store'
import type { GameData } from './types'

// Where a wiki icon sits in the app's sprite sheets (pipeline/build_icons.py).

const WIKI_IMAGES = 'https://terraria.wiki.gg/images/'

export interface Sprite {
  file: string
  sheetW: number
  sheetH: number
  x: number
  y: number
  w: number
  h: number
}

/** The icon's place in the sprite sheets, if it is packed there. */
export function findSprite(sprites: GameData['sprites'] | undefined, src?: string): Sprite | undefined {
  const hit = src?.startsWith(WIKI_IMAGES) ? sprites?.icons.get(src.slice(WIKI_IMAGES.length)) : undefined
  if (!hit || !sprites) return undefined
  const [n, x, y, w, h] = hit
  const sheet = sprites.sheets[n]
  return { file: sheet.file, sheetW: sheet.w, sheetH: sheet.h, x, y, w, h }
}

/** Like findSprite, with the loaded data (outside of components, e.g. for a canvas). */
export const spriteOf = (src?: string) => findSprite(useStore.getState().data?.sprites, src)
