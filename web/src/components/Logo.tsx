import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/lib/prefs'
import { logoThemeOf } from '@/lib/season'
import { LogoArt } from './LogoArt'

/** The app logo: a pixel sprout growing out of a progress bar (public/favicon.svg); in its
 * seasonal look on special days when easter eggs are on (G8). */
export function Logo({ size, className }: { size: number; className?: string }) {
  const eggs = usePrefs((s) => s.layout.easterEggs)
  const theme = useMemo(() => logoThemeOf(), [])
  if (eggs && theme)
    return (
      <span className={cn('shrink-0', className)}>
        <LogoArt size={size} theme={theme} />
      </span>
    )
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 [image-rendering:pixelated]', className)}
      draggable={false}
    />
  )
}
