import { useEffect } from 'react'
import { create } from 'zustand'

// Keyboard selection in the item / bestiary search (like the filter search): the table publishes
// its rows in display order, the search field moves through them with ↑/↓ and opens the
// highlighted one with Enter. Only while something is searched; a new search starts at the first
// match. Rows before the table's (the NPC suggestions of the item search, S5) come first.
// After a click on a row the table has the focus: ↑/↓ move from that row, Enter opens (S6).

export interface ListRow {
  /** detail reference the row opens (item key, "npc:<id>") */
  ref: string
  name: string
}

interface ListCursorState {
  /** rows before the table's (NPC suggestions) */
  lead: ListRow[]
  rows: ListRow[]
  /** the search the index belongs to */
  query: string
  index: number
  /** row index while the table has the keyboard focus (after a click on a row), else null */
  tableIndex: number | null
  setLead(rows: ListRow[]): void
  setRows(rows: ListRow[]): void
  setCursor(query: string, index: number): void
  setTableIndex(index: number | null): void
}

export const useListCursor = create<ListCursorState>()((set) => ({
  lead: [],
  rows: [],
  tableIndex: null,
  query: '',
  index: 0,
  setLead: (lead) => set({ lead }),
  setRows: (rows) => set({ rows }),
  setCursor: (query, index) => set({ query, index }),
  setTableIndex: (tableIndex) => set({ tableIndex }),
}))

/** Publish the rows a table shows (in display order) while it is mounted. */
export function usePublishRows(rows: ListRow[]) {
  const setRows = useListCursor((s) => s.setRows)
  useEffect(() => {
    setRows(rows)
    return () => setRows([])
  }, [rows, setRows])
}

/** Publish the rows that come before the table's (NPC suggestions) while mounted. */
export function usePublishLead(rows: ListRow[]) {
  const setLead = useListCursor((s) => s.setLead)
  useEffect(() => {
    setLead(rows)
    return () => setLead([])
  }, [rows, setLead])
}

function cursorOf(search: string, all: ListRow[], query: string, cursor: number): number {
  return query === search.trim() ? Math.min(cursor, all.length - 1) : 0
}

/** The highlighted row for this search (null without a search or match), its index among all
 * rows (suggestions first) and their number. */
export function useActiveRow(search: string): { row: ListRow | null; index: number; count: number } {
  const lead = useListCursor((s) => s.lead)
  const rows = useListCursor((s) => s.rows)
  const query = useListCursor((s) => s.query)
  const cursor = useListCursor((s) => s.index)
  const tableIndex = useListCursor((s) => s.tableIndex)
  const count = lead.length + rows.length
  if (tableIndex !== null && rows[tableIndex]) return { row: rows[tableIndex], index: lead.length + tableIndex, count }
  if (!search.trim() || !count) return { row: null, index: 0, count }
  const index = cursorOf(search, [...lead, ...rows], query, cursor)
  return { row: index < lead.length ? lead[index] : rows[index - lead.length], index, count }
}

/** ↑/↓ move the highlight, Enter opens it (only while something is searched). */
export function handleListKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  search: string,
  open: (ref: string) => void,
): void {
  const q = search.trim()
  const { lead, rows, query, index: cursor, tableIndex, setTableIndex } = useListCursor.getState()
  if (tableIndex !== null) setTableIndex(null) // typing in the search ends the table's keyboard mode
  const all = [...lead, ...rows]
  if (!q || !all.length) return
  const index = cursorOf(search, all, query, cursor)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    useListCursor.getState().setCursor(q, (index + step + all.length) % all.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    open(all[index].ref)
  }
}

/** A click on a table row: the table takes the keyboard focus, ↑/↓ start at this row. */
export function tableRowClicked(ref: string): void {
  const { rows, setTableIndex } = useListCursor.getState()
  const index = rows.findIndex((r) => r.ref === ref)
  setTableIndex(index >= 0 ? index : null)
}

/** Keys while the table has the focus: ↑/↓ move the highlight, Enter opens it, Escape ends. */
export function handleTableKey(e: React.KeyboardEvent, open: (ref: string) => void): void {
  const { rows, tableIndex, setTableIndex } = useListCursor.getState()
  if (tableIndex === null || !rows.length) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    setTableIndex(Math.max(0, Math.min(rows.length - 1, tableIndex + step)))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (rows[tableIndex]) open(rows[tableIndex].ref)
  } else if (e.key === 'Escape') {
    // taken: it ends the keyboard mode, it does not clear the filters (S3a)
    e.preventDefault()
    setTableIndex(null)
  }
}
