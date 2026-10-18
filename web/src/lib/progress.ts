// Progress of a playthrough (MS5): the bosses it has defeated and the milestones reached with
// them. A boss counts as defeated when its bestiary entry is unlocked (ticked by hand or synced
// from the world); the flags of a loaded world ("downed…", Hardmode, the Old One's Army tiers)
// count too, so a synced world never shows less.

/** The id of the Progression option "Available now" (MS7). */
export const AVAILABLE_NOW = 'available-now'

/** Header fields of the world file (terraria-world-file); missing ones (older worlds) count as false. */
type Header = Record<string, unknown>

/** Boss id (bosses.json) -> whether the world has defeated it. */
const BOSS_FLAGS: Record<string, (flag: (name: string) => boolean) => boolean> = {
  'king-slime': (f) => f('downedSlimeKing'),
  'eye-of-cthulhu': (f) => f('downedBoss1'),
  // one flag for both: the world's evil decides (a "drunk world" has both)
  'eater-of-worlds': (f) => f('downedBoss2') && (!f('crimson') || f('drunkWorld')),
  'brain-of-cthulhu': (f) => f('downedBoss2') && (f('crimson') || f('drunkWorld')),
  'queen-bee': (f) => f('downedQueenBee'),
  skeletron: (f) => f('downedBoss3'),
  deerclops: (f) => f('downedDeerclops'),
  'wall-of-flesh': (f) => f('hardMode'),
  'queen-slime': (f) => f('downedQueenSlime'),
  'the-destroyer': (f) => f('downedMechBoss1'),
  'the-twins': (f) => f('downedMechBoss2'),
  'skeletron-prime': (f) => f('downedMechBoss3'),
  plantera: (f) => f('downedPlantBoss'),
  golem: (f) => f('downedGolemBoss'),
  'duke-fishron': (f) => f('downedFishron'),
  'empress-of-light': (f) => f('downedEmpressOfLight'),
  'lunatic-cultist': (f) => f('downedAncientCultist'),
  'moon-lord': (f) => f('downedMoonlord'),
  // Old One's Army: the tiers won
  'dark-mage': (f) => f('DD2Event_DownedInvasionT1'),
  ogre: (f) => f('DD2Event_DownedInvasionT2'),
  betsy: (f) => f('DD2Event_DownedInvasionT3'),
  'mourning-wood': (f) => f('downedHalloweenTree'),
  pumpking: (f) => f('downedHalloweenKing'),
  everscream: (f) => f('downedChristmasTree'),
  'santa-nk1': (f) => f('downedChristmasSantank'),
  'ice-queen': (f) => f('downedChristmasIceQueen'),
  'flying-dutchman': (f) => f('downedPirates'),
  'martian-saucer': (f) => f('downedMartians'),
  'solar-pillar': (f) => f('downedTowerSolar'),
  'nebula-pillar': (f) => f('downedTowerNebula'),
  'vortex-pillar': (f) => f('downedTowerVortex'),
  'stardust-pillar': (f) => f('downedTowerStardust'),
}

/** The boss ids the world has defeated (runs in the world worker). */
export function defeatedBosses(header: Header): string[] {
  const flag = (name: string) => header[name] === true
  return Object.entries(BOSS_FLAGS)
    .filter(([, defeated]) => defeated(flag))
    .map(([id]) => id)
}

/** Boss id -> the bestiary entries (bestiary.json ids) that must all be unlocked for the boss to
 * count as defeated. Most bosses have one entry; the Twins die together. */
const BOSS_ENTRIES: Record<string, string[]> = {
  'king-slime': ['KingSlime'],
  'eye-of-cthulhu': ['EyeofCthulhu'],
  'eater-of-worlds': ['EaterofWorldsHead'],
  'brain-of-cthulhu': ['BrainofCthulhu'],
  'queen-bee': ['QueenBee'],
  skeletron: ['SkeletronHead'],
  deerclops: ['Deerclops'],
  // its entry unlocks with the kill that starts Hardmode
  'wall-of-flesh': ['WallofFlesh'],
  'queen-slime': ['QueenSlimeBoss'],
  'the-destroyer': ['TheDestroyer'],
  'the-twins': ['Retinazer', 'Spazmatism'],
  'skeletron-prime': ['SkeletronPrime'],
  plantera: ['Plantera'],
  golem: ['Golem'],
  'duke-fishron': ['DukeFishron'],
  'empress-of-light': ['HallowBoss'],
  'lunatic-cultist': ['CultistBoss'],
  'moon-lord': ['MoonLordCore'],
  'dark-mage': ['DD2DarkMageT3'],
  ogre: ['DD2OgreT3'],
  betsy: ['DD2Betsy'],
  'mourning-wood': ['MourningWood'],
  pumpking: ['Pumpking'],
  everscream: ['Everscream'],
  'santa-nk1': ['SantaNK1'],
  'ice-queen': ['IceQueen'],
  'flying-dutchman': ['PirateShip'],
  'martian-saucer': ['MartianSaucerCore'],
  'solar-pillar': ['LunarTowerSolar'],
  'nebula-pillar': ['LunarTowerNebula'],
  'vortex-pillar': ['LunarTowerVortex'],
  'stardust-pillar': ['LunarTowerStardust'],
}

/** The boss ids whose bestiary entries are all unlocked. */
export function defeatedInBestiary(unlocked: ReadonlySet<string>): string[] {
  return Object.entries(BOSS_ENTRIES)
    .filter(([, entries]) => entries.every((e) => unlocked.has(e)))
    .map(([id]) => id)
}

const MECHS = ['the-destroyer', 'the-twins', 'skeletron-prime']

/** Milestone id (milestones.json) -> the bosses that reach it: any one of `any`, all of `all`.
 * Unknown ids are never reached; the start needs nothing. */
const MILESTONE_BOSSES: Record<string, { any?: string[]; all?: string[] }> = {
  start: {},
  'king-slime': { any: ['king-slime'] },
  'eye-of-cthulhu': { any: ['eye-of-cthulhu'] },
  'evil-boss': { any: ['eater-of-worlds', 'brain-of-cthulhu'] },
  'queen-bee': { any: ['queen-bee'] },
  deerclops: { any: ['deerclops'] },
  skeletron: { any: ['skeletron'] },
  'wall-of-flesh': { any: ['wall-of-flesh'] },
  'queen-slime': { any: ['queen-slime'] },
  'any-mech': { any: MECHS },
  'all-mechs': { all: MECHS },
  plantera: { any: ['plantera'] },
  golem: { any: ['golem'] },
  'duke-empress': { any: ['duke-fishron', 'empress-of-light'] },
  'lunatic-cultist': { any: ['lunatic-cultist'] },
  'moon-lord': { any: ['moon-lord'] },
}

/** Where a boss counts as defeated from: its bestiary entry, or only the loaded world's flags. */
export type DefeatSource = 'bestiary' | 'world'

export interface Progress {
  /** defeated boss ids -> where that comes from */
  defeated: Map<string, DefeatSource>
  /** milestone ids reached */
  reached: Set<string>
  /** the first milestone (in order) not reached yet */
  next?: string
  /** the loaded world whose flags count too; null without one */
  worldName: string | null
}

export interface WorldFlags {
  name: string
  /** boss ids the world has defeated (`defeatedBosses`) */
  defeated: string[]
}

/** The progress of a playthrough from its unlocked bestiary entries and, if loaded, its world. */
export function progressOf(milestoneIds: string[], bestiary: readonly string[], world: WorldFlags | null): Progress {
  const defeated = new Map<string, DefeatSource>()
  for (const id of world?.defeated ?? []) defeated.set(id, 'world')
  for (const id of defeatedInBestiary(new Set(bestiary))) defeated.set(id, 'bestiary')
  const reached = new Set(milestoneIds.filter((id) => isReached(id, defeated)))
  return { defeated, reached, next: milestoneIds.find((id) => !reached.has(id)), worldName: world?.name ?? null }
}

function isReached(milestone: string, defeated: ReadonlyMap<string, DefeatSource>): boolean {
  const rule = MILESTONE_BOSSES[milestone]
  if (!rule) return false
  const any = !rule.any || rule.any.some((b) => defeated.has(b))
  const all = !rule.all || rule.all.every((b) => defeated.has(b))
  return any && all
}

/** The defeated bosses a milestone is reached with (empty for the start). */
export function reachedWith(milestone: string, defeated: ReadonlyMap<string, DefeatSource>): string[] {
  const rule = MILESTONE_BOSSES[milestone]
  return [...(rule?.any ?? []), ...(rule?.all ?? [])].filter((b) => defeated.has(b))
}
