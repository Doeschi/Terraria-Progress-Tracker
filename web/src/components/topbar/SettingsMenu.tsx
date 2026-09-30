import { useState } from 'react'
import { Check, Info, Monitor, Moon, Settings, SlidersHorizontal, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AboutDialog } from '../About'
import { SettingsDialog } from '../Settings'
import { GitHubMark, REPO } from './GitHubLink'

const THEMES: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
]

/** The ⚙ menu at the top right: settings, theme, about, GitHub. */
export function SettingsMenu() {
  const { theme, setTheme } = useTheme()
  const [dialog, setDialog] = useState<'settings' | 'about' | null>(null)
  const ThemeIcon = THEMES.find((t) => t.id === theme)?.Icon ?? Monitor
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Menu" title="Settings, theme, about">
            <Settings />
            <ThemeIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setDialog('settings')}>
            <SlidersHorizontal /> Settings…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
          {THEMES.map(({ id, label, Icon }) => (
            <DropdownMenuItem key={id} onSelect={() => setTheme(id)}>
              <Icon /> {label}
              {theme === id && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog('about')}>
            <Info /> About, licenses…
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={REPO} target="_blank" rel="noreferrer noopener">
              <GitHubMark /> GitHub
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog open={dialog === 'settings'} onOpenChange={(o) => setDialog(o ? 'settings' : null)} />
      <AboutDialog open={dialog === 'about'} onOpenChange={(o) => setDialog(o ? 'about' : null)} />
    </>
  )
}
