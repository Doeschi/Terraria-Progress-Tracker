import type { ColumnSort, ViewDef, ViewsPrefs } from '@/lib/prefs'
import { ordered } from '@/lib/layout'
import type { ItemColumn } from './columns'

// The built-in views (column presets): which columns are shown, in which order, and how the
// table is sorted. "Overview" uses the columns' defaults. Users can change them and add their
// own (prefs.ts, ViewsPrefs); resolveViews combines both.

export interface ColumnPreset {
  id: string
  label: string
  /** optional column ids; null = the columns' `defaultVisible` */
  columns: string[] | null
  sorting?: ColumnSort[]
  /** only selectable while a world is loaded (a column needs its bestiary) */
  needsWorld?: boolean
}

export const COLUMN_PRESETS: ColumnPreset[] = [
  { id: 'overview', label: 'Overview', columns: null },
  {
    id: 'sources',
    label: 'Where to get it',
    columns: ['milestone', 'obtain', 'drops', 'containers', 'vendors', 'conditions', 'events', 'biomes', 'buy'],
  },
  {
    // what becomes available when: sorted Start … Moon Lord
    id: 'progression',
    label: 'Progression',
    columns: ['milestone', 'categories', 'rarity', 'obtain', 'drops', 'vendors', 'conditions'],
    sorting: [{ id: 'milestone', desc: false }],
  },
  {
    // items that should have dropped by now (world bestiary kills)
    id: 'bad-luck',
    label: 'Bad luck',
    columns: ['expectedDrops', 'owned', 'drops', 'conditions', 'events', 'biomes', 'milestone'],
    sorting: [{ id: 'expectedDrops', desc: true }],
    needsWorld: true,
  },
  {
    id: 'weapons',
    label: 'Weapons',
    columns: [
      'damage',
      'damageType',
      'critical',
      'knockback',
      'useTime',
      'velocity',
      'mana',
      'autoswing',
      'rarity',
      'milestone',
    ],
    sorting: [{ id: 'damage', desc: true }],
  },
  {
    id: 'tools',
    label: 'Mining & tools',
    columns: [
      'pickaxePower',
      'axePower',
      'hammerPower',
      'useTime',
      'toolSpeed',
      'rangeBonus',
      'damage',
      'rarity',
      'milestone',
    ],
    sorting: [{ id: 'pickaxePower', desc: true }],
  },
  {
    id: 'armor',
    label: 'Armor & accessories',
    columns: ['defense', 'bodySlot', 'subcategories', 'tooltip', 'rarity', 'milestone', 'obtain'],
    sorting: [{ id: 'defense', desc: true }],
  },
  {
    id: 'consumables',
    label: 'Potions & food',
    columns: ['healLife', 'healMana', 'buff', 'debuff', 'tooltip', 'stack', 'obtain', 'vendors'],
  },
  {
    id: 'fishing',
    label: 'Fishing',
    columns: ['fishingPower', 'baitPower', 'tooltip', 'obtain', 'containers', 'vendors', 'milestone'],
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
    columns: ['buy', 'sell', 'vendors', 'conditions', 'research', 'stack'],
    sorting: [{ id: 'sell', desc: true }],
  },
  {
    id: 'technical',
    label: 'Technical',
    columns: ['id', 'internalName', 'introduced', 'platforms', 'unobtainable'],
    sorting: [{ id: 'id', desc: false }],
  },
]

/** A view as shown in the dropdown: built-in (maybe changed) or the user's own. */
export interface View extends ViewDef {
  builtin: boolean
  /** built-in view that differs from its default (offers "Restore default") */
  changed: boolean
  /** only selectable while a world is loaded */
  needsWorld?: boolean
}

/** The default of a built-in view ("Overview": the columns' defaults, in catalogue order). */
export function builtinDefault(p: ColumnPreset, catalogue: ItemColumn[]): ViewDef {
  return {
    id: p.id,
    label: p.label,
    columns: p.columns ?? catalogue.filter((c) => c.defaultVisible).map((c) => c.id),
    sorting: p.sorting ?? [],
  }
}

/** All views in the user's order: built-in ones with their changes, then own ones. */
export function resolveViews(catalogue: ItemColumn[], prefs: ViewsPrefs): View[] {
  const known = new Set(catalogue.map((c) => c.id))
  const clean = (v: ViewDef): ViewDef => ({
    ...v,
    columns: v.columns.filter((c) => known.has(c)),
    sorting: v.sorting.filter((s) => s.id === 'name' || known.has(s.id)),
  })
  const builtin = COLUMN_PRESETS.map((p): View => {
    const edit = prefs.overrides[p.id] ?? {}
    return {
      ...clean({ ...builtinDefault(p, catalogue), ...edit }),
      builtin: true,
      changed: Object.keys(edit).length > 0,
      needsWorld: p.needsWorld,
    }
  })
  const own = prefs.custom.map((v): View => ({ ...clean(v), builtin: false, changed: false }))
  const all = [...builtin, ...own]
  const byId = new Map(all.map((v) => [v.id, v]))
  return ordered(
    all.map((v) => v.id),
    prefs.order,
  ).map((id) => byId.get(id)!)
}

/** Column visibility a view stands for. */
export function viewVisibility(view: ViewDef, catalogue: ItemColumn[]): Record<string, boolean> {
  const shown = new Set(view.columns)
  return Object.fromEntries(catalogue.map((c) => [c.id, shown.has(c.id)]))
}

/** Ids of the shown columns in table order: the saved order first, the rest in catalogue order. */
export function shownColumns(catalogue: ItemColumn[], visibility: Record<string, boolean>, order: string[]): string[] {
  return ordered(
    catalogue.map((c) => c.id),
    order,
  ).filter((id) => visibility[id])
}

/** The view whose columns (in this order) are currently shown, if any (the sorting does not matter). */
export function activeView(views: View[], shown: string[]): View | undefined {
  return views.find((v) => v.columns.length === shown.length && v.columns.every((c, i) => c === shown[i]))
}
