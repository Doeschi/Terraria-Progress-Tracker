/** A header control with a small label above it. */
export function Field({
  label,
  children,
  title,
  extra,
}: {
  label: string
  children: React.ReactNode
  title?: string
  /** shown right of the label, e.g. the autosave status next to "File" */
  extra?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      <span className="flex items-center gap-2 px-0.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        {extra}
      </span>
      {children}
    </div>
  )
}
