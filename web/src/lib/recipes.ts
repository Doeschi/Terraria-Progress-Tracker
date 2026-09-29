import type { GameData, Ingredient, Item, PlatformId, Recipe } from './types'
import { playerPlaced, scanContainers, type ChestDetection, type LoadedWorld } from './world'

// Crafting recipes: which items have a recipe and which can be crafted right
// now - from the obtained (checked) items or from the player's chests. Only
// direct crafting counts (no intermediate steps).

// entry ids of the "Crafting" filter group
export const CRAFT_HAS_RECIPE = 'has-recipe'
export const CRAFT_OBTAINED = 'from-obtained'
export const CRAFT_CHESTS = 'from-chests'

/** How many of an item are available (Infinity = "have it", amounts do not matter). */
export type Stock = (key: string) => number

export const recipeOnPlatform = (r: Recipe, platform: PlatformId) => !r.platforms || r.platforms.includes(platform)

/** Recipes for an item on the playthrough's platform. */
export function recipesFor(data: GameData, key: string, platform: PlatformId): Recipe[] {
  return (data.recipes.byResult.get(key) ?? []).filter((r) => recipeOnPlatform(r, platform))
}

/** Items an ingredient accepts (a group accepts each of its items). */
export function ingredientItems(data: GameData, ing: Ingredient): string[] {
  if (ing.item) return [ing.item]
  if (ing.group) return data.recipes.groups.get(ing.group)?.items ?? []
  return []
}

/** Available amount of an ingredient; items of a group can be mixed, so they add up. */
function ingredientStock(data: GameData, ing: Ingredient, stock: Stock): number {
  return ingredientItems(data, ing).reduce((n, k) => n + stock(k), 0)
}

/** Is a station there? Conditions (By Hand, Water, …) always are. */
function stationAvailable(data: GameData, name: string, has: (key: string) => boolean): boolean {
  const st = data.recipes.stations.get(name)
  if (!st || st.condition) return true
  return (st.items ?? []).some(has)
}

/** `stations` = null: stations are not required. */
function canCraft(data: GameData, recipe: Recipe, stock: Stock, stations: ((key: string) => boolean) | null): boolean {
  if (stations && !recipe.stations.every((s) => stationAvailable(data, s, stations))) return false
  return recipe.ingredients.every((ing) => ingredientStock(data, ing, stock) >= ing.amount)
}

export interface CraftingInput {
  data: GameData
  items: Item[]
  platform: PlatformId
  checked: Set<string>
  /** item key -> amount in the player's chests; null without a loaded world */
  chests: Map<string, number> | null
  stationsRequired: boolean
}

/** Crafting filter entries per item key (items without any are left out). */
export function craftingEntries(input: CraftingInput): Map<string, string[]> {
  const { data, items, platform, checked, chests, stationsRequired } = input
  const obtainedStock: Stock = (k) => (checked.has(k) ? Infinity : 0)
  const obtainedStations = stationsRequired ? (k: string) => checked.has(k) : null
  const chestStock: Stock = (k) => chests?.get(k) ?? 0
  // a station counts if it is obtained or lies in a chest
  const chestStations = stationsRequired ? (k: string) => checked.has(k) || (chests?.has(k) ?? false) : null

  const result = new Map<string, string[]>()
  for (const item of items) {
    const recipes = recipesFor(data, item.key, platform)
    if (!recipes.length) continue
    const ids = [CRAFT_HAS_RECIPE]
    if (recipes.some((r) => canCraft(data, r, obtainedStock, obtainedStations))) ids.push(CRAFT_OBTAINED)
    if (chests && recipes.some((r) => canCraft(data, r, chestStock, chestStations))) ids.push(CRAFT_CHESTS)
    result.set(item.key, ids)
  }
  return result
}

/** Item key -> total amount in the chests the player placed (whole world). */
export function chestStock(
  data: GameData,
  world: LoadedWorld,
  detection: ChestDetection,
  platform: PlatformId,
): Map<string, number> {
  const player = playerPlaced(world, detection)
  const chests = world.containers.filter((c, i) => c.kind === 'chest' && player[i])
  const { found } = scanContainers(data, chests, platform)
  return new Map([...found].map(([key, f]) => [key, f.stack]))
}
