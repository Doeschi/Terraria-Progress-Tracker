import { useEffect, useRef } from 'react'
import { useActivePlaythrough, useStore } from '@/store'
import { usePrefs } from '@/lib/prefs'
import { dateOverridden, logoThemeOf, now as currentTime, seasonOf } from '@/lib/season'
import { useSeasonClock } from './useSeasonClock'
import { logoSvgMarkup } from '@/lib/logoArt'
import { confettiBurst } from '@/lib/confetti'
import { achievement, bees, bigConfetti, bunny, drunk, flipPage, goldConfetti, itemIcon, worthy } from '@/lib/eggs'
import { critterParade } from '@/lib/parade'
import { useEndCredits, useTrophies } from '@/lib/trophies'
import { useBestiaryProgress } from './useBestiaryView'

// Easter eggs (G8) that are not tied to a component: secret world seeds typed into the item or
// bestiary search, the Konami code, Terraria's birthday and a rare bunny.

/** "Don't Dig Up" -> "dont dig up" */
const normalize = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim()

const SEEDS: Record<string, () => void> = {
  'not the bees': () => {
    bees()
    achievement('Not the bees!', 'A whole hive of them, just for you.', itemIcon('Abeemination'))
  },
  'dont dig up': () => {
    flipPage()
    achievement('Everything is upside down', 'Dig up for a change.', itemIcon('CopperPickaxe'))
  },
  'for the worthy': () => {
    worthy()
    achievement('For the worthy', 'Everything is a little more dangerous now. Reload to calm down.', itemIcon('Skull'))
  },
  celebrationmk10: () => {
    bigConfetti()
    achievement('Party time!', 'Ten years of digging, building and fighting.', itemIcon('Confetti'))
  },
  'drunk world': () => {
    drunk()
    achievement('Hic!', 'The world is a bit wobbly today.', itemIcon('Ale'))
  },
  '05162020': () => SEEDS['drunk world'](),
  '5162020': () => SEEDS['drunk world'](),
  getfixedboi: () => {
    flipPage(5000)
    drunk(5000)
    bees(20)
    bigConfetti()
    worthy(5000)
    achievement('Get fixed, boi', 'All the secret worlds at once. Good luck.', itemIcon('Zenith'))
  },
}

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

export function useEasterEggs() {
  const enabled = usePrefs((s) => s.layout.easterEggs)
  const season = useSeasonClock()
  const search = useStore((s) => s.search)
  const bestiarySearch = useStore((s) => s.bestiarySearch)
  const last = useRef('')

  // secret world seeds in the search (once each time the text becomes one)
  useEffect(() => {
    if (!enabled) return
    for (const text of [search, bestiarySearch]) {
      const key = normalize(text)
      if (SEEDS[key] && last.current !== key) {
        last.current = key
        SEEDS[key]()
        return
      }
    }
    if (!SEEDS[normalize(search)] && !SEEDS[normalize(bestiarySearch)]) last.current = ''
  }, [enabled, search, bestiarySearch])

  // Konami code
  useEffect(() => {
    if (!enabled) return
    let pos = 0
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      pos = key === KONAMI[pos] ? pos + 1 : key === KONAMI[0] ? 1 : 0
      if (pos === KONAMI.length) {
        pos = 0
        achievement(
          'Achievement unlocked: Cheater?',
          'Up, up, down, down… some codes never get old.',
          itemIcon('GoldenKey'),
        )
        confettiBurst(window.innerWidth / 2, 70, 200)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  // Terraria's birthday (May 16, 2011): once a year - checked again when the date changes while the
  // app stays open (the season clock)
  useEffect(() => {
    if (!enabled) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const now = currentTime()
    if (seasonOf(now) === 'birthday') {
      const key = 'egg-birthday'
      let seen: string | null = null
      try {
        seen = localStorage.getItem(key)
      } catch {
        // storage unavailable: show it anyway
      }
      // with `?date=` (testing) always shown, and not remembered
      if (dateOverridden || seen !== String(now.getFullYear())) {
        try {
          if (!dateOverridden) localStorage.setItem(key, String(now.getFullYear()))
        } catch {
          // ignore
        }
        timers.push(
          setTimeout(() => {
            achievement(
              'Happy birthday, Terraria!',
              `Released on May 16, 2011 – ${now.getFullYear() - 2011} years of digging.`,
              itemIcon('SliceOfCake'),
            )
            bigConfetti()
          }, 1500),
        )
      }
    }
    return () => timers.forEach(clearTimeout)
  }, [enabled, season])

  // a rare bunny on some visits
  useEffect(() => {
    if (!enabled || Math.random() >= 1 / 500) return
    const timer = setTimeout(bunny, 4000)
    return () => clearTimeout(timer)
  }, [enabled])
}

/**
 * Progress moments (G8): the first item of a playthrough, everything collected, the whole bestiary,
 * and both (the end credits). Only on a change of the checked items or bestiary entries - not when a
 * file is loaded or the playthrough switched. `?egg=bestiary` / `?egg=credits` show them for testing.
 */
export function useProgressEggs(overall: { total: number; obtained: number } | undefined) {
  const enabled = usePrefs((s) => s.layout.easterEggs)
  const pt = useActivePlaythrough()
  const bestiary = useBestiaryProgress()
  const itemsDone = !!overall && overall.total > 0 && overall.obtained === overall.total
  const bestiaryDone = bestiary.total > 0 && bestiary.obtained === bestiary.total
  // game versions without a bestiary: the items alone complete the playthrough
  const allDone = itemsDone && (bestiaryDone || bestiary.total === 0)
  const prev = useRef<{
    id?: string
    checked?: string[]
    unlocked?: string[]
    itemsDone: boolean
    bestiaryDone: boolean
  } | null>(null)

  // the lasting rewards (gold star, golden tree, credits in the menu) follow the progress
  useEffect(() => {
    useTrophies.setState({ items: itemsDone, bestiary: bestiaryDone, all: allDone })
  }, [itemsDone, bestiaryDone, allDone])

  useEffect(() => {
    const now = { id: pt?.id, checked: pt?.checked, unlocked: pt?.bestiary, itemsDone, bestiaryDone }
    const p = prev.current
    prev.current = now
    if (!enabled || !p || !pt || p.id !== now.id) return
    if (p.checked === now.checked && p.unlocked === now.unlocked) return
    // once per playthrough (remembered in the browser), not again after unchecking everything
    if (p.checked?.length === 0 && pt.checked.length > 0 && !seenOnce('egg-first-item', pt.id))
      achievement(
        'Your adventure begins',
        'The first item of this playthrough. Many more to go!',
        itemIcon('CopperShortsword'),
      )
    const itemsNow = !p.itemsDone && itemsDone
    const bestiaryNow = !p.bestiaryDone && bestiaryDone
    // the second of the two completes the playthrough: the credits instead of its own moment
    // (once per playthrough; after the "filters complete" toast, which waits 0.4 s)
    if (allDone && (itemsNow || bestiaryNow) && !seenOnce('egg-credits', pt.id)) {
      setTimeout(() => useEndCredits.getState().show(), 1200)
      return
    }
    if (itemsNow)
      setTimeout(() => {
        achievement(
          'Everything collected!',
          `All ${overall!.total.toLocaleString('en')} items of this playthrough. Legendary.`,
          itemIcon('Zenith'),
        )
        goldConfetti()
      }, 700)
    if (bestiaryNow && !seenOnce('egg-bestiary', pt.id)) setTimeout(() => bestiaryComplete(bestiary.total), 700)
  }, [enabled, pt, itemsDone, bestiaryDone, allDone, overall, bestiary.total])

  // testing: ?egg=bestiary / ?egg=credits (once the playthrough is there)
  const ready = !!pt && !!overall
  useEffect(() => {
    if (!enabled || !ready) return
    const egg = new URLSearchParams(window.location.search).get('egg')
    const timer = setTimeout(() => {
      if (egg === 'bestiary') bestiaryComplete(useStore.getState().data?.bestiary.entries.length ?? 0)
      if (egg === 'credits') useEndCredits.getState().show()
    }, 1500)
    return () => clearTimeout(timer)
  }, [enabled, ready])
}

/** The whole bestiary: an achievement and a parade of critters. */
function bestiaryComplete(total: number) {
  achievement(
    'Bestiary complete!',
    `All ${total.toLocaleString('en')} entries. The Zoologist would be proud.`,
    itemIcon('Bunny'),
  )
  critterParade()
}

/** Whether a once-per-playthrough moment ("egg-…") was shown for a playthrough; marks it as shown. */
function seenOnce(key: string, playthroughId: string): boolean {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (seen.includes(playthroughId)) return true
    localStorage.setItem(key, JSON.stringify([...seen, playthroughId]))
  } catch {
    // storage unavailable: show it
  }
  return false
}

/** The browser tab icon in the seasonal look of the logo (G8) - on every screen. */
export function useSeasonalFavicon() {
  const enabled = usePrefs((s) => s.layout.easterEggs)
  const season = useSeasonClock()
  useEffect(() => {
    const theme = logoThemeOf()
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link || !enabled || !theme) return
    const original = link.href
    link.href = `data:image/svg+xml,${encodeURIComponent(logoSvgMarkup(theme))}`
    return () => {
      link.href = original
    }
  }, [enabled, season])
}
