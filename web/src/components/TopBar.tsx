import { Pickaxe } from 'lucide-react'
import { useActivePlaythrough, useStore, type TrackerMode } from '@/store'
import { useBestiaryProgress } from '@/hooks/useBestiaryView'
import { bestiaryExists } from '@/lib/bestiary'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { TrackerView } from '@/hooks/useTrackerView'
import { TallyBar, TallyText } from './common'
import { usePrefs } from '@/lib/prefs'
import { Field } from './topbar/Field'
import { FileMenu } from './topbar/FileMenu'
import { PlaythroughMenu, PlaythroughSettings, PlaythroughSummary } from './topbar/PlaythroughControls'
import { WorldMenu } from './topbar/WorldMenu'
import { SettingsMenu } from './topbar/SettingsMenu'

export function TopBar({ view }: { view: TrackerView | null }) {
  const hasPlaythrough = useActivePlaythrough() !== null
  const separateFields = usePrefs((s) => s.layout.playthroughFields)
  // three columns: logo (left) | file + playthrough (centered) | theme (right)
  return (
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b bg-background/80 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-2 font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Pickaxe className="size-4" />
        </span>
        <span className="hidden 2xl:inline">Terraria Progress</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <div className="rounded-xl border bg-card/60 px-2 pt-1 pb-1.5">
          <Field label="File">
            <FileMenu />
          </Field>
        </div>
        {/* everything that belongs to the active playthrough, kept together when wrapping */}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1 rounded-xl border bg-card/60 px-2 pt-1 pb-1.5">
          <Field label="Playthrough">
            <PlaythroughMenu />
          </Field>
          {separateFields ? <PlaythroughSettings /> : <PlaythroughSummary />}
          {/* a world belongs to a playthrough: nothing to show without one */}
          {hasPlaythrough && (
            <Field label="World">
              <WorldMenu />
            </Field>
          )}
          {view && (
            <Field label="Progress" title="Overall progress of this playthrough">
              <ProgressBars view={view} />
            </Field>
          )}
        </div>
        {view && (
          // in a card like the playthrough box
          <div className="rounded-xl border bg-card/60 px-2 pt-1 pb-1.5">
            <Field label="View">
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
  const showBestiary = usePrefs((s) => s.layout.showBestiaryProgress)
  const rows = [{ label: 'Items', tally: view.overall }]
  if (showBestiary && bestiaryExists(data, gameVersion)) rows.push({ label: 'Bestiary', tally: bestiary })
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
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={(v) => v && setMode(v as TrackerMode)}
      aria-label="Items or bestiary"
    >
      <ToggleGroupItem value="items">Items</ToggleGroupItem>
      <ToggleGroupItem value="bestiary">Bestiary</ToggleGroupItem>
    </ToggleGroup>
  )
}
