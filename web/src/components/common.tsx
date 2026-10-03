import { useState } from 'react'
import { Check, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPercent, percent, type Tally } from '@/lib/filtering'
import { useStore } from '@/store'
import { findSprite, type Sprite } from '@/lib/sprites'
import { RARITIES, TOOLTIP_ICONS } from './common-data'
import type { Difficulty } from '@/lib/types'
import { plural } from '@/lib/format'

/** The icon's place in the app's sprite sheets (build_icons.py), if it is packed there. */
function useSprite(src?: string): Sprite | undefined {
  return findSprite(
    useStore((s) => s.data?.sprites),
    src,
  )
}

/** A sprite drawn at `scale` (pixelated). */
function SpriteImage({ sprite, scale, alt, title }: { sprite: Sprite; scale: number; alt: string; title?: string }) {
  return (
    <span
      role="img"
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      title={title}
      className="inline-block shrink-0 [image-rendering:pixelated]"
      style={{
        width: sprite.w * scale,
        height: sprite.h * scale,
        backgroundImage: `url(${import.meta.env.BASE_URL}${sprite.file})`,
        backgroundPosition: `${-sprite.x * scale}px ${-sprite.y * scale}px`,
        backgroundSize: `${sprite.sheetW * scale}px ${sprite.sheetH * scale}px`,
      }}
    />
  )
}

/** A wiki icon: from the app's sprite sheets if packed there (build_icons.py), else loaded from
 * the wiki. Native size, scaled down to fit the box, pixelated. */
export function WikiIcon({
  src,
  alt,
  size = 32,
  className,
  upscale = false,
}: {
  src?: string
  alt: string
  size?: number
  className?: string
  /** also scale small icons up to fill the box (pixelated) */
  upscale?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const sprite = useSprite(src)
  const box = { width: size, height: size }
  if (sprite) {
    return (
      <span style={box} className={cn('flex shrink-0 items-center justify-center', className)}>
        <SpriteImage
          sprite={sprite}
          scale={Math.min(upscale ? Infinity : 1, size / sprite.w, size / sprite.h)}
          alt={alt}
        />
      </span>
    )
  }
  if (!src || failed) {
    return (
      <span style={box} className={cn('grid shrink-0 place-items-center text-muted-foreground/50', className)}>
        <ImageOff className="size-3.5" />
      </span>
    )
  }
  return (
    // flex, not grid: max-h-full only takes effect with a definite flex container height,
    // so taller images (e.g. 18×26 in a 16 px box) are scaled down instead of overflowing
    <span style={box} className={cn('flex shrink-0 items-center justify-center', className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('max-h-full max-w-full object-contain [image-rendering:pixelated]', upscale && 'h-full w-full')}
        draggable={false}
      />
    </span>
  )
}

export function TallyText({ tally, className }: { tally: Tally; className?: string }) {
  return (
    <span className={cn('tabular-nums text-muted-foreground', className)}>
      {tally.obtained}/{tally.total}
      <span className="ml-1.5 inline-block min-w-[4.2em] text-right font-medium text-foreground/80">
        {formatPercent(tally)}
      </span>
    </span>
  )
}

export function TallyBar({ tally, className }: { tally: Tally; className?: string }) {
  const p = percent(tally)
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-foreground/15', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          p >= 100 ? 'bg-emerald-500' : 'bg-primary',
        )}
        style={{ width: `${p}%` }}
      />
    </div>
  )
}

/** Rarity as the wiki's colored name image ("Pink" in pink), falling back to text. */
/** The wiki's icon of a world difficulty (Classic, Expert, Master, Journey). */
export function DifficultyIcon({ difficulty, size = 16 }: { difficulty: Difficulty; size?: number }) {
  const src = useStore((s) => s.data?.difficultyIcons[difficulty])
  if (!src) return null
  return <WikiIcon src={src} alt="" size={size} />
}

export function RarityIcon({ rarity }: { rarity?: number }) {
  const entry = useStore((s) => (rarity === undefined ? undefined : s.data?.rarities.get(rarity)))
  const sprite = useSprite(entry?.icon)
  if (rarity === undefined) return null
  const name = entry?.name ?? RARITIES[rarity]?.name ?? String(rarity)
  if (!entry?.icon) return <span>{name}</span>
  const title = `Rarity: ${name} (${rarity})`
  // 18 px high, like the image below
  if (sprite) return <SpriteImage sprite={sprite} scale={18 / sprite.h} alt={name} title={title} />
  return (
    <img
      src={entry.icon}
      alt={name}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-[18px] w-auto [image-rendering:pixelated]"
      draggable={false}
    />
  )
}

/** A value in copper coins shown as coin amounts with the wiki's coin icons, e.g. 2 [gold] 50 [silver]. */
export function Coins({ value }: { value?: number }) {
  const coins = useStore((s) => s.data?.coins)
  if (!value || !coins) return null
  let rest = value
  const parts = coins.map((c) => {
    const n = Math.floor(rest / c.value)
    rest -= n * c.value
    return { coin: c, n }
  })
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {parts
        .filter((p) => p.n > 0)
        .map(({ coin, n }) => (
          <span key={coin.id} className="inline-flex items-center gap-0.5" title={plural(n, coin.name)}>
            {n}
            {coin.icon ? <CoinIcon src={coin.icon} name={coin.name} /> : coin.id[0]}
          </span>
        ))}
    </span>
  )
}

/** A coin icon, 16 px high. */
function CoinIcon({ src, name }: { src: string; name: string }) {
  const sprite = useSprite(src)
  if (sprite) return <SpriteImage sprite={sprite} scale={16 / sprite.h} alt={name} />
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-4 w-auto [image-rendering:pixelated]"
      draggable={false}
    />
  )
}

/** Green checkmark of an obtained item (detail panel lists), "Obtained" on hover. */
export function ObtainedMark({ small = false }: { small?: boolean }) {
  return (
    <span title="Obtained" className="inline-flex shrink-0">
      <Check
        className={cn(small ? 'size-3' : 'size-3.5', 'text-emerald-600 dark:text-emerald-400')}
        aria-label="Obtained"
      />
    </span>
  )
}

// ------------------------------------------------------------ tooltip icons

/** An item tooltip with its platform icons. */
export function TooltipText({ text }: { text: string }) {
  // split with a capture group: every second part is an icon id
  const parts = text.split(/\{icon:([a-z0-9-]+)\}/)
  return <>{parts.map((part, i) => (i % 2 ? <PlatformIcon key={i} id={part} /> : part))}</>
}

function PlatformIcon({ id }: { id: string }) {
  const icon = TOOLTIP_ICONS[id]
  if (!icon) return null
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/platforms/${icon.file}`}
      alt={icon.name}
      title={icon.name}
      draggable={false}
      className={cn(
        'inline-block h-3 w-auto align-[-1px]',
        icon.invert && 'dark:invert',
        icon.pixel && '[image-rendering:pixelated]',
      )}
    />
  )
}
