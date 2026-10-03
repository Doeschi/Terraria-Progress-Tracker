import { useActivePlaythrough, useStore, type TrackerMode } from '@/store'
import { useBestiaryProgress } from '@/hooks/useBestiaryView'
import { bestiaryExists } from '@/lib/bestiary'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { TrackerView } from '@/hooks/useTrackerView'
import { TallyBar, TallyText } from './common'
import { usePrefs } from '@/lib/prefs'
import { useEndCredits, useTrophies } from '@/lib/trophies'
import { Clapperboard, Menu, Star } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useIsPhone } from '@/hooks/useIsPhone'
import { Button } from '@/components/ui/button'
import { Field } from './topbar/Field'
import { AutosaveStatus, FileMenu } from './topbar/FileMenu'
import { PlaythroughMenu } from './topbar/PlaythroughControls'
import { SyncButton, WorldMenu } from './topbar/WorldMenu'
import { PlayerMenu } from './topbar/PlayerMenu'
import { HeaderSnow } from './topbar/HeaderSnow'
import { HeaderLogo } from './topbar/HeaderLogo'
import { SettingsMenu } from './topbar/SettingsMenu'

export function TopBar({ view }: { view: TrackerView | null }) {
  const phone = useIsPhone()
  if (phone) return <PhoneTopBar view={view} />
  return <DesktopTopBar view={view} />
}

/** "Dev" next to the logo when the page comes from the dev server (Vite's development build, much
 * slower than the published production build). */
function DevBadge() {
  if (!import.meta.env.DEV) return null
  return (
    <span
      className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-amber-700 uppercase dark:text-amber-400"
      title="Development build (dev server) - slower than the published site"
    >
      Dev
    </span>
  )
}

/** Phones (MO1): one slim row - logo, playthrough, Items / Bestiary and a menu (☰) with the rest
 * of the desktop top bar; the item progress as a thin line below it. */
function PhoneTopBar({ view }: { view: TrackerView | null }) {
  const hasPlaythrough = useActivePlaythrough() !== null
  const overall = view?.overall
  return (
    <header className="relative z-40 border-b bg-background/80 backdrop-blur">
      <HeaderSnow />
      <div className="flex items-center gap-2 px-2 py-1.5">
        <HeaderLogo />
        <DevBadge />
        {/* the playthrough button takes the room that is left */}
        <div className="flex min-w-0 flex-1 [&_button]:max-w-full">{hasPlaythrough && <PlaythroughMenu />}</div>
        {view && <ModeSwitch />}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-sm" title="Menu" aria-label="Menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 gap-0 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Terraria Progress Tracker</SheetTitle>
              <SheetDescription className="sr-only">File, player, world, progress and settings</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <Field label="File" extra={<AutosaveStatus />}>
                <FileMenu />
              </Field>
              {hasPlaythrough && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Player">
                    <PlayerMenu />
                  </Field>
                  <Field label="World">
                    <WorldMenu />
                  </Field>
                  <SyncButton />
                </div>
              )}
              {view && (
                <Field label="Progress" title="Overall progress of this playthrough">
                  <ProgressBars view={view} />
                </Field>
              )}
              <SettingsMenu />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      {overall && overall.total > 0 && (
        <div
          className="h-0.5 bg-primary"
          style={{ width: `${(100 * overall.obtained) / overall.total}%` }}
          title={`${overall.obtained} of ${overall.total} items`}
        />
      )}
    </header>
  )
}

function DesktopTopBar({ view }: { view: TrackerView | null }) {
  const hasPlaythrough = useActivePlaythrough() !== null
  // three columns: logo (left) | file + playthrough (centered) | theme (right)
  return (
    <header className="relative z-40 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b bg-background/80 px-3 py-2 backdrop-blur">
      <HeaderSnow />
      <div className="flex items-center gap-2 font-semibold">
        <HeaderLogo />
        <span className="hidden 2xl:inline">Terraria Progress Tracker</span>
        <DevBadge />
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <div className="rounded-xl border bg-card/60 px-2 pt-1 pb-1.5">
          <Field label="File" extra={<AutosaveStatus />}>
            <FileMenu />
          </Field>
        </div>
        {/* everything that belongs to the active playthrough, kept together when wrapping */}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1 rounded-xl border bg-card/60 px-2 pt-1 pb-1.5">
          <Field label="Playthrough">
            <PlaythroughMenu />
          </Field>
          {/* a world belongs to a playthrough: nothing to show without one */}
          {hasPlaythrough && (
            <Field label="Player">
              <PlayerMenu />
            </Field>
          )}
          {hasPlaythrough && (
            <Field label="World">
              <WorldMenu />
            </Field>
          )}
          {/* one sync for both: right of Player and World */}
          {hasPlaythrough && <SyncButton />}
          {view && (
            <Field label="Progress" title="Overall progress of this playthrough">
              <ProgressBars view={view} />
            </Field>
          )}
        </div>
        {view && (
          // in a card like the playthrough box
          <div className="rounded-xl border bg-card/60 px-2 pt-1 pb-1.5">
            <Field label="Collection">
              <ModeSwitch />
            </Field>
          </div>
        )}
      </div>
      <SettingsMenu />
    </header>
  )
}

/** Item progress, and below it the bestiary progress (if the game version has one). */
function ProgressBars({ view }: { view: TrackerView }) {
  const data = useStore((s) => s.data)!
  const gameVersion = useActivePlaythrough()?.gameVersion ?? null
  const bestiary = useBestiaryProgress()
  const rows = [{ label: 'Items', tally: view.overall }]
  if (bestiaryExists(data, gameVersion)) rows.push({ label: 'Bestiary', tally: bestiary })
  return (
    <div className="flex h-8 flex-col justify-center gap-0.5 px-1 text-xs">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-12 text-muted-foreground">{r.label}</span>
          <TallyBar tally={r.tally} className="h-1.5 w-20" />
          <TallyText tally={r.tally} />
        </div>
      ))}
    </div>
  )
}

/** Switch between the item list and the bestiary. */
function ModeSwitch() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  // easter egg (G8): a gold star once the whole bestiary is unlocked
  const bestiaryDone = useTrophies((s) => s.bestiary)
  const eggs = usePrefs((s) => s.layout.easterEggs)
  const star = bestiaryDone && eggs
  // ... and the end credits again, once the playthrough is complete
  const allDone = useTrophies((s) => s.all)
  const showCredits = useEndCredits((s) => s.show)
  return (
    <div className="flex items-center gap-1">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(v) => v && setMode(v as TrackerMode)}
        aria-label="Items or bestiary"
      >
        <ToggleGroupItem value="items">Items</ToggleGroupItem>
        <ToggleGroupItem value="bestiary" title={star ? 'Bestiary complete!' : undefined}>
          Bestiary
          {star && <Star className="size-3 fill-amber-400 text-amber-500" aria-label="complete" />}
        </ToggleGroupItem>
      </ToggleGroup>
      {allDone && eggs && (
        <Button
          variant="outline"
          size="icon-sm"
          onClick={showCredits}
          title="Watch the credits again"
          aria-label="Watch the credits again"
        >
          <Clapperboard className="text-amber-500" />
        </Button>
      )}
    </div>
  )
}
