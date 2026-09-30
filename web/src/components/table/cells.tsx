import { conditionLabel } from '@/lib/conditions'
import type { GameData } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  const each = (p: Luck['parts'][number]) => p.kills * p.chance * p.quantity
  const killed = luck.parts.filter((p) => p.kills > 0).sort((x, y) => each(y) - each(x))
  const shown = killed.slice(0, 8)
  const anyQuantity = shown.some((p) => p.quantity !== 1)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'tabular-nums',
            bad && 'rounded bg-amber-500/15 px-1 font-medium text-amber-700 dark:text-amber-400',
          )}
        >
          {luck.approx && '≈ '}
          {formatExpected(luck.expected)}
          <span className={cn('text-xs', !bad && 'text-muted-foreground')}> · {formatChance(luck.atLeastOnce)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="block max-w-md">
        {shown.length ? (
          // one row per source, the numbers in aligned columns: kills × chance (× amount) = expected
          <table className="tabular-nums">
            <tbody>
              {shown.map((p) => (
                <tr key={p.source}>
                  <td className="max-w-40 truncate pr-3">
                    {data.dropSources.get(p.source)?.name ?? p.source}
                    {p.approx && ' ≈'}
                  </td>
                  <td className="text-right">{p.kills.toLocaleString('en')}</td>
                  <td className="pl-1 opacity-70">{p.kills === 1 ? 'kill' : 'kills'}</td>
                  <td className="px-1.5 opacity-70">×</td>
                  <td className="text-right">{+(p.chance * 100).toPrecision(3)}%</td>
                  {anyQuantity && (
                    <>
                      <td className="px-1.5 opacity-70">{p.quantity !== 1 && '×'}</td>
                      <td className="text-right">{p.quantity !== 1 && p.quantity}</td>
                    </>
                  )}
                  <td className="px-1.5 opacity-70">=</td>
                  <td className="text-right font-medium">{formatExpected(each(p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>None of its sources was killed in this world yet</p>
        )}
        <div className="mt-1.5 flex flex-col gap-0.5 border-t border-background/20 pt-1.5">
          {killed.length > shown.length && <span className="opacity-70">… {killed.length - shown.length} more</span>}
          <span>Chance to have got it at least once: {formatChance(luck.atLeastOnce)}</span>
          {luck.approx && (
            <span className="opacity-70">
              ≈ Some drops only happen under a condition, event or biome – every kill is counted, so this may be too
              high.
            </span>
          )}
          {bad && <span className="font-medium text-amber-300 dark:text-amber-700">Still missing – bad luck!</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
