import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
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
  // only the results; each unfolds its calculation
  const [open, setOpen] = useState({ expected: false, once: false })
  return (
    <Tooltip onOpenChange={(o) => !o && setOpen({ expected: false, once: false })}>
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
        <div className="flex flex-col gap-1">
          {shown.length ? (
            <Disclosure
              open={open.expected}
              onToggle={() => setOpen({ ...open, expected: !open.expected })}
              label={
                <>
                  Expected drops by now: {luck.approx && '≈ '}
                  {formatExpected(luck.expected)}
                </>
              }
            >
              <p className="opacity-70">
                Kills × chance per kill × average amount per drop, added up over the sources:
              </p>
              {/* one row per source, the numbers in aligned columns: kills × chance × amount = expected */}
              <table className="w-fit tabular-nums">
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
                      <td className="px-1.5 opacity-70">×</td>
                      <td className="text-right">{p.quantity}</td>
                      <td className="px-1.5 opacity-70">=</td>
                      <td className="text-right font-medium">{formatExpected(each(p))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {killed.length > shown.length && <p className="opacity-70">… {killed.length - shown.length} more</p>}
            </Disclosure>
          ) : (
            <p>None of its sources was killed in this world yet</p>
          )}
          <Disclosure
            open={open.once}
            onToggle={() => setOpen({ ...open, once: !open.once })}
            label={<>Chance to have got it at least once: {formatChance(luck.atLeastOnce)}</>}
          >
            <AtLeastOnceHow parts={killed} atLeastOnce={luck.atLeastOnce} />
          </Disclosure>
          {luck.approx && (
            <p className="opacity-70">
              ≈ Some drops only happen under a condition, event or biome – every kill is counted, so this may be too
              high.
            </p>
          )}
          {bad && <p className="font-medium text-amber-300 dark:text-amber-700">Still missing – bad luck!</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/** A result line that unfolds its calculation below (in a tooltip: a tooltip in it would close it). */
function Disclosure({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean
  onToggle: () => void
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 text-left tabular-nums hover:opacity-80"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        <span>{label}</span>
      </button>
      {open && <div className="mt-1 mb-1.5 flex flex-col gap-1.5 pl-4.5">{children}</div>}
    </div>
  )
}

/** How "at least once" is calculated, with the item's own numbers. */
function AtLeastOnceHow({ parts, atLeastOnce }: { parts: Luck['parts']; atLeastOnce: number }) {
  // "(1 − 0.4%)^1,234 × (1 − 2%)^10" - the first sources, the rest as "× …"
  const terms = parts
    .slice(0, 3)
    .map((p) => `(1 − ${+(p.chance * 100).toPrecision(3)}%)^${p.kills.toLocaleString('en')}`)
  if (parts.length > 3) terms.push('…')
  return (
    <>
      <p>
        Every kill is a roll of its own. The chance to miss the item on every kill is (1 − chance)
        <sup>kills</sup> for each source, multiplied over all sources. The chance to have got it at least once is 1
        minus that.
      </p>
      {terms.length > 0 && (
        <p className="font-medium tabular-nums">
          1 − {terms.join(' × ')} = {formatChance(atLeastOnce)}
        </p>
      )}
      <p className="opacity-70">
        It is not the expected number of drops: at 1× expected, the chance is only about 63%. The amount per drop does
        not matter here.
      </p>
    </>
  )
}
