import { useState } from 'react'
import { Info, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { AboutDialog } from '../About'
import { SettingsDialog } from '../Settings'
import { GitHubMark, REPO } from './GitHubLink'

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
]

/** The small buttons at the top right: GitHub, theme, about, settings. */
export function SettingsMenu() {
  const [dialog, setDialog] = useState<'settings' | 'about' | null>(null)
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={REPO} target="_blank" rel="noreferrer noopener" title="Source code on GitHub" aria-label="GitHub">
          <GitHubMark className="size-4" />
        </a>
      </Button>
      <ThemeButton />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setDialog('about')}
        aria-label="About, licenses"
        title="About, licenses"
      >
        <Info />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setDialog('settings')}
        aria-label="Settings"
        title="Settings"
      >
        <Settings />
      </Button>
      <SettingsDialog open={dialog === 'settings'} onOpenChange={(o) => setDialog(o ? 'settings' : null)} />
      <AboutDialog open={dialog === 'about'} onOpenChange={(o) => setDialog(o ? 'about' : null)} />
    </div>
  )
}

/** Light → dark → system (follows the operating system) → light; the icon shows the current one. */
function ThemeButton() {
  const { theme, setTheme } = useTheme()
  const i = Math.max(
    0,
    THEMES.findIndex((t) => t.id === theme),
  )
  const current = THEMES[i]
  const next = THEMES[(i + 1) % THEMES.length]
  const label = `Theme: ${current.label} – click for ${next.label}`
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setTheme(next.id)} title={label} aria-label={label}>
      <current.Icon />
    </Button>
  )
}
