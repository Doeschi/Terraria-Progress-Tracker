import { cn } from '@/lib/utils'

// Building blocks of the detail panel's cards (items, NPCs, drop sources).

export type TitleComponent = (props: { children: React.ReactNode }) => React.ReactNode

export function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function Chips({ values, empty }: { values: string[]; empty?: string }) {
  if (!values.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span key={v} className="rounded-md border bg-card px-2 py-0.5 text-xs font-medium">
          {v}
        </span>
      ))}
    </div>
  )
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

/** A name that opens another card in the detail panel (it looks like text until hovered). */
export function CardLink({
  onOpen,
  title,
  className,
  children,
}: {
  onOpen: () => void
  title?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={cn(
        'max-w-full truncate text-left hover:underline focus-visible:underline focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </button>
  )
}
