import { useMemo } from 'react'
import { useStore } from '@/store'
import { usePrefs } from '@/lib/prefs'
import { buildColumns, type ItemColumn } from './columns'

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
