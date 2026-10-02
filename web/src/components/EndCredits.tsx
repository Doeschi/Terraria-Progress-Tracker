import { useEffect, useMemo, useRef, useState } from 'react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { useBestiaryProgress } from '@/hooks/useBestiaryView'
import { useWorldProgress } from '@/hooks/useWorldProgress'
import { DIFFICULTY_LABELS, versionLabel } from '@/lib/availability'
import { confettiBurst } from '@/lib/confetti'
import { nameOf } from '@/lib/format'
import { itemLuck, sourceKills } from '@/lib/luck'
import type { PlantStage } from '@/lib/logoArt'
import { prefersReducedMotion } from '@/lib/season'
import { useEndCredits } from '@/lib/trophies'
import type { Tally } from '@/lib/filtering'
import type { GameData, Item } from '@/lib/types'
import { LogoArt } from './LogoArt'
import { WikiIcon } from './common'

// The end credits (easter egg G8): when a playthrough has all items and the whole bestiary, its
// own credits scroll up over a starry sky - what was collected, when, the last items, the
// hardest drops - and end with the logo growing into a golden tree and fireworks. A click or
// Escape closes them; the playthrough menu plays them again. Still page with reduced motion.

const FIREWORKS = ['#ffd23c', '#ff4b4b', '#4b8cff', '#ff6ee6', '#ffffff', '#4cc96a']
const DAY = 24 * 60 * 60 * 1000
/** ms the screen takes to fade into the night sky (the credits roll after it) */
const FADE_IN = 1500

export function EndCredits({ items }: { items: Tally | undefined }) {
  const open = useEndCredits((s) => s.open)
  const close = useEndCredits((s) => s.close)
  if (!open || !items) return null
  return <CreditsScreen items={items} onClose={close} />
}

function CreditsScreen({ items, onClose }: { items: Tally; onClose: () => void }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const world = useActiveWorld()
  const progress = useWorldProgress()
  const bestiary = useBestiaryProgress()
  const motion = !prefersReducedMotion()
  const screenRef = useRef<HTMLDivElement>(null)
  const rollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<PlantStage>(motion ? 'sprout' : 'tree')

  const facts = useMemo(() => creditFacts(data, pt, world), [data, pt, world])
  // the night sky: fixed random stars
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1,
        delay: Math.random() * 3,
      })),
    [],
  )

  // fades out before it closes
  const closing = useRef(false)
  const close = () => {
    if (closing.current) return
    closing.current = true
    const fade =
      motion && screenRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' })
    if (!fade) return onClose()
    // also when the animation does not run (a hidden tab)
    const timer = setTimeout(onClose, 700)
    fade.finished.then(
      () => {
        clearTimeout(timer)
        onClose()
      },
      () => {},
    )
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // the screen fades into the night sky first
  useEffect(() => {
    if (motion) screenRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN, easing: 'ease-in' })
  }, [motion])

  // scroll up until the last block ("Thanks for playing") is in the middle, then the finale
  useEffect(() => {
    const roll = rollRef.current
    const end = endRef.current
    if (!motion || !roll || !end) return
    const h = window.innerHeight
    const stop = h / 2 - (end.offsetTop + end.offsetHeight / 2)
    const anim = roll.animate([{ transform: `translateY(${h}px)` }, { transform: `translateY(${stop}px)` }], {
      duration: Math.max(18000, (h - stop) * 16),
      // after the fade (below the screen until then)
      delay: FADE_IN,
      easing: 'linear',
      fill: 'both',
    })
    const timers: ReturnType<typeof setTimeout>[] = []
    anim.finished.then(
      () => {
        // the sprout grows into the golden tree, then fireworks
        ;(['sapling', 'young', 'tree'] as const).forEach((s, k) => timers.push(setTimeout(() => setStage(s), k * 500)))
        for (let k = 0; k < 7; k++)
          timers.push(
            setTimeout(
              () =>
                confettiBurst(
                  window.innerWidth * (0.2 + Math.random() * 0.6),
                  window.innerHeight * (0.15 + Math.random() * 0.3),
                  60,
                  8,
                  FIREWORKS,
                ),
              1600 + k * 450,
            ),
          )
      },
      () => {},
    )
    return () => {
      anim.cancel()
      timers.forEach(clearTimeout)
    }
  }, [motion])

  const platform = nameOf(data.platforms, pt.platform)
  return (
    <div
      ref={screenRef}
      role="dialog"
      aria-label="End credits"
      onClick={close}
      className="fixed inset-0 z-[9990] cursor-pointer overflow-hidden bg-[#05060f] text-white"
    >
      {stars.map((s, k) => (
        <span
          key={k}
          aria-hidden="true"
          className="egg-credits-star absolute rounded-full bg-white"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          close()
        }}
        className="absolute top-3 right-4 z-10 rounded px-2 py-1 text-xs text-white/60 hover:text-white"
      >
        Close (Esc)
      </button>
      <div className={motion ? 'absolute inset-x-0 top-0' : 'absolute inset-0 overflow-y-auto py-16'}>
        <div ref={rollRef} className="mx-auto flex max-w-xl flex-col items-center gap-14 px-6 text-center">
          <Block>
            <p className="text-sm tracking-[0.3em] text-amber-300/80 uppercase">A Terraria playthrough</p>
            <h1 className="text-4xl font-semibold">{pt.name}</h1>
            <p className="text-white/70">
              {platform} · {DIFFICULTY_LABELS[pt.difficulty]} · {versionLabel(data, pt.gameVersion)}
            </p>
          </Block>

          <Block title="Collected">
            <Line big>{count(items.total, 'item')}</Line>
            {bestiary.total > 0 && <Line big>{count(bestiary.total, 'bestiary entry', 'bestiary entries')}</Line>}
            {progress && world && (
              <Line>
                {progress.defeated.size} of {data.bosses.length} bosses defeated in <em>{world.name}</em>
              </Line>
            )}
          </Block>

          <Block title="The journey">
            <Line>Started on {formatDate(pt.createdAt)}</Line>
            <Line>Completed on {formatDate(facts.completedAt)}</Line>
            <Line big>{count(facts.days, 'day')}</Line>
          </Block>

          {facts.last.length > 0 && (
            <Block title="The last ones">
              {facts.last.map((item) => (
                <ItemLine key={item.key} item={item} />
              ))}
            </Block>
          )}

          {facts.hardest.length > 0 && (
            <Block title="Hard-earned">
              {facts.hardest.map((h) => (
                <ItemLine key={h.item.key} item={h.item}>
                  <span className="text-white/60"> – {h.text}</span>
                </ItemLine>
              ))}
            </Block>
          )}

          <div ref={endRef} className="flex flex-col items-center gap-4 pt-8 pb-24">
            <LogoArt size={112} stage={stage} fill={14} theme="golden" />
            <p className="text-3xl font-semibold text-amber-300">Thanks for playing!</p>
            <p className="text-sm text-white/50">Terraria Progress Tracker</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2">
      {title && <h2 className="mb-1 text-sm tracking-[0.3em] text-amber-300/80 uppercase">{title}</h2>}
      {children}
    </section>
  )
}

function Line({ big, children }: { big?: boolean; children: React.ReactNode }) {
  return <p className={big ? 'text-2xl font-medium tabular-nums' : 'text-white/80'}>{children}</p>
}

function ItemLine({ item, children }: { item: Item; children?: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2">
      <WikiIcon src={item.icon} alt="" size={24} />
      <span>
        {item.name}
        {children}
      </span>
    </p>
  )
}

/** "6,040 items" */
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' })

/** The playthrough's story: completion date and days, the last items checked, the hardest drops. */
function creditFacts(
  data: GameData,
  pt: NonNullable<ReturnType<typeof useActivePlaythrough>>,
  world: ReturnType<typeof useActiveWorld>,
) {
  const checked = new Set(pt.checked)
  // completed: the last change of an item or a bestiary entry
  const times = [...Object.values(pt.changedAt), ...Object.values(pt.bestiaryChangedAt)]
  const completedAt = times.length ? times.reduce((a, b) => (a > b ? a : b)) : new Date().toISOString()
  const days = Math.max(1, Math.round((Date.parse(completedAt) - Date.parse(pt.createdAt)) / DAY))
  const last = Object.entries(pt.changedAt)
    .filter(([key]) => checked.has(key))
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .slice(0, 5)
    .flatMap(([key]) => data.itemsByKey.get(key) ?? [])
  // rare drops (at most 5 % per kill) that took the most kills, from the world's bestiary
  const hardest: { item: Item; text: string; kills: number }[] = []
  if (world?.bestiary) {
    const kills = sourceKills(data, world.bestiary)
    for (const key of pt.checked) {
      const item = data.itemsByKey.get(key)
      const luck = item && itemLuck(data, item, pt.difficulty, kills)
      if (!item || !luck?.parts.length || Math.max(...luck.parts.map((p) => p.chance)) > 0.05) continue
      const main = luck.parts.reduce((a, b) => (b.kills > a.kills ? b : a))
      if (main.kills < 50) continue
      const name = data.dropSources.get(main.source)?.name ?? main.source
      hardest.push({ item, kills: main.kills, text: `${main.kills.toLocaleString('en')} ${name} kills` })
    }
    hardest.sort((a, b) => b.kills - a.kills).splice(3)
  }
  return { completedAt, days, last, hardest }
}
