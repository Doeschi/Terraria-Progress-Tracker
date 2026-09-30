import { useMemo } from 'react'
import { useStore } from '@/store'
import { usePrefs } from '@/lib/prefs'
import { buildColumns, type ItemColumn } from './columns'
import { resolveViews, shownColumns, type View } from './presets'

export function useItemColumns(): ItemColumn[] {
  const data = useStore((s) => s.data)!
  return useMemo(() => buildColumns(data), [data])
}

/** Visibility of the optional columns: saved preference, else the column default. */
export function useColumnVisibility(catalogue: ItemColumn[]): Record<string, boolean> {
  const saved = usePrefs((s) => s.columns)
  return useMemo(
    () => Object.fromEntries(catalogue.map((c) => [c.id, saved[c.id] ?? !!c.defaultVisible])),
    [catalogue, saved],
  )
}

/** All views (built-in with the user's changes, own ones) in the user's order. */
export function useViews(catalogue: ItemColumn[]): View[] {
  const prefs = usePrefs((s) => s.views)
  return useMemo(() => resolveViews(catalogue, prefs), [catalogue, prefs])
}

/** Ids of the shown columns in table order. */
export function useShownColumns(catalogue: ItemColumn[]): string[] {
  const visibility = useColumnVisibility(catalogue)
  const order = usePrefs((s) => s.columnOrder)
  return useMemo(() => shownColumns(catalogue, visibility, order), [catalogue, visibility, order])
}
