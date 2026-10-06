import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useElementWidth } from '@/hooks/useElementWidth'
import {
  bucketLabel,
  dayDate,
  formatDay,
  niceTicks,
  weekStart,
  type Bucket,
  type BucketSize,
  type Series,
} from '@/lib/stats'

// The charts of the statistics view (ST), drawn as SVG to the width of their card. One series
// per chart in the app's accent color; axes and grid as hairlines in the muted color, every
// value reachable by hovering (a crosshair on the time charts, the cell on the calendar).

const AXIS_LEFT = 40
const AXIS_BOTTOM = 20
const TOP = 8

/** Hover readout of a chart, positioned over the plot. */
export interface Tip {
  x: number
  y: number
  content: ReactNode
}

function TipBox({ tip, width }: { tip: Tip; width: number }) {
  // kept inside the chart: flipped to the left near the right edge
  const flip = tip.x > width - 140
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={{ left: tip.x, top: tip.y, transform: `translate(${flip ? 'calc(-100% - 10px)' : '10px'}, -50%)` }}
    >
      {tip.content}
    </div>
  )
}

/** Rectangle with rounded top corners (a column: round at the data end, square at the baseline). */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  if (h <= 0) return ''
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** "3 Sep" / "Sep" / "Jan 2026" - the x labels of the time charts, thinned to what fits. */
function xLabels(buckets: Bucket[], size: BucketSize, slot: number): { i: number; text: string }[] {
  const out: { i: number; text: string }[] = []
  if (size === 'day') {
    const every = Math.max(1, Math.ceil(44 / slot))
    for (let i = 0; i < buckets.length; i += every)
      out.push({ i, text: formatDay(buckets[i].start, { day: 'numeric', month: 'short' }) })
  } else {
    // where a new month (or year) begins: the month of a week is the one its last day is in
    let lastMonth = -1
    let lastYear = -1
    let lastX = -Infinity
    for (let i = 0; i < buckets.length; i++) {
      const day = size === 'week' ? buckets[i].end - 1 : buckets[i].start
      const d = dayDate(day)
      const month = d.getUTCMonth()
      const year = d.getUTCFullYear()
      if (month === lastMonth && year === lastYear) continue
      if (i * slot - lastX < 40) {
        lastMonth = month
        lastYear = year
        continue
      }
      out.push({
        i,
        text:
          year !== lastYear && lastYear !== -1
            ? formatDay(day, { month: 'short', year: 'numeric' })
            : formatDay(day, { month: 'short' }),
      })
      lastMonth = month
      lastYear = year
      lastX = i * slot
    }
  }
  return out
}

/**
 * Two plots over the same days: the running total as a line (with a light wash below it) and
 * the changes per day / week / month as columns. The pointer picks a bucket, read out in both.
 */
export function TimeChart({ series, unit, className }: { series: Series; unit: string; className?: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const { buckets, size } = series
  const lineH = 150
  const barH = 90
  const gap = 22
  const height = TOP + lineH + gap + barH + AXIS_BOTTOM
  const plotW = Math.max(0, width - AXIS_LEFT - 8)
  const n = buckets.length
  const slot = n ? plotW / n : plotW
  const x = (i: number) => AXIS_LEFT + (i + 0.5) * slot

  const maxTotal = Math.max(1, buckets[n - 1]?.cumulative ?? 0)
  const totalTicks = niceTicks(maxTotal)
  const totalTop = totalTicks[totalTicks.length - 1]
  const yTotal = (v: number) => TOP + lineH - (v / totalTop) * lineH

  const maxCount = Math.max(1, ...buckets.map((b) => b.count))
  const countTicks = niceTicks(maxCount, 2)
  const countTop = countTicks[countTicks.length - 1]
  const barTop = TOP + lineH + gap
  const yCount = (v: number) => barTop + barH - (v / countTop) * barH

  const linePoints = buckets.map((b, i) => `${x(i)},${yTotal(b.cumulative)}`)
  const startY = yTotal(series.before)
  const line = n ? `M${AXIS_LEFT},${startY} L${linePoints.join(' L')}` : ''
  const area = n ? `${line} L${x(n - 1)},${yTotal(0)} L${AXIS_LEFT},${yTotal(0)} Z` : ''
  const barW = Math.max(1, Math.min(24, slot - 2))

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left - AXIS_LEFT
    if (!n || px < 0 || px > plotW) return setHover(null)
    setHover(Math.min(n - 1, Math.max(0, Math.floor(px / slot))))
  }

  const h = hover !== null ? buckets[hover] : null
  const tip: Tip | null = h && {
    x: x(hover!),
    y: TOP + lineH / 2,
    content: (
      <>
        <div className="text-muted-foreground">{bucketLabel(h, size)}</div>
        <div>
          <strong className="tabular-nums">{h.cumulative.toLocaleString('en')}</strong> {unit} in total
        </div>
        <div>
          <strong className="tabular-nums">+{h.count.toLocaleString('en')}</strong>{' '}
          {size === 'day' ? 'that day' : size === 'week' ? 'that week' : 'that month'}
        </div>
      </>
    ),
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-none select-none"
          onPointerMove={pick}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${unit} over time`}
        >
          {/* grid and ticks of the total */}
          {totalTicks.map((t) => (
            <g key={`t${t}`}>
              <line x1={AXIS_LEFT} x2={width - 8} y1={yTotal(t)} y2={yTotal(t)} className="stroke-foreground/10" />
              <text
                x={AXIS_LEFT - 6}
                y={yTotal(t)}
                dy="0.35em"
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {t.toLocaleString('en')}
              </text>
            </g>
          ))}
          {/* grid and ticks of the changes */}
          {countTicks.map((t) => (
            <g key={`c${t}`}>
              <line x1={AXIS_LEFT} x2={width - 8} y1={yCount(t)} y2={yCount(t)} className="stroke-foreground/10" />
              <text
                x={AXIS_LEFT - 6}
                y={yCount(t)}
                dy="0.35em"
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {t.toLocaleString('en')}
              </text>
            </g>
          ))}
          {/* the running total */}
          <path d={area} className="fill-primary/10" />
          <path d={line} className="fill-none stroke-primary stroke-2" strokeLinejoin="round" strokeLinecap="round" />
          {n > 0 && (
            <circle
              cx={x(n - 1)}
              cy={yTotal(buckets[n - 1].cumulative)}
              r={4}
              className="fill-primary stroke-card stroke-2"
            />
          )}
          {/* the changes per bucket */}
          {buckets.map((b, i) =>
            b.count > 0 ? (
              <path
                key={b.start}
                d={columnPath(x(i) - barW / 2, yCount(b.count), barW, yCount(0) - yCount(b.count))}
                className={cn('fill-primary', hover !== null && hover !== i && 'opacity-60')}
              />
            ) : null,
          )}
          <line x1={AXIS_LEFT} x2={width - 8} y1={yCount(0)} y2={yCount(0)} className="stroke-foreground/25" />
          {/* x labels */}
          {xLabels(buckets, size, slot).map(({ i, text }) => (
            <text
              key={i}
              x={size === 'day' ? x(i) : x(i) - slot / 2 + 2}
              y={height - 6}
              textAnchor={size === 'day' ? 'middle' : 'start'}
              className="fill-muted-foreground text-[10px]"
            >
              {text}
            </text>
          ))}
          {/* crosshair */}
          {h && (
            <g className="pointer-events-none">
              <line x1={x(hover!)} x2={x(hover!)} y1={TOP} y2={yCount(0)} className="stroke-foreground/40" />
              <circle cx={x(hover!)} cy={yTotal(h.cumulative)} r={4} className="fill-primary stroke-card stroke-2" />
            </g>
          )}
        </svg>
      )}
      {tip && <TipBox tip={tip} width={width} />}
    </div>
  )
}

/** The accent color in four steps for the calendar: a share of the primary over the card (mixed
 * in oklab - in oklch the hue of the near-gray card would pull the light steps towards blue). */
const HEAT = [
  'color-mix(in oklab, var(--primary) 30%, var(--card))',
  'color-mix(in oklab, var(--primary) 55%, var(--card))',
  'color-mix(in oklab, var(--primary) 78%, var(--card))',
  'var(--primary)',
]

/**
 * A calendar of the last weeks, a cell per day colored by the number of changes (GitHub-style).
 * Weeks are columns (Monday at the top); as many as fit the width, at most a year.
 */
export function Calendar({
  byDay,
  today,
  className,
}: {
  byDay: Map<number, number>
  today: number
  className?: string
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const cell = 11
  const step = 14
  const left = 28
  const top = 16
  const weeks = Math.max(4, Math.min(53, Math.floor((width - left) / step)))
  const firstWeek = weekStart(today) - 7 * (weeks - 1)
  const height = top + 7 * step
  const max = Math.max(1, ...[...byDay.entries()].filter(([d]) => d >= firstWeek).map(([, n]) => n))
  const level = (n: number) => (n <= 0 ? -1 : Math.min(3, Math.floor(((n - 1) / max) * 4)))

  // a month label over the week that holds its first day (and over the first week), if there is
  // room after the last label
  const months: { x: number; text: string }[] = []
  for (let w = 0; w < weeks; w++) {
    const monday = firstWeek + 7 * w
    const first = Array.from({ length: 7 }, (_, d) => monday + d).find(
      (day) => day <= today && (dayDate(day).getUTCDate() === 1 || (w === 0 && day === monday)),
    )
    if (first === undefined) continue
    const x = left + w * step
    const last = months[months.length - 1]
    if (!last || x - last.x >= 30) months.push({ x, text: formatDay(first, { month: 'short' }) })
  }

  const show = (day: number, n: number, cx: number, cy: number) =>
    setTip({
      x: cx,
      y: cy,
      content: (
        <>
          <div className="text-muted-foreground">
            {formatDay(day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div>
            <strong className="tabular-nums">{n.toLocaleString('en')}</strong> {n === 1 ? 'change' : 'changes'}
          </div>
        </>
      ),
    })

  return (
    <div ref={ref} className={cn('relative', className)}>
      {width > 0 && (
        <svg width={width} height={height} className="block select-none" role="img" aria-label="Changes per day">
          {months.map((m) => (
            <text key={m.x} x={m.x} y={10} className="fill-muted-foreground text-[10px]">
              {m.text}
            </text>
          ))}
          {[0, 2, 4].map((d) => (
            <text key={d} x={0} y={top + d * step + cell / 2} dy="0.35em" className="fill-muted-foreground text-[10px]">
              {['Mon', '', 'Wed', '', 'Fri'][d]}
            </text>
          ))}
          {Array.from({ length: weeks }, (_, w) =>
            Array.from({ length: 7 }, (_, d) => {
              const day = firstWeek + 7 * w + d
              if (day > today) return null
              const n = byDay.get(day) ?? 0
              const l = level(n)
              const cx = left + w * step
              const cy = top + d * step
              return (
                <rect
                  key={day}
                  x={cx}
                  y={cy}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={l < 0 ? undefined : HEAT[l]}
                  className={cn(l < 0 && 'fill-foreground/[0.07]', day === today && 'stroke-foreground/50')}
                  onPointerEnter={() => show(day, n, cx + cell, cy + cell / 2)}
                  onPointerLeave={() => setTip(null)}
                />
              )
            }),
          )}
        </svg>
      )}
      {tip && <TipBox tip={tip} width={width} />}
    </div>
  )
}

/** Less … more: the steps of the calendar. */
export function CalendarLegend() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      less
      <span className="inline-block size-[11px] rounded-[2px] bg-foreground/[0.07]" />
      {HEAT.map((c) => (
        <span key={c} className="inline-block size-[11px] rounded-[2px]" style={{ background: c }} />
      ))}
      more
    </span>
  )
}

/** A horizontal meter: the obtained share of a row, filled in the accent color on a muted track. */
export function Meter({ obtained, total, className }: { obtained: number; total: number; className?: string }) {
  const p = total ? (100 * obtained) / total : 0
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-foreground/10', className)} role="presentation">
      <div
        className={cn('h-full rounded-full', p >= 100 ? 'bg-emerald-500' : 'bg-primary')}
        style={{ width: `${p}%` }}
      />
    </div>
  )
}

/** A number with its label (and a line under it), for the facts above the charts. */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2', className)}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-xl font-semibold">{value}</div>
      {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
