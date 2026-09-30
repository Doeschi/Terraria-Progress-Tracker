import { WikiIcon } from './common'

/** A completed filter option in the "Filter complete!" toast. */
export interface Completed {
  name: string
  icon?: string
  /** the group, e.g. "Sold by" or "Categories › Accessories" */
  context: string
}

/** "Filter complete!" in the style of Terraria's achievement pop-up (see useCompletions). */
export function CompletionToast({ done }: { done: Completed[] }) {
  const first = done[0]
  const shown = done.slice(0, 3)
  return (
    <div
      role="status"
      className="flex w-[22rem] items-center gap-3 rounded-md border-2 border-[#d9a93a] bg-[#1c2656]/95 px-3 py-2.5 text-white shadow-[0_4px_16px_rgba(0,0,0,0.45)] ring-1 ring-black/40"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded border border-[#d9a93a]/60 bg-black/25">
        {first.icon ? <WikiIcon src={first.icon} alt="" size={28} /> : <span className="text-xl">✓</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[#f5d36a] [text-shadow:0_1px_0_rgba(0,0,0,0.6)]">
          {done.length === 1 ? 'Filter complete!' : `${done.length} filters complete!`}
        </div>
        {shown.map((c, i) => (
          <div key={i} className="truncate text-xs">
            <span className="font-medium">{c.name}</span>
            <span className="text-white/60"> · {c.context}</span>
          </div>
        ))}
        {done.length > shown.length && <div className="text-xs text-white/60">+{done.length - shown.length} more</div>}
      </div>
    </div>
  )
}
