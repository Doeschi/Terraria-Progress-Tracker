import type { Container, ContainerItem, ContainerKind } from '@/lib/world'

// Reader for the tile-entity section of a .wld file. terraria-world-file does
// not know the entity types added in 1.4.5 (e.g. the Item Flask), and one
// unknown type misaligns everything after it, so this section is read here.
//
// Entity layout: type u8, id i32, x i16, y i16, then per type:
//   0 training dummy   npc i16
//   1 item frame       item
//   2 logic sensor     check u8, on u8
//   3 display doll     items bits u8, dyes bits u8, [v>=307: u8], [v>=308: u8], items, dyes
//   4 weapon rack      item
//   5 hat rack         items bits u8, dyes bits u8, items, dyes
//   6 food platter     item
//   7 pylon            -
//   8 item flask       item                                   (1.4.5)
// item = id i16, prefix u8, stack i16

export class UnknownTileEntityError extends Error {}

const SINGLE_ITEM: Partial<Record<number, ContainerKind>> = {
  1: 'itemFrame',
  4: 'weaponRack',
  6: 'foodPlatter',
  8: 'itemFlask',
}

/** Section offsets from the file format header (index 5 = tile entities). */
export function sectionPointers(view: DataView): number[] {
  const count = view.getInt16(24, true)
  return Array.from({ length: count }, (_, i) => view.getInt32(26 + i * 4, true))
}

export function readTileEntities(buffer: ArrayBuffer): Container[] {
  const view = new DataView(buffer)
  const version = view.getInt32(0, true)
  const pointers = sectionPointers(view)
  const start = pointers[5]
  const end = pointers[6]
  let o = start

  const u8 = () => view.getUint8(o++)
  const i16 = () => ((o += 2), view.getInt16(o - 2, true))
  const i32 = () => ((o += 4), view.getInt32(o - 4, true))
  const item = (): ContainerItem => {
    const id = i16()
    u8() // prefix
    return { id, stack: i16() }
  }
  const slots = (bits: number): ContainerItem[] => {
    const list: ContainerItem[] = []
    for (let b = 0; b < 8; b++) if (bits & (1 << b)) list.push(item())
    return list
  }

  const containers: Container[] = []
  const count = i32()
  for (let n = 0; n < count; n++) {
    const type = u8()
    i32() // entity id
    const x = i16()
    const y = i16()
    let kind: ContainerKind | undefined
    let items: ContainerItem[] = []

    if (SINGLE_ITEM[type]) {
      kind = SINGLE_ITEM[type]
      items = [item()]
    } else if (type === 3 || type === 5) {
      kind = type === 3 ? 'mannequin' : 'hatRack'
      const itemBits = u8()
      const dyeBits = u8()
      if (type === 3 && version >= 307) u8()
      if (type === 3 && version >= 308) u8()
      items = [...slots(itemBits), ...slots(dyeBits)]
    } else if (type === 0) i16()
    else if (type === 2) o += 2
    else if (type !== 7) throw new UnknownTileEntityError(`Unknown tile entity type ${type}`)

    items = items.filter((s) => s.id > 0 && s.stack > 0)
    if (kind && items.length) containers.push({ kind, x, y, items })
  }

  if (o !== end) throw new UnknownTileEntityError(`Tile entities ended at ${o}, expected ${end}`)
  return containers
}
