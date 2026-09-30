import { conditionLabel } from '@/lib/conditions'
import type { GameData } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BAD_LUCK, formatChance, formatExpected, type Luck } from '@/lib/luck'
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

/** Expected drops and the chance to have got it ("2.4× · 91%"); amber for a missing item with bad luck. */
export function LuckCell({ data, luck, missing }: { data: GameData; luck: Luck; missing: boolean }) {
  const bad = missing && luck.atLeastOnce >= BAD_LUCK
  // sources with kills, most expected first (Gel has dozens of sources)
  const killed = luck.parts.filter((p) => p.kills > 0).sort((x, y) => y.kills * y.chance - x.kills * x.chance)
  const lines = killed
    .slice(0, 8)
    .map(
      (p) =>
        `${data.dropSources.get(p.source)?.name ?? p.source}: ${p.kills.toLocaleString('en')} ${p.kills === 1 ? 'kill' : 'kills'} × ` +
        `${+(p.chance * 100).toPrecision(3)}% = ${formatExpected(p.kills * p.chance)}${p.approx ? ' (bound to a condition)' : ''}`,
    )
  if (killed.length > 8) lines.push(`… ${killed.length - 8} more`)
  if (!killed.length) lines.push('None of its sources was killed in this world yet')
  const title = [
    ...lines,
    `Chance to have got it at least once: ${formatChance(luck.atLeastOnce)}`,
    ...(luck.approx
      ? ['≈ Some drops only happen under a condition, event or biome – every kill is counted, so this may be too high.']
      : []),
    ...(bad ? ['Still missing – bad luck!'] : []),
  ].join('\n')
  return (
    <span
      title={title}
      className={cn(
        'tabular-nums',
        bad && 'rounded bg-amber-500/15 px-1 font-medium text-amber-700 dark:text-amber-400',
      )}
    >
      {luck.approx && '≈ '}
      {formatExpected(luck.expected)}
      <span className={cn('text-xs', !bad && 'text-muted-foreground')}> · {formatChance(luck.atLeastOnce)}</span>
    </span>
  )
}
