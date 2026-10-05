import type { WorldDims } from './coords'
import type { Area } from './saveFile'
import type { GameData, Item, PlatformId } from './types'

// Parsed world data kept in memory for the session (never saved or uploaded).

export type ContainerKind = 'chest' | 'itemFrame' | 'weaponRack' | 'mannequin' | 'hatRack' | 'foodPlatter' | 'itemFlask'

export const CONTAINER_LABELS: Record<ContainerKind, string> = {
  chest: 'Chest',
  itemFrame: 'Item Frame',
  weaponRack: 'Weapon Rack',
  mannequin: 'Mannequin',
  hatRack: 'Hat Rack',
  foodPlatter: 'Plate',
  itemFlask: 'Item Flask',
}

export interface ContainerItem {
  id: number
  stack: number
}

export interface Container {
  kind: ContainerKind
  name?: string
  /** top-left tile */
  x: number
  y: number
  items: ContainerItem[]
}

export interface LoadedWorld extends WorldDims {
  fileName: string
  name: string
  guid: string
  spawnX: number
  spawnY: number
  /** tile row where the caverns start */
  rockLayer: number
  dungeonX: number
  dungeonY: number
  /** 0 classic, 1 expert, 2 master, 3 journey */
  gameMode: number
  containers: Container[]
  /** false if the display tile entities could not be read (unknown newer format) */
  displaysAvailable: boolean
  /** the world's bestiary; null if it could not be read */
  bestiary: WorldBestiary | null
  /** kills per banner number (`bannerId` of the banner items): what the game counts for banners */
  bannerKills: number[]
  /** banners waiting in the Banners Window, per banner number; null in worlds from before 1.4.5 */
  bannersWaiting: number[] | null
  /** boss ids the world has defeated (its "downed" flags, see worldProgress.ts) */
  defeated: string[]
}

export interface WorldBestiary {
  /** internal NPC name -> kills */
  kills: Record<string, number>
  /** critters seen */
  seen: string[]
  /** town NPCs talked to */
  talked: string[]
}

/** Tooltip of "Find in chests": what to do while no world is loaded. */
export function chestSearchHint(loaded: boolean, attached: boolean): string {
  if (loaded) return 'Find in chests'
  return attached
    ? 'Find in chests – reload the world file first (World menu → Reload, or Choose world file…)'
    : 'Find in chests – attach a world file first (World menu → Attach world file…)'
}

export type WorkerResponse =
  { type: 'progress'; percent: number } | { type: 'done'; world: LoadedWorld } | { type: 'error'; message: string }

export function parseWorldFile(file: File, onProgress?: (percent: number) => void): Promise<LoadedWorld> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/world.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        onProgress?.(msg.percent)
        return
      }
      worker.terminate()
      if (msg.type === 'done') resolve(msg.world)
      else reject(new Error(msg.message))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'The world file could not be read.'))
    }
    file.arrayBuffer().then(
      (buffer) => worker.postMessage({ buffer, fileName: file.name }, [buffer]),
      (err) => {
        worker.terminate()
        reject(err)
      },
    )
  })
}

// ------------------------------------------------------------------ areas

export const FULL_WORLD_ID = 'full-world'

export function fullWorldArea(w: WorldDims): Area {
  return { id: FULL_WORLD_ID, name: 'Full World', x1: 0, y1: 0, x2: w.width - 1, y2: w.height - 1 }
}

function inArea(x: number, y: number, a: Area): boolean {
  return x >= a.x1 && x <= a.x2 && y >= a.y1 && y <= a.y2
}

// ------------------------------------------------------- player-placed chests
//
// The world file does not say who placed a chest. A chest counts as placed by
// the player if it has a name (world generation never names chests) or is part
// of a group: at least `minGroup` containers within `distance` tiles of it
// (itself included). Displays are always player-placed.

export interface ChestDetection {
  distance: number
  minGroup: number
}

export const DEFAULT_DETECTION: ChestDetection = { distance: 20, minGroup: 3 }

const detectionCache = new WeakMap<LoadedWorld, Map<string, boolean[]>>()

/** Per container (same order as world.containers): placed by the player? */
export function playerPlaced(world: LoadedWorld, det: ChestDetection): boolean[] {
  const key = `${det.distance}/${det.minGroup}`
  let byKey = detectionCache.get(world)
  if (!byKey) detectionCache.set(world, (byKey = new Map()))
  let flags = byKey.get(key)
  if (!flags) {
    const cs = world.containers
    flags = cs.map((c) => {
      if (c.kind !== 'chest' || c.name) return true
      let near = 0
      for (const o of cs) {
        if (Math.abs(o.x - c.x) <= det.distance && Math.abs(o.y - c.y) <= det.distance && ++near >= det.minGroup)
          return true
      }
      return false
    })
    byKey.set(key, flags)
  }
  return flags
}

export interface ContainerFilter {
  includeDisplays: boolean
  /** only chests placed by the player (see playerPlaced) */
  onlyPlayer: boolean
  detection: ChestDetection
}

export function containersIn(world: LoadedWorld, areas: Area[], filter: ContainerFilter): Container[] {
  const player = filter.onlyPlayer ? playerPlaced(world, filter.detection) : null
  return world.containers.filter(
    (c, i) =>
      (filter.includeDisplays || c.kind === 'chest') &&
      (!player || player[i]) &&
      areas.some((a) => inArea(c.x, c.y, a)),
  )
}

// --------------------------------------------------------------- matching

/** Resolve a world item id to the tracker item on the given platform. */
export function resolveItem(data: GameData, id: number, platform: PlatformId): Item | undefined {
  const candidates = data.itemsById.get(id)
  if (!candidates) return undefined
  return candidates.find((i) => i.platforms.includes(platform)) ?? candidates[0]
}

export interface FoundItem {
  item: Item
  containers: number
  stack: number
}

/** An item id in the world that the item data does not know (e.g. from a newer game version). */
export interface UnknownItem {
  id: number
  stack: number
  containers: Container[]
}

export interface ScanResult {
  containers: number
  found: Map<string, FoundItem>
  unknownIds: Map<number, UnknownItem>
}

export function scanContainers(data: GameData, containers: Container[], platform: PlatformId): ScanResult {
  const found = new Map<string, FoundItem>()
  const unknownIds = new Map<number, UnknownItem>()
  for (const c of containers) {
    const seen = new Set<string>()
    for (const slot of c.items) {
      const item = resolveItem(data, slot.id, platform)
      if (!item) {
        let unknown = unknownIds.get(slot.id)
        if (!unknown) unknownIds.set(slot.id, (unknown = { id: slot.id, stack: 0, containers: [] }))
        unknown.stack += slot.stack
        if (!unknown.containers.includes(c)) unknown.containers.push(c)
        continue
      }
      let entry = found.get(item.key)
      if (!entry) {
        entry = { item, containers: 0, stack: 0 }
        found.set(item.key, entry)
      }
      entry.stack += slot.stack
      if (!seen.has(item.key)) {
        entry.containers++
        seen.add(item.key)
      }
    }
  }
  return { containers: containers.length, found, unknownIds }
}
