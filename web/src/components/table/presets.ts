import type { ColumnSort } from '@/lib/prefs'
import type { ItemColumn } from './columns'

// Column presets shown as quick buttons above the table. A preset sets which
// optional columns are visible and, optionally, how the table is sorted.
// "Overview" uses the columns' defaults.

export interface ColumnPreset {
  id: string
  label: string
  /** optional column ids; null = the columns' `defaultVisible` */
  columns: string[] | null
  sorting?: ColumnSort[]
}

export const COLUMN_PRESETS: ColumnPreset[] = [
  { id: 'overview', label: 'Overview', columns: null },
  {
    id: 'sources',
    label: 'Where to get it',
    columns: [
      'obtain',
      'drops',
      'containers',
      'vendors',
      'events',
      'biomes',
      'difficulty',
      'hardmode',
      'introduced',
      'buy',
    ],
  },
  {
    id: 'weapons',
    label: 'Weapons',
    columns: ['damage', 'damageType', 'critical', 'knockback', 'useTime', 'velocity', 'mana', 'autoswing', 'rarity'],
    sorting: [{ id: 'damage', desc: true }],
  },
  {
    id: 'tools',
    label: 'Mining & tools',
    columns: ['pickaxePower', 'axePower', 'hammerPower', 'useTime', 'toolSpeed', 'rangeBonus', 'damage', 'rarity'],
    sorting: [{ id: 'pickaxePower', desc: true }],
  },
  {
    id: 'armor',
    label: 'Armor & accessories',
    columns: ['defense', 'bodySlot', 'tooltip', 'rarity', 'hardmode', 'obtain'],
    sorting: [{ id: 'defense', desc: true }],
  },
  {
    id: 'consumables',
    label: 'Potions & food',
    columns: ['healLife', 'healMana', 'buff', 'debuff', 'tooltip', 'stack', 'obtain'],
  },
  {
    id: 'fishing',
    label: 'Fishing',
    columns: ['fishingPower', 'baitPower', 'tooltip', 'obtain', 'vendors'],
    sorting: [{ id: 'fishingPower', desc: true }],
  },
  {
    id: 'building',
    label: 'Building & furniture',
    columns: ['subcategories', 'placeable', 'placedSize', 'obtain', 'vendors', 'buy'],
  },
  {
    id: 'trading',
    label: 'Trading',
    columns: ['buy', 'sell', 'vendors', 'research', 'stack'],
    sorting: [{ id: 'sell', desc: true }],
  },
  {
    id: 'technical',
    label: 'Technical',
    columns: ['id', 'internalName', 'introduced', 'platforms'],
    sorting: [{ id: 'id', desc: false }],
  },
]

/** Column visibility a preset stands for. */
export function presetVisibility(preset: ColumnPreset, catalogue: ItemColumn[]): Record<string, boolean> {
  const shown = preset.columns ? new Set(preset.columns) : null
  return Object.fromEntries(catalogue.map((c) => [c.id, shown ? shown.has(c.id) : !!c.defaultVisible]))
}

/** The preset whose columns are currently shown, if any (the sort order does not matter). */
export function activePreset(visibility: Record<string, boolean>, catalogue: ItemColumn[]): ColumnPreset | undefined {
  return COLUMN_PRESETS.find((p) => {
    const v = presetVisibility(p, catalogue)
    return catalogue.every((c) => !!visibility[c.id] === v[c.id])
  })
}
