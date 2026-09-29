import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPercent, percent, type Tally } from '@/lib/filtering'
import { useStore } from '@/store'
import { RARITIES } from './common-data'
import type { Difficulty } from '@/lib/types'
import { plural } from '@/lib/format'

/** Icon loaded directly from the wiki. */
export function WikiIcon({
  src,
  alt,
  size = 32,
  className,
}: {
  src?: string
  alt: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size }
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
        className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
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
  if (rarity === undefined) return null
  const name = entry?.name ?? RARITIES[rarity]?.name ?? String(rarity)
  if (!entry?.icon) return <span>{name}</span>
  return (
    <img
      src={entry.icon}
      alt={name}
      title={`Rarity: ${name} (${rarity})`}
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
            {coin.icon ? (
              <img
                src={coin.icon}
                alt={coin.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-4 w-auto [image-rendering:pixelated]"
                draggable={false}
              />
            ) : (
              coin.id[0]
            )}
          </span>
        ))}
    </span>
  )
}
