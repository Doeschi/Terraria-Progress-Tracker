import { useActivePlaythrough, useActiveWorld } from '@/store'
import { fullWorldArea, FULL_WORLD_ID } from '@/lib/world'
import { usePrefs } from '@/lib/prefs'
import type { Area } from '@/lib/saveFile'

export interface ScanScope {
  areaIds: string[]
  includeDisplays: boolean
  /** only chests the player placed (named or in a group) */
  onlyPlayer: boolean
}

export const defaultScope = (): ScanScope => ({ areaIds: [FULL_WORLD_ID], includeDisplays: false, onlyPlayer: true })

/**
 * The sync dialog's settings of the active playthrough, remembered in the browser. Default:
 * all of the playthrough's own areas (Full World if it has none), only your chests, no displays.
 * Areas deleted since are dropped; if none are left, the default applies again.
 */
export function useSyncScope(): [ScanScope, (scope: ScanScope) => void] {
  const pt = useActivePlaythrough()
  const stored = usePrefs((s) => (pt ? s.syncScopes[pt.id] : undefined))
  const setSyncScope = usePrefs((s) => s.setSyncScope)
  const ownIds = pt?.areas.map((a) => a.id) ?? []
  const fallback: ScanScope = { ...defaultScope(), areaIds: ownIds.length ? ownIds : [FULL_WORLD_ID] }
  const valid = new Set([FULL_WORLD_ID, ...ownIds])
  const kept = stored?.areaIds.filter((id) => valid.has(id)) ?? []
  const scope = stored && kept.length ? { ...stored, areaIds: kept } : fallback
  return [scope, (s) => pt && setSyncScope(pt.id, s)]
}

/** The areas of the active playthrough, including "Full World". */
export function useAreas(): Area[] {
  const pt = useActivePlaythrough()
  const world = useActiveWorld()
  const dims = world ?? pt?.world
  return dims ? [fullWorldArea(dims), ...(pt?.areas ?? [])] : []
}
