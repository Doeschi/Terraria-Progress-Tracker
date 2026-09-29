import { useActiveWorld } from '@/store'
import { useAreas, type ScanScope } from '@/hooks/useAreas'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function AreaSelector({ scope, onChange }: { scope: ScanScope; onChange: (s: ScanScope) => void }) {
  const areas = useAreas()
  const displaysAvailable = useActiveWorld()?.displaysAvailable ?? true
  const toggle = (id: string, on: boolean) => {
    const ids = on ? [...scope.areaIds, id] : scope.areaIds.filter((x) => x !== id)
    onChange({ ...scope, areaIds: ids })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {areas.map((a) => (
          <Label key={a.id} className="font-normal">
            <Checkbox checked={scope.areaIds.includes(a.id)} onCheckedChange={(v) => toggle(a.id, v === true)} />
            {a.name}
          </Label>
        ))}
      </div>
      <Label className="font-normal text-muted-foreground">
        <Checkbox
          checked={scope.includeDisplays && displaysAvailable}
          disabled={!displaysAvailable}
          onCheckedChange={(v) => onChange({ ...scope, includeDisplays: v === true })}
        />
        {displaysAvailable
          ? 'Also scan item frames, weapon racks, mannequins, hat racks, plates and item flasks'
          : 'Displays (item frames, mannequins, …) could not be read from this world'}
      </Label>
      <Label className="font-normal text-muted-foreground">
        <Checkbox checked={scope.onlyPlayer} onCheckedChange={(v) => onChange({ ...scope, onlyPlayer: v === true })} />
        Only chests placed by you (named, or grouped with other chests) – skips untouched loot chests
      </Label>
    </div>
  )
}
