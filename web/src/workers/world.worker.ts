/// <reference lib="webworker" />
import { FileReader, type ItemSlot } from 'terraria-world-file'
import type { Container, ContainerItem, LoadedWorld, WorkerResponse } from '@/lib/world'
import { defeatedBosses } from '@/lib/worldProgress'
import { readTileEntities } from './tileEntities'

// Parses a .wld file off the main thread. Only the header, chests and tile
// entities are read; the (large) tile data is skipped.

const post = (msg: WorkerResponse) => self.postMessage(msg)

function slots(list: (ItemSlot | undefined)[]): ContainerItem[] {
  return list
    .filter((s): s is NonNullable<ItemSlot> => !!s && s.stack > 0 && s.id > 0)
    .map((s) => ({ id: s.id, stack: s.stack }))
}

self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer; fileName: string }>) => {
  try {
    const reader = await new FileReader().loadBuffer(e.data.buffer)
    let last = -1
    const progressCallback = (percent: number) => {
      const p = Math.floor(percent)
      if (p !== last) post({ type: 'progress', percent: (last = p) })
    }
    // Newer game versions append fields to the header that the library may not
    // know yet. We only need the fields at its start, so the header is read
    // without the end-of-section check; chests stay strict.
    const { header: h } = reader.parse({ sections: ['header'], ignorePointers: true })
    const data = reader.parse({ sections: ['chests'], progressCallback })
    const containers: Container[] = []
    for (const chest of data.chests.chests) {
      const items = slots(chest.items ?? [])
      containers.push({ kind: 'chest', name: chest.name, x: chest.position.x, y: chest.position.y, items })
    }
    // item frames, mannequins, ... - optional: chests stay usable if this fails
    let displaysAvailable = true
    try {
      containers.push(...readTileEntities(e.data.buffer))
    } catch {
      displaysAvailable = false
    }
    // the bestiary (1.4+) - optional as well
    let bestiary: LoadedWorld['bestiary'] = null
    try {
      const b = reader.parse({ sections: ['bestiary'] }).bestiary
      if (b) bestiary = { kills: b.NPCKills, seen: b.NPCSights, talked: b.NPCChats }
    } catch {
      bestiary = null
    }
    post({
      type: 'done',
      world: {
        fileName: e.data.fileName,
        name: h.mapName,
        guid: Array.from(h.guid, (b) => b.toString(16).padStart(2, '0')).join(''),
        width: h.maxTilesX,
        height: h.maxTilesY,
        worldSurface: h.worldSurface,
        spawnX: h.spawnTileX,
        spawnY: h.spawnTileY,
        rockLayer: h.rockLayer,
        dungeonX: h.dungeonX,
        dungeonY: h.dungeonY,
        gameMode: h.gameMode,
        containers,
        displaysAvailable,
        bestiary,
        defeated: defeatedBosses(h as unknown as Record<string, unknown>),
      },
    })
  } catch (err) {
    const message =
      (err as { onlyFriendlyMessage?: string }).onlyFriendlyMessage ||
      (err instanceof Error ? err.message : String(err))
    post({ type: 'error', message: `The world file could not be read: ${message}` })
  }
}
