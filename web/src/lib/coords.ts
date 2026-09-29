// Conversion between tile coordinates (used by the world file) and the values
// the in-game Compass and Depth Meter show. From the game code:
//   compass:     feet = 2 * tileX - maxTilesX          (> 0 east, < 0 west, 0 "center")
//   depth meter: feet = 2 * (tileY - worldSurface)     (> 0 below, < 0 above, 0 "level")

export interface WorldDims {
  width: number
  height: number
  worldSurface: number
}

export type EastWest = 'east' | 'west'
export type AboveBelow = 'above' | 'below'

export interface GameCoord {
  x: number
  xDir: EastWest
  y: number
  yDir: AboveBelow
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function tileToGame(tileX: number, tileY: number, w: WorldDims): GameCoord {
  const feetX = Math.round(2 * tileX - w.width)
  const feetY = Math.round(2 * (tileY - w.worldSurface))
  return {
    x: Math.abs(feetX),
    xDir: feetX < 0 ? 'west' : 'east',
    y: Math.abs(feetY),
    yDir: feetY < 0 ? 'above' : 'below',
  }
}

export function gameToTile(c: GameCoord, w: WorldDims): { x: number; y: number } {
  const feetX = c.xDir === 'west' ? -c.x : c.x
  const feetY = c.yDir === 'above' ? -c.y : c.y
  return {
    x: clamp(Math.round((feetX + w.width) / 2), 0, w.width - 1),
    y: clamp(Math.round(feetY / 2 + w.worldSurface), 0, w.height - 1),
  }
}

function formatGameCoord(c: GameCoord): string {
  const x = c.x === 0 ? 'Center' : `${c.x}' ${c.xDir === 'east' ? 'East' : 'West'}`
  const y = c.y === 0 ? 'Level' : `${c.y}' ${c.yDir === 'above' ? 'Above' : 'Below'}`
  return `${x}, ${y}`
}

export function formatTilePosition(tileX: number, tileY: number, w: WorldDims): string {
  return formatGameCoord(tileToGame(tileX, tileY, w))
}
