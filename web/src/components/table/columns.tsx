import type { ReactNode } from 'react'
import { compareVersions } from '@/lib/availability'
import { chanceFor, dropsFor, type DropKind } from '@/lib/drops'
import type { Difficulty, GameData, Item, PlatformId } from '@/lib/types'
import { Coins, RarityIcon } from '../common'
import { formatDate } from '@/lib/format'

// Column catalogue of the item table. `value` is what the column sorts by,
// `cell` how it is shown (defaults to the value).

export type ColumnGroup = 'Tracking' | 'Item' | 'Source' | 'Economy' | 'Combat' | 'Tools' | 'Use & placement' | 'Other'

/** Per-playthrough state some columns show (not part of the item data). */
export interface TrackingState {
  /** item key -> ISO time of the last check/uncheck/ignore/un-ignore */
  changedAt: Record<string, string>
  /** difficulty of the playthrough (which drops exist) */
  difficulty: Difficulty
}

export interface ItemColumn {
  id: string
  label: string
  group: ColumnGroup
  size: number
  defaultVisible?: boolean
  align?: 'right' | 'center'
  /** first click on the header sorts descending (e.g. newest first) */
  descFirst?: boolean
  value: (item: Item, tracking: TrackingState) => string | number | boolean | undefined
  cell?: (item: Item, tracking: TrackingState) => ReactNode
  /** custom comparison, e.g. version strings */
  compare?: (a: Item, b: Item) => number
}

const PLATFORM_SHORT: Record<PlatformId, string> = {
  desktop: 'PC',
  console: 'Console',
  mobile: 'Mobile',
  oldgen: 'Old-gen',
  '3ds': '3DS',
  japanese: 'JP',
}

const DIFFICULTY_RANK = { expert: 1, master: 2 } as const

const pct = (v?: number) => (v === undefined ? null : `${v}%`)
const yes = (v: boolean) => (v ? 'Yes' : null)

export function buildColumns(data: GameData): ItemColumn[] {
  const names = (list: { id: string; name: string }[]) => {
    const m = new Map(list.map((e) => [e.id, e.name]))
    return (ids: string[]) => ids.map((id) => m.get(id) ?? id).join(', ')
  }
  const cat = names(data.categories)
  const sub = names(data.subcategories)
  const obtain = names(data.obtain)
  const vendor = names(data.vendors)
  const bestChance = (i: Item, difficulty: Difficulty, kind: DropKind) => {
    const best = dropsFor(data, i, difficulty, kind)[0]
    return best ? (chanceFor(best, difficulty) ?? 0) : undefined
  }
  const dropList = (i: Item, difficulty: Difficulty, kind: DropKind) =>
    dropsFor(data, i, difficulty, kind)
      .map((d) => {
        const c = chanceFor(d, difficulty)
        return `${data.dropSources.get(d.source)?.name ?? d.source}${c !== undefined ? ` ${c}%` : ''}`
      })
      .join(', ')
  const event = names(data.events)
  const biome = names(data.biomes)
  const time = names(data.times)

  return [
    // ------------------------------------------------------------ item
    { id: 'id', label: 'Item ID', group: 'Item', size: 80, align: 'right', value: (i) => i.id },
    {
      id: 'internalName',
      label: 'Internal name',
      group: 'Item',
      size: 180,
      value: (i) => i.internalName,
      cell: (i) => <span className="font-mono text-xs">{i.internalName}</span>,
    },
    {
      id: 'categories',
      label: 'Categories',
      group: 'Item',
      size: 200,
      defaultVisible: true,
      value: (i) => cat(i.categories),
    },
    { id: 'subcategories', label: 'Subcategories', group: 'Item', size: 200, value: (i) => sub(i.subcategories) },
    {
      id: 'rarity',
      label: 'Rarity',
      group: 'Item',
      size: 120,
      defaultVisible: true,
      value: (i) => i.rarity,
      cell: (i) => <RarityIcon rarity={i.rarity} />,
    },
    {
      id: 'introduced',
      label: 'Added in',
      group: 'Item',
      size: 90,
      defaultVisible: true,
      value: (i) => i.introduced,
      compare: (a, b) => compareVersions(a.introduced ?? '0', b.introduced ?? '0'),
    },
    {
      id: 'difficulty',
      label: 'Difficulty',
      group: 'Item',
      size: 100,
      value: (i) => (i.minDifficulty ? DIFFICULTY_RANK[i.minDifficulty] : undefined),
      cell: (i) => (i.minDifficulty === 'master' ? 'Master only' : i.minDifficulty === 'expert' ? 'Expert+' : null),
    },
    {
      id: 'hardmode',
      label: 'Hardmode',
      group: 'Item',
      size: 95,
      value: (i) => i.hardmode || undefined,
      cell: (i) => yes(i.hardmode),
    },
    { id: 'tooltip', label: 'Tooltip', group: 'Item', size: 320, value: (i) => i.tooltip },

    // ---------------------------------------------------------- source
    {
      id: 'obtain',
      label: 'Obtained by',
      group: 'Source',
      size: 220,
      defaultVisible: true,
      value: (i) => obtain(i.obtain),
    },
    {
      id: 'drops',
      label: 'Dropped by',
      group: 'Source',
      size: 260,
      descFirst: true,
      // sorts by the best chance; shows every source of the playthrough's difficulty
      value: (i, t) => bestChance(i, t.difficulty, 'dropped'),
      // chances of the playthrough's difficulty (Expert/Master often differ from Normal)
      cell: (i, t) => dropList(i, t.difficulty, 'dropped'),
    },
    {
      id: 'containers',
      label: 'Found in',
      group: 'Source',
      size: 260,
      descFirst: true,
      // chests, crates, trees, … - like "Dropped by"
      value: (i, t) => bestChance(i, t.difficulty, 'found'),
      cell: (i, t) => dropList(i, t.difficulty, 'found'),
    },
    { id: 'vendors', label: 'Sold by', group: 'Source', size: 160, value: (i) => vendor(i.vendors) },
    {
      id: 'events',
      label: 'Events',
      group: 'Source',
      size: 200,
      value: (i) => event(i.events),
      cell: (i) =>
        i.events.length ? (
          <span className="flex items-center gap-1.5">
            {i.eventOnly && (
              <span
                className="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                title="Only obtainable during events"
              >
                only
              </span>
            )}
            <span className="truncate">{event(i.events)}</span>
          </span>
        ) : null,
    },
    { id: 'biomes', label: 'Biome', group: 'Source', size: 200, value: (i) => biome(i.biomes ?? []) },
    { id: 'times', label: 'Time of day', group: 'Source', size: 110, value: (i) => time(i.times ?? []) },
    {
      id: 'platforms',
      label: 'Platforms',
      group: 'Source',
      size: 200,
      value: (i) => i.platforms.map((p) => PLATFORM_SHORT[p]).join(', '),
    },
    {
      id: 'unobtainable',
      label: 'Unobtainable',
      group: 'Source',
      size: 110,
      value: (i) => i.unobtainable || undefined,
      cell: (i) => yes(i.unobtainable),
    },

    // --------------------------------------------------------- economy
    {
      id: 'buy',
      label: 'Buy price',
      group: 'Economy',
      size: 110,
      align: 'right',
      value: (i) => i.buy,
      cell: (i) => <Coins value={i.buy} />,
    },
    {
      id: 'sell',
      label: 'Sell price',
      group: 'Economy',
      size: 110,
      align: 'right',
      defaultVisible: true,
      value: (i) => i.sell,
      cell: (i) => <Coins value={i.sell} />,
    },
    { id: 'research', label: 'Research', group: 'Economy', size: 90, align: 'right', value: (i) => i.research },
    { id: 'stack', label: 'Max stack', group: 'Economy', size: 95, align: 'right', value: (i) => i.stack },

    // ---------------------------------------------------------- combat
    {
      id: 'damage',
      label: 'Damage',
      group: 'Combat',
      size: 85,
      align: 'right',
      defaultVisible: true,
      value: (i) => i.damage,
    },
    {
      id: 'damageType',
      label: 'Damage type',
      group: 'Combat',
      size: 110,
      value: (i) => i.damageType,
      cell: (i) => <span className="capitalize">{i.damageType}</span>,
    },
    {
      id: 'critical',
      label: 'Crit chance',
      group: 'Combat',
      size: 95,
      align: 'right',
      value: (i) => i.critical,
      cell: (i) => pct(i.critical),
    },
    { id: 'knockback', label: 'Knockback', group: 'Combat', size: 95, align: 'right', value: (i) => i.knockback },
    { id: 'useTime', label: 'Use time', group: 'Combat', size: 85, align: 'right', value: (i) => i.useTime },
    { id: 'velocity', label: 'Velocity', group: 'Combat', size: 85, align: 'right', value: (i) => i.velocity },
    { id: 'mana', label: 'Mana', group: 'Combat', size: 70, align: 'right', value: (i) => i.mana },
    {
      id: 'autoswing',
      label: 'Autoswing',
      group: 'Combat',
      size: 95,
      value: (i) => i.autoswing || undefined,
      cell: (i) => yes(i.autoswing),
    },
    {
      id: 'defense',
      label: 'Defense',
      group: 'Combat',
      size: 80,
      align: 'right',
      defaultVisible: true,
      value: (i) => i.defense,
    },
    {
      id: 'bodySlot',
      label: 'Equip slot',
      group: 'Combat',
      size: 120,
      value: (i) => i.bodySlot,
      cell: (i) => <span className="capitalize">{i.bodySlot}</span>,
    },

    // ----------------------------------------------------------- tools
    {
      id: 'pickaxePower',
      label: 'Pickaxe power',
      group: 'Tools',
      size: 115,
      align: 'right',
      value: (i) => i.pickaxePower,
      cell: (i) => pct(i.pickaxePower),
    },
    {
      id: 'axePower',
      label: 'Axe power',
      group: 'Tools',
      size: 95,
      align: 'right',
      value: (i) => i.axePower,
      cell: (i) => pct(i.axePower),
    },
    {
      id: 'hammerPower',
      label: 'Hammer power',
      group: 'Tools',
      size: 115,
      align: 'right',
      value: (i) => i.hammerPower,
      cell: (i) => pct(i.hammerPower),
    },
    { id: 'toolSpeed', label: 'Tool speed', group: 'Tools', size: 95, align: 'right', value: (i) => i.toolSpeed },
    {
      id: 'fishingPower',
      label: 'Fishing power',
      group: 'Tools',
      size: 115,
      align: 'right',
      value: (i) => i.fishingPower,
      cell: (i) => pct(i.fishingPower),
    },
    {
      id: 'baitPower',
      label: 'Bait power',
      group: 'Tools',
      size: 95,
      align: 'right',
      value: (i) => i.baitPower,
      cell: (i) => pct(i.baitPower),
    },
    { id: 'rangeBonus', label: 'Range bonus', group: 'Tools', size: 105, align: 'right', value: (i) => i.rangeBonus },

    // ------------------------------------------------- use & placement
    {
      id: 'healLife',
      label: 'Heals life',
      group: 'Use & placement',
      size: 90,
      align: 'right',
      value: (i) => i.healLife,
    },
    {
      id: 'healMana',
      label: 'Heals mana',
      group: 'Use & placement',
      size: 100,
      align: 'right',
      value: (i) => i.healMana,
    },
    { id: 'buff', label: 'Buff', group: 'Use & placement', size: 150, value: (i) => i.buff },
    { id: 'debuff', label: 'Debuff', group: 'Use & placement', size: 150, value: (i) => i.debuff },
    {
      id: 'consumable',
      label: 'Consumable',
      group: 'Use & placement',
      size: 105,
      value: (i) => i.consumable || undefined,
      cell: (i) => yes(i.consumable),
    },
    {
      id: 'placeable',
      label: 'Placeable',
      group: 'Use & placement',
      size: 95,
      value: (i) => i.placeable || undefined,
      cell: (i) => yes(i.placeable),
    },
    {
      id: 'placedSize',
      label: 'Placed size',
      group: 'Use & placement',
      size: 100,
      value: (i) => (i.placedWidth && i.placedHeight ? i.placedWidth * i.placedHeight : undefined),
      cell: (i) => (i.placedWidth && i.placedHeight ? `${i.placedWidth} × ${i.placedHeight}` : null),
    },

    // -------------------------------------------------------- tracking
    {
      id: 'changedAt',
      label: 'Last changed',
      group: 'Tracking',
      size: 160,
      defaultVisible: true,
      descFirst: true,
      value: (i, t) => t.changedAt[i.key], // ISO strings sort chronologically
      cell: (i, t) => <span className="tabular-nums">{formatDate(t.changedAt[i.key])}</span>,
    },
  ]
}

export const COLUMN_GROUPS: ColumnGroup[] = [
  'Item',
  'Source',
  'Economy',
  'Combat',
  'Tools',
  'Use & placement',
  'Tracking',
  'Other',
]
