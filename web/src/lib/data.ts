import type {
  BestiaryEntry,
  BestiaryType,
  Boss,
  BossStage,
  CoinEntry,
  Difficulty,
  Drop,
  DropSource,
  GameData,
  GroupEntry,
  IngredientGroup,
  Item,
  PlatformEntry,
  Recipe,
  RecipeData,
  Shimmer,
  Station,
  RarityEntry,
  VersionEntry,
} from './types'

async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`)
  if (!res.ok) throw new Error(`Could not load ${name}.json (HTTP ${res.status})`)
  return res.json() as Promise<T>
}

export async function loadGameData(): Promise<GameData> {
  const [
    items,
    categories,
    subcategories,
    obtain,
    vendors,
    events,
    biomes,
    times,
    platforms,
    versions,
    rarities,
    coins,
    drops,
    bosses,
    recipes,
    bestiary,
    difficulties,
  ] = await Promise.all([
    fetchJson<Item[]>('items'),
    fetchJson<GroupEntry[]>('categories'),
    fetchJson<GroupEntry[]>('subcategories'),
    fetchJson<GroupEntry[]>('obtain'),
    fetchJson<GroupEntry[]>('vendors'),
    fetchJson<GroupEntry[]>('events'),
    fetchJson<GroupEntry[]>('biomes'),
    fetchJson<GroupEntry[]>('times'),
    fetchJson<PlatformEntry[]>('platforms'),
    fetchJson<VersionEntry[]>('versions'),
    fetchJson<RarityEntry[]>('rarities'),
    fetchJson<CoinEntry[]>('coins'),
    fetchJson<{ sources: Record<string, DropSource>; items: Record<string, Drop[]> }>('drops'),
    fetchJson<{ stages: BossStage[]; bosses: Boss[]; ignoreItems: string[] }>('bosses'),
    fetchJson<RecipesFile>('recipes'),
    fetchJson<{ types: BestiaryType[]; entries: Omit<BestiaryEntry, 'key'>[] }>('bestiary'),
    fetchJson<{ id: Difficulty; name: string; icon?: string }[]>('difficulties'),
  ])
  const itemsByKey = new Map(items.map((i) => [i.key, i]))
  const itemsById = new Map<number, Item[]>()
  for (const item of items) {
    const list = itemsById.get(item.id)
    if (list) list.push(item)
    else itemsById.set(item.id, [item])
  }
  return {
    items,
    itemsByKey,
    itemsById,
    categories,
    subcategories,
    obtain,
    vendors,
    events,
    biomes,
    times,
    platforms,
    versions,
    rarities: new Map(rarities.map((r) => [r.id, r])),
    coins: [...coins].sort((a, b) => b.value - a.value),
    dropSources: new Map(Object.entries(drops.sources)),
    drops: new Map(Object.entries(drops.items)),
    bossStages: bosses.stages,
    bosses: bosses.bosses,
    bossIgnoreItems: new Set(bosses.ignoreItems),
    recipes: indexRecipes(recipes),
    bestiary: { types: bestiary.types, entries: bestiary.entries.map((e) => ({ ...e, key: e.id })) },
    difficultyIcons: Object.fromEntries(difficulties.map((d) => [d.id, d.icon])),
  }
}

interface RecipesFile {
  recipes: Recipe[]
  stations: Record<string, Station>
  groups: Record<string, IngredientGroup>
  shimmer: Shimmer[]
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function indexRecipes(file: RecipesFile): RecipeData {
  const groups = new Map(Object.entries(file.groups))
  const byResult = new Map<string, Recipe[]>()
  const usedIn = new Map<string, Recipe[]>()
  for (const r of file.recipes) {
    push(byResult, r.result, r)
    const keys = new Set<string>()
    for (const ing of r.ingredients) {
      if (ing.item) keys.add(ing.item)
      for (const k of (ing.group && groups.get(ing.group)?.items) || []) keys.add(k)
    }
    for (const k of keys) push(usedIn, k, r)
  }
  const shimmerFrom = new Map<string, Shimmer[]>()
  const shimmerTo = new Map<string, Shimmer[]>()
  for (const s of file.shimmer) {
    push(shimmerTo, s.result, s)
    for (const k of s.item ? [s.item] : ((s.group && groups.get(s.group)?.items) ?? [])) push(shimmerFrom, k, s)
  }
  return {
    recipes: file.recipes,
    byResult,
    usedIn,
    stations: new Map(Object.entries(file.stations)),
    groups,
    shimmerFrom,
    shimmerTo,
  }
}
