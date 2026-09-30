import { useEffect, useState } from 'react'

// Keyboard shortcuts to the search fields: the key left of 1 (§ on Swiss/German keyboards,
// ` on US ones - by its position) jumps to the item or bestiary search, Shift + that key to the
// filter search; "/" to the item search as on many websites. Not while typing in a field or
// with a dialog open.

export type SearchTarget = 'list' | 'filters'

/** The key left of 1, by position; § / ° also where a layout moves it (e.g. Mac ISO). */
const isTopLeftKey = (e: KeyboardEvent) => e.code === 'Backquote' || e.key === '§' || e.key === '°'

export function useSearchShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      // the target can also be the document or window (keys sent to them)
      const t = e.target
      if (
        t instanceof Element &&
        t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      )
        return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      const target: SearchTarget | null = isTopLeftKey(e)
        ? e.shiftKey
          ? 'filters'
          : 'list'
        : e.key === '/'
          ? 'list'
          : null
      if (!target) return
      // the visible field (narrow screens show the filters in a dialog)
      const field = [...document.querySelectorAll<HTMLInputElement>(`input[data-shortcut="${target}"]`)].find(
        (i) => i.offsetParent !== null,
      )
      if (!field) return
      e.preventDefault()
      field.focus()
      field.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

let layoutLabel: string | null = null

/** What the key left of 1 is labelled on this keyboard (Chrome/Edge know the layout), else §. */
export function useTopLeftKeyLabel(): string {
  const [label, setLabel] = useState(layoutLabel ?? '§')
  useEffect(() => {
    if (layoutLabel) return
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard
    kb?.getLayoutMap()
      .then((map) => {
        const key = map.get('Backquote')
        if (key) setLabel((layoutLabel = key))
      })
      .catch(() => {})
  }, [])
  return label
}
