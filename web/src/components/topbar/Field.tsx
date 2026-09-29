/** A header control with a small label above it. */
export function Field({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      <span className="px-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
    </div>
  )
}
