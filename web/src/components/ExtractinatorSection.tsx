import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { cardRow } from '@/lib/cardRow'
import type { ExtractinatorResult, GameData, Item } from '@/lib/types'
import { CollapsibleSection } from './RecipeSections'
import { ObtainedMark, WikiIcon } from './common'
import { CardLink } from './DetailParts'

// The Extractinator and the Chlorophyte Extractinator in the item card (REQUIREMENTS B6): what an
// item comes from ("From the Extractinator"), and for the machines what they give ("Results").

const PHASE: Record<NonNullable<ExtractinatorResult['phase']>, string> = {
  prehardmode: 'Pre-Hardmode only',
  hardmode: 'Hardmode only',
}

export function ExtractinatorSection({ data, item, checked }: { data: GameData; item: Item; checked: Set<string> }) {
  const machine = data.extractinator.machines.find((m) => m.item === item.key)
  const from = data.extractinator.results.filter((r) => r.item === item.key)
  return (
    <>
      {from.length > 0 && <FromSection data={data} results={from} />}
      {machine && (
        <ResultsSection
          data={data}
          results={data.extractinator.results.filter((r) => r.machine === machine.id)}
          checked={checked}
        />
      )}
    </>
  )
}

/** An input of a result: its item card (the first of several: "Silt Block / Slush Block" opens Silt Block). */
function InputLink({ data, result }: { data: GameData; result: ExtractinatorResult }) {
  const openDetail = useUi((s) => s.openDetail)
  const first = result.inputs[0]
  if (!first || result.inputs.length > 2) return <>{result.input}</>
  return (
    <>
      {result.inputs.map((k, n) => (
        <span key={k}>
          {n > 0 && ' / '}
          <CardLink onOpen={() => openDetail(k)}>{data.itemsByKey.get(k)?.name ?? k}</CardLink>
        </span>
      ))}
    </>
  )
}

/** "From the Extractinator": per machine and input, the chance and amount (or "Converts …"). */
function FromSection({ data, results }: { data: GameData; results: ExtractinatorResult[] }) {
  const openDetail = useUi((s) => s.openDetail)
  return (
    <CollapsibleSection id="extractinator-from" title="From the Extractinator" count={results.length}>
      <ul className="divide-y rounded-lg border">
        {results.map((r, n) => {
          const machine = data.extractinator.machines.find((m) => m.id === r.machine)
          const machineItem = machine?.item ? data.itemsByKey.get(machine.item) : undefined
          const row = cardRow(machineItem ? () => openDetail(machineItem.key) : undefined)
          return (
            <li key={n} {...row} className={cn('flex items-center gap-3 px-3 py-2', row.className)}>
              <WikiIcon src={machineItem?.icon} alt="" size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {machineItem ? (
                    <CardLink onOpen={() => openDetail(machineItem.key)}>{machine?.name}</CardLink>
                  ) : (
                    machine?.name
                  )}
                </div>
                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>
                    {r.conversion ? 'Converts ' : 'From '}
                    <InputLink data={data} result={r} />
                  </span>
                  {r.quantity && <span>× {r.quantity}</span>}
                  {r.phase && <span>{PHASE[r.phase]}</span>}
                </div>
              </div>
              <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                {r.conversion ? 'always' : r.chance}
              </span>
            </li>
          )
        })}
      </ul>
    </CollapsibleSection>
  )
}

/** A machine's item card: one list per input (like "Contains"), the conversions last. */
function ResultsSection({
  data,
  results,
  checked,
}: {
  data: GameData
  results: ExtractinatorResult[]
  checked: Set<string>
}) {
  const openDetail = useUi((s) => s.openDetail)
  const byInput = new Map<string, ExtractinatorResult[]>()
  for (const r of results.filter((r) => !r.conversion)) {
    const list = byInput.get(r.input)
    if (list) list.push(r)
    else byInput.set(r.input, [r])
  }
  const conversions = results.filter((r) => r.conversion)
  const row = (r: ExtractinatorResult, n: number, label?: React.ReactNode) => {
    const item = data.itemsByKey.get(r.item)
    const props = cardRow(() => openDetail(r.item))
    return (
      <li key={`${r.item}-${n}`} {...props} className={cn('flex items-center gap-3 px-3 py-1.5', props.className)}>
        <WikiIcon src={item?.icon} alt="" size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <CardLink onOpen={() => openDetail(r.item)} className={cn(checked.has(r.item) && 'text-muted-foreground')}>
              {item?.name ?? r.item}
            </CardLink>
            {checked.has(r.item) && <ObtainedMark />}
          </div>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {label}
            {r.quantity && <span>× {r.quantity}</span>}
            {r.phase && <span>{PHASE[r.phase]}</span>}
          </div>
        </div>
        {r.chance && <span className="shrink-0 text-right text-sm font-medium tabular-nums">{r.chance}</span>}
      </li>
    )
  }
  return (
    <CollapsibleSection id="extractinator-results" title="Results" count={results.length}>
      {[...byInput].map(([input, list]) => (
        <div key={input} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">With {input}</h4>
          <ul className="divide-y rounded-lg border">{list.map((r, n) => row(r, n))}</ul>
        </div>
      ))}
      {conversions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">Always converts</h4>
          <ul className="divide-y rounded-lg border">
            {conversions.map((r, n) =>
              row(
                r,
                n,
                <span>
                  from <InputLink data={data} result={r} />
                </span>,
              ),
            )}
          </ul>
        </div>
      )}
    </CollapsibleSection>
  )
}
