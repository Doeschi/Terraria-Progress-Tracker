import { useMemo, useState, type ReactNode } from 'react'
import { Skull, Timer, Trophy } from 'lucide-react'
import { useActivePlayer, useActivePlaythrough, useStore } from '@/store'
import type { TrackerView } from '@/hooks/useTrackerView'
import { buildFilterGroups } from '@/lib/filtering'
import { bestiaryExists, buildBestiaryGroups, entriesForPlaythrough } from '@/lib/bestiary'
import type { AnyGroup } from '@/lib/filterView'
import {
  activity,
  breakdown,
  completedOptions,
  dayOf,
  formatDay,
  formatDuration,
  formatRate,
  pace,
  series,
  today,
  WEEKDAYS,
  type Pace,
  type Range,
} from '@/lib/stats'
import { formatTime, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Coins, WikiIcon } from '@/components/common'
import { Calendar, CalendarLegend, Meter, StatTile, TimeChart } from './charts'

// The statistics of the active playthrough (ST): how the collection grew over time, the days
// with progress, the filters completed, the progress per category, the character's numbers.

const RANGES: { value: Range; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 90, label: '90 days' },
  { value: 30, label: '30 days' },
]

export function StatsScreen({ view }: { view: TrackerView }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const player = useActivePlayer()
  const [range, setRange] = useState<Range>('all')
  const now = today()
  const createdDay = dayOf(pt.createdAt)

  // the days of the changes: items checked now, by when they were checked (items checked before
  // the file recorded times count for the day the playthrough was created)
  const itemDays = useMemo(
    () =>
      view.platformItems
        .filter((i) => view.checked.has(i.key) && !view.ignored.has(i.key))
        .map((i) => dayOf(pt.changedAt[i.key] ?? pt.createdAt)),
    [view.platformItems, view.checked, view.ignored, pt.changedAt, pt.createdAt],
  )
  const itemTotal = useMemo(
    () => view.platformItems.filter((i) => !view.ignored.has(i.key)).length,
    [view.platformItems, view.ignored],
  )

  const hasBestiary = bestiaryExists(data, pt.gameVersion)
  const entries = useMemo(
    () => (hasBestiary ? entriesForPlaythrough(data, { platform: pt.platform, gameVersion: pt.gameVersion }) : []),
    [data, hasBestiary, pt.platform, pt.gameVersion],
  )
  const bestiaryDays = useMemo(() => {
    const unlocked = new Set(pt.bestiary)
    return entries.filter((e) => unlocked.has(e.id)).map((e) => dayOf(pt.bestiaryChangedAt[e.id] ?? pt.createdAt))
  }, [entries, pt.bestiary, pt.bestiaryChangedAt, pt.createdAt])

  // every change (checks, unchecks, ignores, bestiary) by its day
  const activityDays = useMemo(
    () => [...Object.values(pt.changedAt), ...Object.values(pt.bestiaryChangedAt)].map(dayOf),
    [pt.changedAt, pt.bestiaryChangedAt],
  )

  const itemSeries = useMemo(() => series(itemDays, createdDay, range, now), [itemDays, createdDay, range, now])
  const bestiarySeries = useMemo(
    () => series(bestiaryDays, createdDay, range, now),
    [bestiaryDays, createdDay, range, now],
  )
  const itemPace = useMemo(
    () => pace(itemDays, createdDay, itemTotal, itemDays.length, range, now),
    [itemDays, createdDay, itemTotal, range, now],
  )
  const bestiaryPace = useMemo(
    () => pace(bestiaryDays, createdDay, entries.length, bestiaryDays.length, range, now),
    [bestiaryDays, createdDay, entries.length, range, now],
  )
  const act = useMemo(() => activity(activityDays, now), [activityDays, now])

  const itemGroups = useMemo(() => buildFilterGroups(data) as AnyGroup[], [data])
  const bestiaryGroups = useMemo(() => buildBestiaryGroups(data) as AnyGroup[], [data])
  const completed = useMemo(() => completedOptions(pt, itemGroups, bestiaryGroups), [pt, itemGroups, bestiaryGroups])

  const rangeText = range === 'all' ? 'since the start' : `last ${range} days`

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Statistics</h2>
            <p className="text-xs text-muted-foreground">
              {pt.name} · started {formatDay(createdDay, { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
              {plural(now - createdDay + 1, 'day')}
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(range)}
            onValueChange={(v) => v && setRange(v === 'all' ? 'all' : (Number(v) as Range))}
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={String(r.value)}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <PaceTiles pace={itemPace} unit="items" rangeText={rangeText} />
        <Card
          title="Items over time"
          hint="The items you have, by the time they were checked - in total, and per period"
        >
          {itemDays.length ? (
            <TimeChart series={itemSeries} unit="items" />
          ) : (
            <Empty>Nothing checked yet - the chart fills as you collect.</Empty>
          )}
        </Card>

        {hasBestiary && (
          <>
            <PaceTiles pace={bestiaryPace} unit="entries" rangeText={rangeText} />
            <Card title="Bestiary over time" hint="Unlocked entries, by the time they were marked">
              {bestiaryDays.length ? (
                <TimeChart series={bestiarySeries} unit="entries" />
              ) : (
                <Empty>No bestiary entry unlocked yet.</Empty>
              )}
            </Card>
          </>
        )}

        <Card
          title="Activity"
          hint="Days with changes - items checked, unchecked or ignored, bestiary entries marked"
          extra={<CalendarLegend />}
        >
          <Calendar byDay={act.byDay} today={now} />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Active days" value={act.activeDays.toLocaleString('en')} />
            <StatTile
              label="Current streak"
              value={plural(act.currentStreak, 'day')}
              hint={act.currentStreak ? 'in a row' : 'no change yesterday or today'}
            />
            <StatTile label="Longest streak" value={plural(act.longestStreak, 'day')} hint="in a row" />
            <StatTile
              label="Busiest weekday"
              value={act.busiestWeekday === null ? '—' : WEEKDAYS[act.busiestWeekday]}
              hint={act.busiestWeekday === null ? undefined : plural(act.weekdays[act.busiestWeekday], 'change')}
            />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Completed filters"
            hint="When each filter option first reached 100 %"
            extra={
              <span className="text-xs text-muted-foreground tabular-nums">{plural(completed.length, 'option')}</span>
            }
          >
            <CompletedList completed={completed} now={now} />
          </Card>
          <Card
            title="Progress by group"
            hint="Obtained items per category and per way to get them, ignored items left out"
          >
            <Breakdown view={view} />
          </Card>
        </div>

        <Card
          title="Character"
          hint={player ? `From the player file ${player.fileName}` : 'From the attached player file'}
        >
          {player ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StatTile
                label="Play time"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Timer className="size-4 text-muted-foreground" /> {formatDuration(player.playTime)}
                  </span>
                }
              />
              <StatTile
                label="Deaths"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Skull className="size-4 text-muted-foreground" /> {player.deaths.pve.toLocaleString('en')}
                  </span>
                }
                hint={player.deaths.pvp ? `+ ${plural(player.deaths.pvp, 'death')} in PvP` : undefined}
              />
              <StatTile label="Angler quests" value={player.anglerQuests.toLocaleString('en')} />
              <StatTile
                label="Golf score"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Trophy className="size-4 text-muted-foreground" /> {player.golfScore.toLocaleString('en')}
                  </span>
                }
              />
              <StatTile label="Tax money" value={player.taxMoney ? <Coins value={player.taxMoney} /> : '—'} />
            </div>
          ) : (
            <Empty>
              Attach a player file (Player in the header) to see play time, deaths, Angler quests, golf score and tax
              money.
            </Empty>
          )}
        </Card>
      </div>
    </main>
  )
}

function Card({
  title,
  hint,
  extra,
  children,
}: {
  title: string
  hint?: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

/** Obtained, remaining, the pace and the projected end - items or bestiary entries. */
function PaceTiles({ pace, unit, rangeText }: { pace: Pace; unit: string; rangeText: string }) {
  const now = today()
  const percent = pace.total ? Math.round((1000 * pace.obtained) / pace.total) / 10 : 0
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile
        label={`${unit[0].toUpperCase()}${unit.slice(1)} obtained`}
        value={pace.obtained.toLocaleString('en')}
        hint={`of ${pace.total.toLocaleString('en')} · ${percent} %`}
      />
      <StatTile label="Remaining" value={pace.remaining.toLocaleString('en')} />
      <StatTile label="Per day" value={formatRate(pace.perDay)} hint={rangeText} />
      <StatTile
        label="Projected completion"
        value={
          pace.remaining <= 0
            ? 'Done!'
            : pace.projected
              ? formatDay(pace.projected, { day: 'numeric', month: 'short', year: 'numeric' })
              : '—'
        }
        hint={
          pace.remaining <= 0
            ? `all ${unit} obtained`
            : pace.projected
              ? `in ${plural(pace.projected - now, 'day')} at this pace`
              : `no ${unit} ${rangeText}`
        }
      />
    </div>
  )
}

function dayHeading(day: number, now: number): string {
  if (day === now) return 'Today'
  if (day === now - 1) return 'Yesterday'
  return formatDay(day, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: day < now - 300 ? 'numeric' : undefined,
  })
}

const FIRST = 25

/** The completed options, newest first, under the day they were completed. */
function CompletedList({ completed, now }: { completed: ReturnType<typeof completedOptions>; now: number }) {
  const [all, setAll] = useState(false)
  if (!completed.length) return <Empty>No filter option completed yet.</Empty>
  const shown = all ? completed : completed.slice(0, FIRST)
  let lastDay: number | null = null
  return (
    <div className="max-h-[32rem] overflow-y-auto pr-1">
      <ol className="flex flex-col gap-1">
        {shown.map((c) => {
          const heading = c.day !== lastDay ? dayHeading(c.day, now) : null
          lastDay = c.day
          return (
            <li key={c.key}>
              {heading && (
                <div className="mt-2 mb-1 text-[11px] font-medium text-muted-foreground first:mt-0">{heading}</div>
              )}
              <div className="flex items-center gap-2 text-sm">
                {c.icon ? <WikiIcon src={c.icon} alt="" size={20} /> : <span className="w-5" />}
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    {c.kind === 'bestiary' ? `Bestiary · ${c.context}` : c.context}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(c.time)}</span>
              </div>
            </li>
          )
        })}
      </ol>
      {!all && completed.length > FIRST && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setAll(true)}>
          Show all {completed.length.toLocaleString('en')}
        </Button>
      )}
    </div>
  )
}

/** Obtained / total per category or per "Obtained by" method, as meters. */
function Breakdown({ view }: { view: TrackerView }) {
  const data = useStore((s) => s.data)!
  const [by, setBy] = useState<'category' | 'obtain'>('category')
  const rows = useMemo(
    () =>
      by === 'category'
        ? breakdown(view.platformItems, view.checked, view.ignored, data.categories, (i) => i.categories)
        : breakdown(
            view.platformItems,
            view.checked,
            view.ignored,
            data.obtain.filter((o) => o.filter !== false),
            (i) => i.obtain,
          ),
    [by, view.platformItems, view.checked, view.ignored, data.categories, data.obtain],
  )
  return (
    <div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={by}
        onValueChange={(v) => v && setBy(v as 'category' | 'obtain')}
        aria-label="Group by"
        className="mb-3"
      >
        <ToggleGroupItem value="category">Categories</ToggleGroupItem>
        <ToggleGroupItem value="obtain">Obtained by</ToggleGroupItem>
      </ToggleGroup>
      <ol className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto pr-1">
        {rows.map((r) => {
          const p = Math.round((100 * r.obtained) / r.total)
          return (
            <li
              key={r.id}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
              title={`${r.name}: ${r.obtained.toLocaleString('en')} of ${r.total.toLocaleString('en')} obtained (${p} %)`}
            >
              {r.icon ? <WikiIcon src={r.icon} alt="" size={20} /> : <span />}
              <span className="truncate">{r.name}</span>
              <Meter obtained={r.obtained} total={r.total} />
              <span
                className={cn(
                  'w-24 text-right text-xs tabular-nums',
                  p >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
              >
                {r.obtained.toLocaleString('en')}/{r.total.toLocaleString('en')} · {p} %
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
