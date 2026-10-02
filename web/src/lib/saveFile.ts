import { z } from 'zod/mini'
import { DIFFICULTIES, PLATFORM_IDS, type Difficulty, type PlatformId } from './types'

// Progress file format. When it changes in a released version, bump SAVE_VERSION and convert
// older files when they are loaded.
export const SAVE_FORMAT = 'terraria-progress-tracker'
export const SAVE_VERSION = 1

const AreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  // tile coordinates, inclusive, x1 <= x2 and y1 <= y2
  x1: z.int(),
  y1: z.int(),
  x2: z.int(),
  y2: z.int(),
})

const WorldRefSchema = z.object({
  name: z.string(),
  guid: z.string(),
  fileName: z.string(),
  width: z.int(),
  height: z.int(),
  worldSurface: z.number(),
  lastSyncedAt: z.nullable(z.string()),
})

const PlayerRefSchema = z.object({
  name: z.string(),
  fileName: z.string(),
  lastSyncedAt: z.nullable(z.string()),
})

const PlaythroughSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.enum(PLATFORM_IDS),
  difficulty: z.enum(DIFFICULTIES),
  /** latest game update the playthrough is played on (versions.json id); null = newest */
  gameVersion: z.nullable(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  checked: z.array(z.string()),
  ignored: z.array(z.string()),
  /** item key -> ISO time of the last check/uncheck/ignore/un-ignore */
  changedAt: z.record(z.string(), z.string()),
  /** unlocked bestiary entries (entry ids) */
  bestiary: z.array(z.string()),
  /** bestiary entry id -> ISO time of the last change */
  bestiaryChangedAt: z.record(z.string(), z.string()),
  /** filter option ("<group>/<id>", bestiary ones "bestiary:<group>/<id>") -> ISO time it reached
   * 100% over the whole playthrough; removed when it is no longer complete */
  completedAt: z.record(z.string(), z.string()),
  world: z.nullable(WorldRefSchema),
  /** the attached player file (only a reference, the file is read each session) */
  player: z.nullable(PlayerRefSchema),
  areas: z.array(AreaSchema),
})

const SaveFileSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  version: z.literal(SAVE_VERSION),
  /** the item data version the file was last used with (meta.json, REQUIREMENTS DU5); missing in
   * files from before data versions */
  dataVersion: z.optional(z.string()),
  playthroughs: z.array(PlaythroughSchema),
  activePlaythroughId: z.nullable(z.string()),
})

export type Area = z.infer<typeof AreaSchema>
export type PlayerRef = z.infer<typeof PlayerRefSchema>
export type Playthrough = z.infer<typeof PlaythroughSchema>
export type SaveFile = z.infer<typeof SaveFileSchema>

/** A playthrough of a file by id. */
export function findPlaythrough(
  doc: SaveFile | null | undefined,
  id: string | null | undefined,
): Playthrough | undefined {
  return id ? doc?.playthroughs.find((p) => p.id === id) : undefined
}

/** The file's active playthrough. */
export const activePlaythrough = (doc: SaveFile | null | undefined) => findPlaythrough(doc, doc?.activePlaythroughId)

export class SaveFileError extends Error {}

export function parseSaveFile(text: string): SaveFile {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    throw new SaveFileError('The file is not valid JSON.')
  }
  if (data?.format !== SAVE_FORMAT) {
    throw new SaveFileError('This is not a Terraria Progress Tracker file.')
  }
  const version = Number(data.version)
  if (version > SAVE_VERSION) {
    throw new SaveFileError('This file was made with a newer version of Terraria Progress Tracker.')
  }
  if (version !== SAVE_VERSION) throw new SaveFileError(`Unsupported file version ${data.version}.`)
  const result = SaveFileSchema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new SaveFileError(`The file is damaged: ${issue.path.join('.')} – ${issue.message}`)
  }
  return result.data
}

export function serializeSaveFile(doc: SaveFile): string {
  return JSON.stringify(doc, null, 1)
}

export function newSaveFile(): SaveFile {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, playthroughs: [], activePlaythroughId: null }
}

export function newId(): string {
  return crypto.randomUUID()
}

export function newPlaythrough(
  name: string,
  platform: PlatformId,
  difficulty: Difficulty,
  gameVersion: string | null,
): Playthrough {
  const now = new Date().toISOString()
  return {
    id: newId(),
    name,
    platform,
    difficulty,
    gameVersion,
    createdAt: now,
    updatedAt: now,
    checked: [],
    ignored: [],
    changedAt: {},
    bestiary: [],
    bestiaryChangedAt: {},
    completedAt: {},
    world: null,
    player: null,
    areas: [],
  }
}
