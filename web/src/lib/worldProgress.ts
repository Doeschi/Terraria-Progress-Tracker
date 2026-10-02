// Progress of a loaded world (MS5): the bosses it has defeated, read from the world header's
// "downed" flags, and the milestones that are reached with them.

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

const MECHS = ['the-destroyer', 'the-twins', 'skeletron-prime']

/** Milestone id (milestones.json) -> reached with these defeated bosses. Unknown ids: not reached. */
const MILESTONE_RULES: Record<string, (d: Set<string>) => boolean> = {
  start: () => true,
  'king-slime': (d) => d.has('king-slime'),
  'eye-of-cthulhu': (d) => d.has('eye-of-cthulhu'),
  'evil-boss': (d) => d.has('eater-of-worlds') || d.has('brain-of-cthulhu'),
  'queen-bee': (d) => d.has('queen-bee'),
  deerclops: (d) => d.has('deerclops'),
  skeletron: (d) => d.has('skeletron'),
  'wall-of-flesh': (d) => d.has('wall-of-flesh'),
  'queen-slime': (d) => d.has('queen-slime'),
  'any-mech': (d) => MECHS.some((m) => d.has(m)),
  'all-mechs': (d) => MECHS.every((m) => d.has(m)),
  plantera: (d) => d.has('plantera'),
  golem: (d) => d.has('golem'),
  'duke-empress': (d) => d.has('duke-fishron') || d.has('empress-of-light'),
  'lunatic-cultist': (d) => d.has('lunatic-cultist'),
  'moon-lord': (d) => d.has('moon-lord'),
}

export interface WorldProgress {
  worldName: string
  defeated: Set<string>
  /** milestone ids reached in the world */
  reached: Set<string>
  /** the first milestone (in order) not reached yet */
  next?: string
}

export function worldProgress(milestoneIds: string[], worldName: string, defeated: string[]): WorldProgress {
  const d = new Set(defeated)
  const reached = new Set(milestoneIds.filter((id) => MILESTONE_RULES[id]?.(d) ?? false))
  return { worldName, defeated: d, reached, next: milestoneIds.find((id) => !reached.has(id)) }
}
