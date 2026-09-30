import { conditionLabel } from '@/lib/conditions'
import type { GameData } from '@/lib/types'
import { WikiIcon } from '../common'

/** Conditions of an item: moon phases as icons (name on hover), the others as text. */
export function ConditionsCell({ data, ids }: { data: GameData; ids: string[] }) {
  const moons = ids.map((id) => data.conditions.get(id)).filter((c) => c?.group === 'moon')
  const others = ids.filter((id) => data.conditions.get(id)?.group !== 'moon')
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {moons.length > 0 && (
        <span className="inline-flex items-center gap-0.5">
          {moons.map((m) => (
            <span key={m!.id} title={m!.name}>
              <WikiIcon src={m!.icon} alt={m!.name} size={20} />
            </span>
          ))}
        </span>
      )}
      {others.length > 0 && <span>{others.map((id) => conditionLabel(data, id)).join(', ')}</span>}
    </span>
  )
}
