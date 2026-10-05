import { fileOpen } from 'browser-fs-access'
import { del, get, set } from 'idb-keyval'
import { allItems, readPlayerFile, UnsupportedVersionError, type PlayerFile } from 'terraria-player-file'
import { resolveItem } from './world'
import type { GameData, Item, PlatformId } from './types'

// The attached player file (PL): reading it (terraria-player-file), remembering the file handle
// (Chrome/Edge), and what the player has - for the sync and the "Owned" column.

/** A parsed player file of this session. */
export interface LoadedPlayer extends PlayerFile {
  fileName: string
}

/** Where an item can be on the player - the storages of the sync dialog. */
export const PLAYER_STORAGES = [
  { id: 'inventory', label: 'Inventory', hint: 'incl. coins and ammo' },
  { id: 'equipment', label: 'Equipment', hint: 'incl. misc slots and loadouts' },
  { id: 'piggyBank', label: 'Piggy Bank' },
  { id: 'safe', label: 'Safe' },
  { id: 'defendersForge', label: "Defender's Forge" },
  { id: 'voidVault', label: 'Void Vault' },
] as const
export type PlayerStorage = (typeof PLAYER_STORAGES)[number]['id']

/** "in the Void Vault", "in the inventory" - for texts */
export const STORAGE_TEXT: Record<PlayerStorage, string> = {
  inventory: 'in the inventory',
  equipment: 'equipped',
  piggyBank: 'in the Piggy Bank',
  safe: 'in the Safe',
  defendersForge: "in the Defender's Forge",
  voidVault: 'in the Void Vault',
}

/** allItems' `where` -> storage */
function storageOf(where: string): PlayerStorage {
  // 'held': on the cursor or in an NPC's slot when the game saved - it goes back to the inventory
  if (where === 'coins' || where === 'ammo' || where === 'inventory' || where === 'held') return 'inventory'
  if (where === 'equipment' || where.startsWith('misc:') || where.startsWith('loadout:')) return 'equipment'
  return where as PlayerStorage
}

export async function parsePlayerFile(file: File): Promise<LoadedPlayer> {
  try {
    const player = await readPlayerFile(await file.arrayBuffer())
    return { ...player, fileName: file.name }
  } catch (err) {
    if (err instanceof UnsupportedVersionError)
      throw new Error(
        `${file.name} was saved by a game version this app cannot read yet (player file version ${err.version}). ` +
          'Load the character in the current Terraria version and save it again.',
      )
    throw err
  }
}

/** Per item key: the amount per storage (items the item data does not know are left out). */
export function playerStock(data: GameData, player: LoadedPlayer, platform: PlatformId) {
  const stock = new Map<string, { item: Item; total: number; places: Map<PlayerStorage, number> }>()
  for (const i of allItems(player)) {
    const item = resolveItem(data, i.id, platform)
    if (!item) continue
    let entry = stock.get(item.key)
    if (!entry) stock.set(item.key, (entry = { item, total: 0, places: new Map() }))
    const storage = storageOf(i.where)
    entry.total += i.stack
    entry.places.set(storage, (entry.places.get(storage) ?? 0) + i.stack)
  }
  return stock
}

/** Item keys of the permanent upgrades the player has used (they are consumed, so in no storage). */
export function usedUpgrades(player: PlayerFile): string[] {
  const u = player.upgrades
  return [
    u.lifeCrystals > 0 && 'LifeCrystal',
    u.lifeFruit > 0 && 'LifeFruit',
    u.manaCrystals > 0 && 'ManaCrystal',
    u.demonHeart && 'DemonHeart',
    u.torchGodsFavor && 'TorchGodsFavor',
    u.artisanLoaf && 'ArtisanLoaf',
    u.vitalCrystal && 'AegisCrystal',
    u.aegisFruit && 'AegisFruit',
    u.arcaneCrystal && 'ArcaneCrystal',
    u.galaxyPearl && 'GalaxyPearl',
    u.gummyWorm && 'GummyWorm',
    u.ambrosia && 'Ambrosia',
  ].filter((k): k is string => !!k)
}

// ------------------------------------------------------------ player files

const handleKey = (playthroughId: string) => `player-handle:${playthroughId}`

interface PermissionHandle {
  queryPermission?(opts: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(opts: { mode: 'read' }): Promise<PermissionState>
}

export async function pickPlayerFile(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
  try {
    const file = (await fileOpen({ description: 'Terraria player', extensions: ['.plr'] })) as File & {
      handle?: FileSystemFileHandle
    }
    return { file, handle: file.handle ?? null }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

export async function rememberPlayerHandle(playthroughId: string, handle: FileSystemFileHandle | null) {
  try {
    if (handle) await set(handleKey(playthroughId), handle)
    else await del(handleKey(playthroughId))
  } catch {
    // ignore
  }
}

export async function hasRememberedPlayer(playthroughId: string): Promise<boolean> {
  try {
    return !!(await get(handleKey(playthroughId)))
  } catch {
    return false
  }
}

/** Re-open the remembered player file (Chrome/Edge). Must be called from a user gesture. */
export async function openRememberedPlayer(playthroughId: string): Promise<File | null> {
  const handle = await get<FileSystemFileHandle & PermissionHandle>(handleKey(playthroughId))
  if (!handle) return null
  const opts = { mode: 'read' as const }
  if ((await handle.queryPermission?.(opts)) !== 'granted') {
    if ((await handle.requestPermission?.(opts)) !== 'granted') return null
  }
  return handle.getFile()
}
