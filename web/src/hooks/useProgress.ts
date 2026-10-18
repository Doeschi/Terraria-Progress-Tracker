import { useMemo } from 'react'
import { useActiveWorld, useStore } from '@/store'
import { findPlaythrough } from '@/lib/saveFile'
import { progressOf, type Progress } from '@/lib/progress'

/** Defeated bosses and reached milestones of the active playthrough (MS5): from its bestiary, and
 * from the loaded world's flags if there is one. Null without a playthrough. */
export function useProgress(): Progress | null {
  const data = useStore((s) => s.data)
  const bestiary = useStore((s) => findPlaythrough(s.doc, s.activeId)?.bestiary ?? null)
  const world = useActiveWorld()
  return useMemo(
    () =>
      data && bestiary
        ? progressOf(
            data.milestones.map((m) => m.id),
            bestiary,
            world ? { name: world.name, defeated: world.defeated ?? [] } : null,
          )
        : null,
    [data, bestiary, world],
  )
}
