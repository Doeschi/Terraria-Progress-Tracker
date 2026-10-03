import { useRef } from 'react'

/** Is there an element between `target` and `root` that scrolls sideways (its own swipes)? */
function scrollsSideways(target: Element, root: Element): boolean {
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowX
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth) return true
  }
  return false
}

/**
 * Touch: swiping a panel from left to right closes it (the detail sheet on phones). The panel
 * follows the finger; let go after a third of its width (or with a quick flick) and it closes,
 * otherwise it springs back. `back`: when it returns true, the swipe went back (to the previous
 * item) instead - the panel stays and springs back. Vertical swipes scroll as usual. Give the
 * panel `touch-action: pan-y pinch-zoom`, so the browser leaves sideways swipes to this.
 */
export function useSwipeClose(onClose: () => void, back?: () => boolean) {
  const swipe = useRef<{ x: number; y: number; t: number; el: HTMLElement; sideways: boolean | null } | null>(null)

  const end = (x: number) => {
    const s = swipe.current
    swipe.current = null
    if (!s?.sideways) return
    const dx = x - s.x
    const flick = dx > 40 && dx / (performance.now() - s.t) > 0.5
    const done = dx > s.el.offsetWidth / 3 || flick
    if (done && !back?.()) {
      // the sheet's closing animation starts where the finger left it
      s.el.style.transition = ''
      onClose()
    } else {
      s.el.style.transition = 'transform 200ms ease-out'
      s.el.style.transform = ''
      setTimeout(() => (s.el.style.transition = ''), 200)
    }
  }

  return {
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      swipe.current = null
      if (e.touches.length !== 1 || scrollsSideways(e.target as Element, e.currentTarget)) return
      const t = e.touches[0]
      swipe.current = { x: t.clientX, y: t.clientY, t: performance.now(), el: e.currentTarget, sideways: null }
    },
    onTouchMove: (e: React.TouchEvent<HTMLElement>) => {
      const s = swipe.current
      if (!s) return
      const t = e.touches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (s.sideways === null) {
        // decided once the finger has moved a bit: clearly sideways and to the right
        if (Math.hypot(dx, dy) < 10) return
        s.sideways = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5
        if (!s.sideways) {
          swipe.current = null
          return
        }
      }
      s.el.style.transition = 'none'
      s.el.style.transform = `translateX(${Math.max(0, dx)}px)`
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => end(e.changedTouches[0]?.clientX ?? 0),
    onTouchCancel: () => end(-Infinity),
  }
}
