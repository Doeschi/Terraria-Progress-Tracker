import { plural } from './format'
import { npcIndex } from './npcs'
import type { GameData, Item } from './types'
import type { LoadedWorld } from './world'

// Enemy banners in a loaded world (REQUIREMENTS BE9): the game counts the kills per banner - all
// variants of an enemy together - and gives a banner every `bannerKills` kills (50, some more or
// less). Since 1.4.5 an earned banner is not dropped: it waits in the Banners Window next to the
// crafting menu until it is taken out.

export interface BannerState {
  item: Item
  /** kills in the world that count for the banner */
  kills: number
  /** kills one banner takes */
  needed: number
  /** banners earned so far */
  earned: number
  /** kills towards the next banner */
  towardsNext: number
  /** banners still in the Banners Window; null in worlds from before 1.4.5 */
  waiting: number | null
}

/** What the world says about a banner; undefined for other items and without a world. */
export function bannerState(world: LoadedWorld | null | undefined, item: Item | undefined): BannerState | undefined {
  if (!world || !item?.bannerId || !item.bannerKills) return undefined
  const kills = world.bannerKills[item.bannerId]
  if (kills === undefined) return undefined
  return {
    item,
    kills,
    needed: item.bannerKills,
    earned: Math.floor(kills / item.bannerKills),
    towardsNext: kills % item.bannerKills,
    waiting: world.bannersWaiting?.[item.bannerId] ?? null,
  }
}

/** The banner of a bestiary entry: the one its enemy gives. */
export function bannerOfEntry(data: GameData, entryId: string): Item | undefined {
  return npcIndex(data)
    .dropsOfEntry.get(entryId)
    ?.find((d) => d.item.banner)?.item
}

/** Every banner the world has earned at least once, by item key. */
export function earnedBanners(data: GameData, world: LoadedWorld): Map<string, BannerState> {
  const earned = new Map<string, BannerState>()
  for (const item of data.items) {
    const state = bannerState(world, item)
    if (state && state.earned > 0) earned.set(item.key, state)
  }
  return earned
}

/** "2 · 32/50": banners earned, and the kills towards the next one. */
export const bannerProgress = (s: BannerState) => `${s.earned} · ${s.towardsNext}/${s.needed}`

/** "132 kills · 2 banners earned · 1 in the Banners Window" */
export function bannerText(s: BannerState): string {
  return [
    plural(s.kills, 'kill'),
    `${plural(s.earned, 'banner')} earned`,
    s.waiting ? `${s.waiting} in the Banners Window` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
