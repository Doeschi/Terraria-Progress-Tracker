import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

// The desktop header stays on one line (P5a): when the window gets too narrow for it, its texts
// give way to their icons, step by step. The level is how far that has gone:
//   1  no app name next to the logo, no "(not loaded)" after the player and the world
//   2  Player and World: only their icons (the names on hover)
//   3  File: only its icon, and the save status as an icon
//   4  Progress without counts and with icons for "Items" / "Bestiary"; Items | Bestiary | Stats as icons
//   5  the playthrough button without the name (platform, difficulty and version icons stay)
//   6  no Progress
//   7  no GitHub and About buttons (About is also at the bottom of the filter sidebar)
// The phone's menu shows everything (level 0, the default).

export const MAX_HEADER_LEVEL = 7

export const HeaderLevel = createContext(0)

/** How compact the header controls are shown (0: everything). */
export const useHeaderLevel = () => useContext(HeaderLevel)

/**
 * The lowest level at which the header fits in one line. `bar` is the header (its inner width is
 * the room), `left`, `controls` and `right` are its three parts at their natural width (no
 * wrapping, no shrinking). A new level is set before the browser paints, so the steps in between
 * are not seen.
 */
export function useFitLevel(max: number) {
  const bar = useRef<HTMLElement>(null)
  const left = useRef<HTMLDivElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState(0)
  // the width the parts needed at each level, as far as measured
  const needed = useRef<number[]>([])
  // counts the size changes of the bar and of its parts (other content): measure again
  const [resized, setResized] = useState(0)

  useLayoutEffect(() => {
    if (!bar.current || !left.current || !controls.current || !right.current) return
    const style = getComputedStyle(bar.current)
    const px = (value: string) => parseFloat(value) || 0
    const room = bar.current.clientWidth - px(style.paddingLeft) - px(style.paddingRight) - 2 * px(style.columnGap)
    const width = left.current.offsetWidth + controls.current.offsetWidth + right.current.offsetWidth
    const known = needed.current[level]
    if (known !== undefined && known !== width) {
      // other content (a longer name, a loaded world): what was measured before no longer holds
      needed.current = []
      needed.current[level] = width
      if (level > 0) {
        setLevel(0)
        return
      }
    }
    needed.current[level] = width
    if (width > room && level < max) setLevel(level + 1)
    else if (level > 0 && (needed.current[level - 1] ?? Infinity) <= room) setLevel(level - 1)
  }, [level, max, resized])

  useEffect(() => {
    const observer = new ResizeObserver(() => setResized((n) => n + 1))
    for (const part of [bar, left, controls, right]) if (part.current) observer.observe(part.current)
    return () => observer.disconnect()
  }, [])

  return { bar, left, controls, right, level }
}
