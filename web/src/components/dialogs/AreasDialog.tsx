import { useState } from 'react'
import { ArrowLeft, ArrowRight, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { useUi } from '@/ui'
import { formatTilePosition, gameToTile, tileToGame, type GameCoord, type WorldDims } from '@/lib/coords'
import { newId, type Area } from '@/lib/saveFile'
import { containersIn, fullWorldArea } from '@/lib/world'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { confirm } from '@/lib/confirm'
import { cn, isTouchScreen } from '@/lib/utils'
import { usePrefs } from '@/lib/prefs'
import { WorldMap } from './WorldMap'

export function AreasDialog() {
  const dialog = useUi((s) => s.dialog)
  const open = dialog.type === 'areas'
  const thenSync = open && !!dialog.thenSync
  const returnTo = open ? dialog.returnTo : undefined
  const close = useUi((s) => s.close)
  const openDialog = useUi((s) => s.open)
  // after attaching a new world the first sync follows; opened from another dialog, that one
  // comes back - however this dialog is closed
  const finish = () => (thenSync ? openDialog({ type: 'sync' }) : returnTo ? openDialog(returnTo) : close())
  const backLabel =
    returnTo?.type === 'sync' ? 'Back to sync' : returnTo?.type === 'chestSearch' ? 'Back to chest search' : 'Back'
  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-5xl">
        {open && (
          <AreasManager
            // only in the area list, not while an area is edited
            footer={
              returnTo ? (
                <div className="flex justify-end border-t pt-3">
                  <Button onClick={finish}>
                    <ArrowLeft /> {backLabel}
                  </Button>
                </div>
              ) : (
                thenSync && (
                  <div className="flex items-center justify-end gap-3 border-t pt-3">
                    <span className="text-xs text-muted-foreground">
                      Next step: compare the playthrough with the world
                    </span>
                    <Button onClick={finish}>
                      Continue: sync with world <ArrowRight />
                    </Button>
                  </div>
                )
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AreasManager({ footer }: { footer?: React.ReactNode }) {
  const pt = useActivePlaythrough()
  const world = useActiveWorld()
  const deleteArea = useStore((s) => s.deleteArea)
  const saveArea = useStore((s) => s.saveArea)
  const [editing, setEditing] = useState<Area | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detection = usePrefs((s) => s.chestDetection)
  const dims = pt?.world

  if (!pt || !dims) {
    return (
      <DialogHeader>
        <DialogTitle>Areas</DialogTitle>
        <DialogDescription>Attach a world to this playthrough first.</DialogDescription>
      </DialogHeader>
    )
  }

  if (editing)
    return (
      <AreaForm
        area={editing}
        dims={dims}
        onDone={(saved) => {
          setEditing(null)
          if (saved) setSelectedId(saved)
        }}
      />
    )

  // chests placed by the player inside an area
  const chestCount = (a: Area) =>
    world ? containersIn(world, [a], { includeDisplays: false, onlyPlayer: true, detection }).length : null
  const areas = [fullWorldArea(dims), ...pt.areas]

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Areas of <em>{dims.name}</em>
        </DialogTitle>
        <DialogDescription>
          Areas define which parts of the world are scanned. When syncing with the world or searching chests, only the
          player chests inside the selected areas are taken into account – for example those of a base or a storage
          room.
        </DialogDescription>
      </DialogHeader>
      <ol className="flex list-decimal flex-col gap-0.5 rounded-lg bg-muted px-3 py-2 pl-7 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Create an area:</span> select the tool “Draw area” and drag a
          rectangle on the map, or use “New area” to enter the corner coordinates from the game.
        </li>
        <li>
          <span className="font-medium text-foreground">Adjust an area:</span> select it on the map or in the list, then
          drag it to move it or drag its handles to resize it. The pencil in the list edits its name and coordinates.
        </li>
        <li>
          <span className="font-medium text-foreground">Without areas:</span> “Full World” is always available and
          includes all player chests.
        </li>
      </ol>
      <WorldMap
        dims={{ ...dims, rockLayer: world?.rockLayer }}
        world={world}
        areas={pt.areas}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={(r) => setEditing({ id: '', name: '', ...r })}
        onChange={(a) => saveArea(pt.id, a)}
      />
      {!world && (
        <p className="text-xs text-muted-foreground">
          Load the world file (World menu) to see the chests and the spawn point on the map.
        </p>
      )}
      <ul className="flex max-h-[30vh] flex-col gap-1.5 overflow-y-auto">
        {areas.map((a, i) => {
          const fixed = i === 0
          const n = chestCount(a)
          return (
            <li
              key={a.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2',
                !fixed && 'cursor-pointer hover:bg-foreground/[0.04]',
                a.id === selectedId && 'border-primary/60 bg-primary/10',
              )}
              onClick={() => !fixed && setSelectedId(a.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  {fixed && <Lock className="size-3.5 text-muted-foreground" />}
                  {a.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fixed
                    ? `Entire world, always available · ${dims.width} × ${dims.height} tiles`
                    : `${formatTilePosition(a.x1, a.y1, dims)} → ${formatTilePosition(a.x2, a.y2, dims)}`}
                  {n !== null && ` · ${n} player chests`}
                </div>
              </div>
              {!fixed && (
                <>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label="Edit">
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete"
                    onClick={async () => {
                      if (
                        await confirm({ title: `Delete area "${a.name}"?`, confirmLabel: 'Delete', destructive: true })
                      )
                        deleteArea(pt.id, a.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          )
        })}
        {pt.areas.length === 0 && (
          <li className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No areas defined yet. Draw one on the map, for example around a base or a storage room.
          </li>
        )}
      </ul>
      <DialogFooter>
        <Button
          onClick={() => {
            const sx = world?.spawnX ?? Math.floor(dims.width / 2)
            const sy = world?.spawnY ?? Math.floor(dims.worldSurface)
            setEditing({ id: '', name: '', x1: sx - 50, y1: sy - 30, x2: sx + 50, y2: sy + 30 })
          }}
        >
          <Plus /> New area
        </Button>
      </DialogFooter>
      {footer}
    </>
  )
}

/** onDone gets the id of the saved area, or nothing when going back. */
function AreaForm({ area, dims, onDone }: { area: Area; dims: WorldDims; onDone: (savedId?: string) => void }) {
  const pt = useActivePlaythrough()!
  const world = useActiveWorld()
  const saveArea = useStore((s) => s.saveArea)
  const [name, setName] = useState(area.name)
  const [a, setA] = useState<GameCoord>(tileToGame(area.x1, area.y1, dims))
  const [b, setB] = useState<GameCoord>(tileToGame(area.x2, area.y2, dims))

  const ta = gameToTile(a, dims)
  const tb = gameToTile(b, dims)
  const rect: Area = {
    id: area.id || newId(),
    name: name.trim(),
    x1: Math.min(ta.x, tb.x),
    y1: Math.min(ta.y, tb.y),
    x2: Math.max(ta.x, tb.x),
    y2: Math.max(ta.y, tb.y),
  }
  const detection = usePrefs((s) => s.chestDetection)
  const chests = world
    ? containersIn(world, [rect], { includeDisplays: false, onlyPlayer: true, detection }).length
    : null

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!rect.name) return
        saveArea(pt.id, rect)
        onDone(rect.id)
      }}
    >
      <DialogHeader>
        <DialogTitle>{area.id ? 'Edit area' : 'New area'}</DialogTitle>
        <DialogDescription>
          Enter a name and two opposite corners of the area (e.g. top left and bottom right). In the game, the position
          is shown by a Compass (east/west) and a Depth Meter (above/below), or by a GPS, Cell Phone or Shellphone
          (both). The area can also be adjusted on the map afterwards.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="area-name">
          Name <span className="font-normal text-muted-foreground">(required)</span>
        </Label>
        <Input
          id="area-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main base"
          autoFocus={!isTouchScreen()}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CornerInput label="Corner 1" value={a} onChange={setA} />
        <CornerInput label="Corner 2" value={b} onChange={setB} />
      </div>
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        Covers tiles ({rect.x1}, {rect.y1}) to ({rect.x2}, {rect.y2}) · {rect.x2 - rect.x1 + 1} ×{' '}
        {rect.y2 - rect.y1 + 1} tiles
        {chests !== null && ` · ${chests} player chests inside`}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Back
        </Button>
        <Button type="submit" disabled={!rect.name}>
          Save area
        </Button>
      </DialogFooter>
    </form>
  )
}

function CornerInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: GameCoord
  onChange: (c: GameCoord) => void
}) {
  const num = (s: string) => Math.max(0, Math.round(Number(s) || 0))
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          value={value.x}
          onChange={(e) => onChange({ ...value, x: num(e.target.value) })}
          aria-label={`${label} feet east/west`}
        />
        <Select value={value.xDir} onValueChange={(v) => onChange({ ...value, xDir: v as GameCoord['xDir'] })}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="west">ft West</SelectItem>
            <SelectItem value="east">ft East</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          value={value.y}
          onChange={(e) => onChange({ ...value, y: num(e.target.value) })}
          aria-label={`${label} feet above/below`}
        />
        <Select value={value.yDir} onValueChange={(v) => onChange({ ...value, yDir: v as GameCoord['yDir'] })}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="above">ft Above</SelectItem>
            <SelectItem value="below">ft Below</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  )
}
