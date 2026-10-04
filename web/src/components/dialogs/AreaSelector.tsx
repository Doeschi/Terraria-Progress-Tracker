import { Globe, MapPinned } from 'lucide-react'
import { useActiveWorld } from '@/store'
import { useAreas, type ScanScope } from '@/hooks/useAreas'
import { FULL_WORLD_ID } from '@/lib/world'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// Which containers the sync and the chest search scan: areas (Full World and the
// playthrough's own areas) and which containers count (displays, only player chests).

export function AreaSelector({
  scope,
  onChange,
  onManage,
}: {
  scope: ScanScope
  onChange: (s: ScanScope) => void
  /** opens the areas dialog ("Manage areas…") */
  onManage: () => void
}) {
  const areas = useAreas()
  const own = areas.filter((a) => a.id !== FULL_WORLD_ID)
  const displaysAvailable = useActiveWorld()?.displaysAvailable ?? true
  const toggle = (id: string, on: boolean) => {
    const ids = on ? [...scope.areaIds, id] : scope.areaIds.filter((x) => x !== id)
    onChange({ ...scope, areaIds: ids })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
        <legend className="flex w-full items-center px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Areas to scan
        </legend>
        <Label className="font-normal">
          <Checkbox
            checked={scope.areaIds.includes(FULL_WORLD_ID)}
            onCheckedChange={(v) => toggle(FULL_WORLD_ID, v === true)}
          />
          <Globe className="size-4 text-muted-foreground" />
          Full World <span className="text-muted-foreground">– the entire world</span>
        </Label>
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Areas of this playthrough</span>
            <Button type="button" variant="ghost" size="xs" onClick={onManage}>
              <MapPinned /> Manage areas…
            </Button>
          </div>
          {own.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {own.map((a) => (
                <Label key={a.id} className="font-normal">
                  <Checkbox checked={scope.areaIds.includes(a.id)} onCheckedChange={(v) => toggle(a.id, v === true)} />
                  {a.name}
                </Label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No areas defined yet.</p>
          )}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Containers</legend>
        <Label className="font-normal">
          <Checkbox
            checked={scope.onlyPlayer}
            onCheckedChange={(v) => onChange({ ...scope, onlyPlayer: v === true })}
          />
          <span>
            Only player chests{' '}
            <span className="text-muted-foreground">
              – named, or placed near other chests; excludes the loot chests of world generation
            </span>
          </span>
        </Label>
        <Label className="font-normal">
          <Checkbox
            checked={scope.includeDisplays && displaysAvailable}
            disabled={!displaysAvailable}
            onCheckedChange={(v) => onChange({ ...scope, includeDisplays: v === true })}
          />
          <span>
            {displaysAvailable ? (
              <>
                Include displays{' '}
                <span className="text-muted-foreground">
                  – item frames, weapon racks, mannequins, hat racks, plates and item flasks
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Displays (item frames, mannequins, …) could not be read from this world
              </span>
            )}
          </span>
        </Label>
      </fieldset>
    </div>
  )
}
