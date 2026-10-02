import { useMemo, useRef } from 'react'
import { useActivePlaythrough, useStore } from '@/store'
import { cn } from '@/lib/utils'
import { itemSources, sourceCandidates, type SourceEntry } from '@/lib/sources'
import { itemsForPlaythrough } from '@/lib/availability'
import type { Tally } from '@/lib/filtering'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { WikiIcon } from './common'

// "+ Add an NPC, container or set…" of the group "Sources & sets" (REQUIREMENTS FL18): every NPC,
// container and set, searchable; picking one adds it to the group and selects it.

const SECTIONS: { id: SourceEntry['section']; label: string }[] = [
  { id: 'npc', label: 'NPCs' },
  { id: 'container', label: 'Containers & bags' },
  { id: 'set', label: 'Sets' },
]

/** Every word of the search in the name or the type ("plant" finds Plantera, "vanity pirate" the
 * Pirate set); cmdk's own matching also finds letters scattered over a long name. */
function matchWords(_value: string, search: string, keywords?: string[]): number {
  const text = (keywords ?? []).join(' ').toLowerCase()
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.every((w) => text.includes(w))) return 0
  // names starting with the search first
  return text.startsWith(words[0] ?? '') ? 1 : 0.5
}

export function SourcePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const data = useStore((s) => s.data)!
  const picked = useStore((s) => s.picked)
  const pickSource = useStore((s) => s.pickSource)
  const pt = useActivePlaythrough()!
  const candidates = useMemo(() => sourceCandidates(data), [data])
  const listRef = useRef<HTMLDivElement>(null)
  // obtained / total per option over the whole playthrough (ignored items do not count)
  const totals = useMemo(() => {
    const out = new Map<string, Tally>()
    if (!open) return out
    const items = new Set(itemsForPlaythrough(data, pt).map((i) => i.key))
    const checked = new Set(pt.checked)
    const ignored = new Set(pt.ignored)
    for (const [key, ids] of itemSources(data, pt.difficulty)) {
      if (!items.has(key) || ignored.has(key)) continue
      for (const id of ids) {
        const t = out.get(id) ?? { total: 0, obtained: 0 }
        t.total++
        if (checked.has(key)) t.obtained++
        out.set(id, t)
      }
    }
    return out
  }, [open, data, pt])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add an NPC, container or set"
      description="Filter the items by an NPC, a container or a set"
      className="sm:max-w-lg"
    >
      <Command filter={matchWords}>
        <CommandInput
          placeholder="Search NPCs, containers and sets…"
          // the first match is highlighted: show it (the list kept its old scroll position)
          onValueChange={() => setTimeout(() => listRef.current?.scrollTo({ top: 0 }))}
        />
        <CommandList ref={listRef} className="max-h-[60vh]">
          <CommandEmpty>Nothing found.</CommandEmpty>
          {SECTIONS.map((section) => (
            <CommandGroup key={section.id} heading={section.label}>
              {candidates
                .filter((c) => c.section === section.id && (totals.get(c.id)?.total ?? 0) > 0)
                .map((c) => {
                  const t = totals.get(c.id)!
                  return (
                    <CommandItem
                      key={c.id}
                      // unique; the search looks at the keywords (name and type)
                      value={c.id}
                      keywords={[c.name, c.kind]}
                      onSelect={() => {
                        pickSource(c.id)
                        onOpenChange(false)
                      }}
                      className="gap-2.5"
                    >
                      <WikiIcon src={c.icon} alt="" size={24} />
                      <span className="min-w-0 flex-1 truncate">
                        {c.name}
                        {picked.includes(c.id) && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(picked)</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.kind}</span>
                      <span
                        className={cn(
                          'w-16 shrink-0 text-right text-xs tabular-nums',
                          t.obtained === t.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                        )}
                      >
                        {t.obtained} / {t.total}
                      </span>
                    </CommandItem>
                  )
                })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
