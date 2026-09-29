import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    // storage unavailable
  }
  return 'system'
}

const resolve = (t: Theme): 'light' | 'dark' => (t === 'system' ? (media.matches ? 'dark' : 'light') : t)

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', resolve(t) === 'dark')
}

export const useTheme = create<{ theme: Theme; resolved: 'light' | 'dark'; setTheme(t: Theme): void }>()((set) => {
  const theme = readTheme()
  apply(theme)
  media.addEventListener('change', () => {
    const t = useTheme.getState().theme
    apply(t)
    set({ resolved: resolve(t) })
  })
  return {
    theme,
    resolved: resolve(theme),
    setTheme(t) {
      try {
        localStorage.setItem(KEY, t)
      } catch {
        // ignore
      }
      apply(t)
      set({ theme: t, resolved: resolve(t) })
    },
  }
})
