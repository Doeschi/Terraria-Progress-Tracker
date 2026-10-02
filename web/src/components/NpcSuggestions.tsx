import { useMemo } from 'react'
import { useStore } from '@/store'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { useActiveRow, usePublishLead } from '@/lib/listCursor'
import { NPC_REF } from '@/lib/npcs'
import type { BestiaryEntry, GameData } from '@/lib/types'
import { WikiIcon } from './common'

// NPCs in the item search (S5): the best-matching bestiary entry, under the field; a click (or
// Enter, before the item rows) opens the NPC card.

const MAX = 1

/** Bestiary entries whose name contains every searched word: the same name first, then names
 * starting with the search, then shorter names. */
function matchNpcs(data: GameData, search: string): BestiaryEntry[] {
  const q = search.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  const rank = (name: string) => (name === q ? 0 : name.startsWith(q) ? 1 : 2)
  return data.bestiary.entries
    .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
    .sort((a, b) => {
      const na = a.name.toLowerCase()
      const nb = b.name.toLowerCase()
      return rank(na) - rank(nb) || na.length - nb.length || a.n - b.n
    })
}

export function NpcSuggestions({ search, open }: { search: string; open: boolean }) {
  const data = useStore((s) => s.data)!
  const openDetail = useUi((s) => s.openDetail)
  const matches = useMemo(() => matchNpcs(data, search), [data, search])
  const shown = useMemo(() => matches.slice(0, MAX), [matches])
  // they come first for ↑/↓ and Enter, while the list is shown
  usePublishLead(useMemo(() => (open ? shown.map((e) => ({ ref: NPC_REF + e.id, name: e.name })) : []), [open, shown]))
  const active = useActiveRow(search).row?.ref
  if (!open || !shown.length) return null
  const typeName = (e: BestiaryEntry) => data.bestiary.types.find((t) => t.id === e.type)?.name ?? e.type
  const showAll = () => {
    const { setBestiarySearch, setMode } = useStore.getState()
    setBestiarySearch(search)
    setMode('bestiary')
  }
  return (
    <div
      // keeps the focus in the search field (the list closes when it leaves)
      onMouseDown={(e) => e.preventDefault()}
      className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      role="listbox"
      aria-label="NPCs"
    >
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground uppercase">NPC</div>
      {shown.map((e) => {
        const ref = NPC_REF + e.id
        return (
          <button
            key={e.id}
            type="button"
            role="option"
            aria-selected={active === ref}
            onClick={() => openDetail(ref)}
            className={cn(
              'flex w-full items-center gap-2.5 px-2.5 py-1 text-left text-sm hover:bg-muted',
              active === ref && 'outline-2 -outline-offset-2 outline-primary outline-dashed',
            )}
          >
            <WikiIcon src={e.icon} alt="" size={24} />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{typeName(e)}</span>
          </button>
        )
      })}
      {matches.length > MAX && (
        <button
          type="button"
          onClick={showAll}
          className="w-full border-t px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {matches.length - MAX} more {matches.length - MAX === 1 ? 'NPC' : 'NPCs'} – show in the bestiary
        </button>
      )}
    </div>
  )
}
