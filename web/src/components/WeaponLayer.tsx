import { useEffect, useRef } from 'react'
import { useHeldWeapon, WEAPONS } from '@/lib/weapons'
import { WikiIcon } from './common'

// The weapon being carried (weapon easter eggs, lib/weapons.ts): it follows the mouse; each click
// swings it (or stabs) where it is and starts its effect - and the click does nothing else.
// Escape, a right-click or a click on its ghost in the list puts it back: it flies back there.

const SIZE = 56
/** ms between two swings */
const COOLDOWN = 250
/** px around its ghost in the list where a click puts the weapon back */
const NEAR = 12

export function WeaponLayer() {
  const held = useHeldWeapon((s) => s.held)
  const drop = useHeldWeapon((s) => s.drop)
  const boxRef = useRef<HTMLDivElement>(null)
  const swordRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!held) return
    const weapon = WEAPONS[held.key]
    let pos = { x: held.x, y: held.y }
    // the swing direction: the last mouse movement (to the right by default)
    let dir = { x: 1, y: -0.25 }
    // until when the next swing has to wait
    let readyAt = 0
    // a mouse button is down: its click / context menu (on release) still belongs to the weapon
    let pressed = false
    // flying back to its place in the list
    let returning = false
    const place = () => {
      if (boxRef.current) boxRef.current.style.transform = `translate(${pos.x}px, ${pos.y - SIZE}px)`
    }
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - pos.x
      const dy = e.clientY - pos.y
      if (Math.hypot(dx, dy) > 2) dir = { x: dir.x * 0.6 + dx * 0.4, y: dir.y * 0.6 + dy * 0.4 }
      pos = { x: e.clientX, y: e.clientY }
      place()
    }
    // the swing click is the weapon's: it does not reach the page (no row opens, no button fires)
    const swallow = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const onDown = (e: PointerEvent) => {
      swallow(e)
      pressed = true
      if (returning) return
      // a right-click, or a click (nearly) on its ghost in the list, puts it back
      if (e.button === 2 || nearHome(e.clientX, e.clientY)) return putBack()
      if (performance.now() < readyAt) return
      readyAt = performance.now() + COOLDOWN
      pos = { x: e.clientX, y: e.clientY }
      place()
      const len = Math.hypot(dir.x, dir.y) || 1
      const unit = { x: dir.x / len, y: dir.y / len }
      // icons point to the top right: a stab goes that way
      if (weapon.stab)
        swordRef.current?.animate(
          [{ transform: 'translate(0, 0)' }, { transform: 'translate(13px, -13px)' }, { transform: 'translate(0, 0)' }],
          { duration: 220, easing: 'ease-out' },
        )
      else
        swordRef.current?.animate([{ transform: 'rotate(-75deg)' }, { transform: 'rotate(95deg)' }], {
          duration: 240,
          easing: 'cubic-bezier(.3,.7,.4,1)',
        })
      setTimeout(() => weapon.effect(pos, unit), 110)
    }
    const onUp = () => {
      pressed = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') putBack()
    }
    // its big icon in the list (dimmed while carried)
    const homeRect = () => document.querySelector(`[data-weapon="${held.key}"]`)?.getBoundingClientRect()
    const nearHome = (x: number, y: number) => {
      const r = homeRect()
      return !!r && x > r.left - NEAR && x < r.right + NEAR && y > r.top - NEAR && y < r.bottom + NEAR
    }
    // flies back to its big icon in the list (if that is on screen; else it fades), then is dropped
    const putBack = () => {
      const box = boxRef.current
      if (returning || !box) return
      returning = true
      window.removeEventListener('pointermove', onMove)
      const home = homeRect()
      const visible = home && home.bottom > 0 && home.top < window.innerHeight
      const flight = visible
        ? box.animate(
            [
              { transform: box.style.transform },
              {
                transform: `translate(${home.left + (home.width - SIZE) / 2}px, ${home.top + (home.height - SIZE) / 2}px) scale(${home.width / SIZE})`,
              },
            ],
            {
              duration: Math.min(600, Math.max(250, Math.hypot(home.left - pos.x, home.top - pos.y) * 0.6)),
              easing: 'cubic-bezier(.5,0,.3,1)',
              fill: 'forwards',
            },
          )
        : box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
      flight.finished.finally(() => drop())
    }
    place()
    window.addEventListener('pointermove', onMove)
    // capture: before the page sees the click
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('click', swallow, true)
    window.addEventListener('contextmenu', swallow, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('keydown', onKey)
      const release = () => {
        window.removeEventListener('click', swallow, true)
        window.removeEventListener('contextmenu', swallow, true)
      }
      if (!pressed) return release()
      // put back with a right-click: its context menu (and click) come with the release
      window.addEventListener('pointerup', () => setTimeout(release, 100), { capture: true, once: true })
    }
  }, [held, drop])

  if (!held) return null
  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[9998]"
      style={{ transform: 'translate(-200px, -200px)' }}
    >
      {/* held by the handle (bottom left): the swing turns around it */}
      <div ref={swordRef} style={{ transformOrigin: '15% 85%' }}>
        <WikiIcon src={held.icon} alt="" size={SIZE} upscale />
      </div>
    </div>
  )
}
