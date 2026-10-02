import { useMemo } from 'react'
import { useActiveWorld, useStore } from '@/store'
import { worldProgress, type WorldProgress } from '@/lib/worldProgress'

/** Defeated bosses and reached milestones of the loaded world (MS5); null without a loaded world. */
export function useWorldProgress(): WorldProgress | null {
  const data = useStore((s) => s.data)
  const world = useActiveWorld()
  return useMemo(
    () =>
      data && world
        ? worldProgress(
            data.milestones.map((m) => m.id),
            world.name,
            world.defeated ?? [],
          )
        : null,
    [data, world],
  )
}
