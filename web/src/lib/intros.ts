import { useEffect, useState } from 'react'
import { fetchOptional } from './data'

// The introductions of the wiki pages (intros.json, REQUIREMENTS D24): not loaded with the rest
// of the data, but when a detail panel first shows one.

/** A block of an introduction: a paragraph, or the entries of a list. */
export type IntroBlock = string | string[]
type Intros = Record<string, IntroBlock[]>

let intros: Intros | undefined
let loading: Promise<Intros> | undefined

/** The introduction of a wiki page; undefined while it loads and for a page without one. */
export function useIntro(page: string): IntroBlock[] | undefined {
  const [loaded, setLoaded] = useState(intros)
  useEffect(() => {
    if (loaded) return
    let active = true
    loading ??= fetchOptional<Intros>('intros', {})
    void loading.then((all) => {
      intros = all
      if (active) setLoaded(all)
    })
    return () => {
      active = false
    }
  }, [loaded])
  return loaded?.[page]
}
