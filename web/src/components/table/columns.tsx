import type { ReactNode } from 'react'
import { compareVersions } from '@/lib/availability'
import { chanceFor, regularDrops, type DropKind } from '@/lib/drops'
import type { Difficulty, GameData, Item, PlatformId } from '@/lib/types'
import { Coins, RarityIcon, WikiIcon } from '../common'
import { formatDate, nameOf } from '@/lib/format'
import { conditionLabel, conditionNames } from '@/lib/conditions'
import { ConditionsCell, IconList, LuckCell, type IconEntry } from './cells'
import type { Luck } from '@/lib/luck'
import type { Owned } from '@/hooks/useTrackerView'

// Column catalogue of the item table. `value` is what the column sorts by,
// `cell` how it is shown (defaults to the value).

export type ColumnGroup = 'Progress' | 'Item' | 'Source' | 'Economy' | 'Combat' | 'Tools' | 'Use & placement' | 'Other'

/** Per-playthrough state some columns show (not part of the item data). */
export interface TrackingState {
  /** item key -> ISO time of the last check/uncheck/ignore/un-ignore */
  changedAt: Record<string, string>
  /** difficulty of the playthrough (which drops exist) */
  difficulty: Difficulty
  /** expected drops from the loaded world's kills (null: no world loaded) */
  luck: ((item: Item) => Luck | undefined) | null
  /** checked or ignored: not "missing" */
  done: (key: string) => boolean
  /** item key -> amount owned, chests and player (null: no world or player loaded) */
  owned: Map<string, Owned> | null
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
  /** only offered while a world is loaded ("world": its bestiary kills) or a world or player
   * ("items": chests, the player's storages) */
  needs?: 'world' | 'items'
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
    const best = regularDrops(data, i, difficulty, kind)[0]
    return best ? (chanceFor(best, difficulty) ?? 0) : undefined
  }
  // icons of list entries (name on hover)
  const iconsOf = (list: { id: string; name: string; icon?: string }[]) => {
    const m = new Map(list.map((e) => [e.id, e]))
    return (ids: string[]): IconEntry[] =>
      ids.map((id) => ({ key: id, icon: m.get(id)?.icon, name: m.get(id)?.name ?? id }))
  }
  const obtainIcons = iconsOf(data.obtain)
  const eventIcons = iconsOf(data.events)
  const biomeIcons = iconsOf(data.biomes)
  const platformIcons = iconsOf(data.platforms)
  // the sources' icons with their chance, best first; without the rows only in special seeds,
  // like the filters (CO6) - the detail panel shows them
  const dropIcons = (i: Item, difficulty: Difficulty, kind: DropKind): IconEntry[] =>
    regularDrops(data, i, difficulty, kind).map((d, n) => {
      const source = data.dropSources.get(d.source)
      const c = chanceFor(d, difficulty)
      return {
        key: `${d.source}-${n}`,
        icon: source?.icon,
        name: source?.name ?? d.source,
        label: c !== undefined ? `${c}%` : undefined,
      }
    })
  const event = names(data.events)
  const biome = names(data.biomes)
  const milestoneRank = new Map(data.milestones.map((m, n) => [m.id, n]))
  const condition = (ids: string[]) => ids.map((id) => conditionLabel(data, id)).join(', ')
  // the vendors' heads and names; the conditions of their shop rows on hover
  const vendorIcons = (i: Item): IconEntry[] =>
    i.vendors.map((v) => {
      const rows = (data.shops.get(i.key) ?? []).filter((r) => r.vendor === v)
      const conds = [...new Set(rows.flatMap((r) => conditionNames(data, r)))]
      const name = nameOf(data.vendors, v)
      return {
        key: v,
        icon: data.vendors.find((x) => x.id === v)?.icon,
        name,
        label: name,
        detail: conds.join(', ') || undefined,
      }
    })

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
      cell: (i) => {
        if (!i.minDifficulty) return null
        const label = i.minDifficulty === 'master' ? 'Master only' : 'Expert+'
        return (
          <IconList
            entries={[{ key: i.minDifficulty, icon: data.difficultyIcons[i.minDifficulty], name: label, label }]}
          />
        )
      },
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
      id: 'milestone',
      label: 'Available after',
      group: 'Source',
      size: 190,
      defaultVisible: true,
      // sorts in milestone order (Start … Moon Lord)
      value: (i) => (i.milestone ? milestoneRank.get(i.milestone) : undefined),
      cell: (i) => {
        const m = i.milestone ? data.milestones.find((x) => x.id === i.milestone) : undefined
        if (!m) return null
        return (
          <span className="inline-flex min-w-0 items-center gap-1.5" title={i.milestoneVia}>
            <WikiIcon src={m.icon} alt="" size={18} />
            <span className="truncate">{m.name}</span>
          </span>
        )
      },
    },
    {
      id: 'obtain',
      label: 'Obtained by',
      group: 'Source',
      size: 160,
      defaultVisible: true,
      value: (i) => obtain(i.obtain),
      cell: (i) => <IconList entries={obtainIcons(i.obtain)} max={6} />,
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
      cell: (i, t) => <IconList entries={dropIcons(i, t.difficulty, 'dropped')} max={3} />,
    },
    {
      id: 'containers',
      label: 'Found in',
      group: 'Source',
      size: 260,
      descFirst: true,
      // chests, crates, trees, … - like "Dropped by"
      value: (i, t) => bestChance(i, t.difficulty, 'found'),
      cell: (i, t) => <IconList entries={dropIcons(i, t.difficulty, 'found')} max={3} />,
    },
    {
      id: 'vendors',
      label: 'Sold by',
      group: 'Source',
      size: 220,
      // sorts by vendor name, shows the conditions of the shop rows
      value: (i) => vendor(i.vendors),
      cell: (i) => <IconList entries={vendorIcons(i)} max={3} />,
    },
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
            <IconList entries={eventIcons(i.events)} max={6} />
          </span>
        ) : null,
    },
    {
      id: 'biomes',
      label: 'Biome',
      group: 'Source',
      size: 160,
      value: (i) => biome(i.biomes ?? []),
      cell: (i) => <IconList entries={biomeIcons(i.biomes ?? [])} max={6} />,
    },
    {
      id: 'conditions',
      label: 'Conditions',
      group: 'Source',
      size: 180,
      value: (i) => condition(i.conditions),
      // moon phases as the wiki's moon icons, the rest as text
      cell: (i) => <ConditionsCell data={data} ids={i.conditions} />,
    },
    {
      id: 'platforms',
      label: 'Platforms',
      group: 'Source',
      size: 160,
      value: (i) => i.platforms.map((p) => PLATFORM_SHORT[p]).join(', '),
      cell: (i) => <IconList entries={platformIcons(i.platforms)} max={6} />,
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

    // -------------------------------------------------------- progress
    {
      id: 'changedAt',
      label: 'Last changed',
      group: 'Progress',
      size: 160,
      defaultVisible: true,
      descFirst: true,
      value: (i, t) => t.changedAt[i.key], // ISO strings sort chronologically
      cell: (i, t) => <span className="tabular-nums">{formatDate(t.changedAt[i.key])}</span>,
    },
    {
      // the same chests as "craftable from your chests" (the ones the player placed, whole world)
      // plus everything on the loaded player
      id: 'owned',
      label: 'Owned',
      group: 'Progress',
      size: 95,
      align: 'right',
      descFirst: true,
      needs: 'items',
      value: (i, t) => t.owned?.get(i.key)?.total,
      cell: (i, t) => {
        const o = t.owned?.get(i.key)
        return o ? (
          <span
            className="tabular-nums"
            title={o.places.map(([where, n]) => `${n.toLocaleString('en')} ${where}`).join(' · ')}
          >
            {o.total.toLocaleString('en')}
          </span>
        ) : null
      },
    },
    {
      // sorted by the chance to have got it by now: bad luck first when descending
      id: 'expectedDrops',
      label: 'Expected drops',
      group: 'Progress',
      size: 130,
      align: 'right',
      descFirst: true,
      needs: 'world',
      value: (i, t) => t.luck?.(i)?.atLeastOnce,
      cell: (i, t) => {
        const luck = t.luck?.(i)
        return luck ? <LuckCell data={data} luck={luck} missing={!t.done(i.key)} /> : null
      },
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
  'Progress',
  'Other',
]
