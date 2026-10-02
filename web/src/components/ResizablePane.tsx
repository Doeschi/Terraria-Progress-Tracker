import { useRef, useState } from 'react'
import { usePrefs, type Layout } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import type { PaneLimits } from '@/lib/panes'

// A side pane (filter sidebar, detail panel) whose width the user drags at its inner edge. The
// width is remembered in the browser (Layout); double-click resets it, arrow keys change it.

/** A pane takes at most this share of the window, so the list keeps room. */
const MAX_SHARE = 0.45
const KEY_STEP = 16

function clamp(width: number, limits: PaneLimits): number {
  const max = Math.max(limits.min, Math.min(limits.max, window.innerWidth * MAX_SHARE))
  return Math.round(Math.min(max, Math.max(limits.min, width)))
}

export function ResizablePane({
  widthKey,
  limits,
  edge,
  label,
  className,
  innerClassName,
  children,
  ...rest
}: {
  widthKey: keyof Pick<Layout, 'sidebarWidth' | 'detailWidth'>
  limits: PaneLimits
  /** the edge with the handle: right for a pane on the left, left for one on the right */
  edge: 'left' | 'right'
  /** what is resized, for screen readers ("filters", "item details") */
  label: string
  /** the pane (e.g. when it is shown) */
  className?: string
  /** its content box: scrolling, background, border */
  innerClassName?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const saved = usePrefs((s) => s.layout[widthKey])
  const setLayout = usePrefs((s) => s.setLayout)
  // while dragging: the live width (saved once on release)
  const [live, setLive] = useState<number | null>(null)
  const drag = useRef<{ x: number; width: number } | null>(null)
  const width = clamp(live ?? saved, limits)
  const save = (w: number) => setLayout({ [widthKey]: clamp(w, limits) })

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    setLive(clamp(drag.current.width + (edge === 'right' ? dx : -dx), limits))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (live !== null) save(live)
    setLive(null)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    // arrows move the edge: on a right edge → widens, on a left edge ← widens
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    save(width + dir * KEY_STEP * (edge === 'right' ? 1 : -1))
  }

  return (
    // the handle sits outside the scrolling content box, so it does not scroll away
    <aside {...rest} className={cn('relative flex shrink-0', className)} style={{ width }}>
      <div className={cn('flex min-w-0 flex-1 flex-col', innerClassName)}>{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label}`}
        aria-valuenow={width}
        aria-valuemin={limits.min}
        aria-valuemax={limits.max}
        tabIndex={0}
        title="Drag to resize · double-click: default width"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => save(limits.initial)}
        onKeyDown={onKeyDown}
        className={cn(
          'absolute top-0 z-20 h-full w-1.5 cursor-col-resize touch-none transition-colors outline-none select-none hover:bg-primary/30 focus-visible:bg-primary/40',
          edge === 'right' ? '-right-[3px]' : '-left-[3px]',
          live !== null && 'bg-primary/40',
        )}
      />
    </aside>
  )
}
