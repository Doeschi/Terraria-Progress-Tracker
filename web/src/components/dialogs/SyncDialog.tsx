import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { useUi, type SyncSection } from '@/ui'
import { usePrefs } from '@/lib/prefs'
import {
  CONTAINER_LABELS,
  containersIn,
  scanContainers,
  type FoundItem,
  type UnknownItem,
  type WorldBestiary,
} from '@/lib/world'
import { formatTilePosition } from '@/lib/coords'
import { availabilityCheck } from '@/lib/availability'
import { bestiaryDiff, worldState } from '@/lib/bestiary'
import { plural } from '@/lib/format'
import type { BestiaryEntry, Item } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WikiIcon } from '../common'
import { useAreas, useScanScope } from '@/hooks/useAreas'
import { AreaSelector } from './AreaSelector'

// Sync the playthrough with the attached world, in one dialog:
//   Items     - items in the world's chests (selected areas) vs. checked items
//   Bestiary  - the world's bestiary vs. the playthrough's
// Every change can be deselected; nothing changes until Apply.

export function SyncDialog() {
  const dialog = useUi((s) => s.dialog)
  const close = useUi((s) => s.close)
  // needs a loaded world (e.g. it may be detached while the dialog is open)
  const hasWorld = useActiveWorld() !== null
  const open = dialog.type === 'sync' && hasWorld
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        {open && <SyncView initial={dialog.section ?? 'items'} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}

/** Add or remove ids from a set (immutably). */
function withIds(set: Set<string>, ids: string[], on: boolean): Set<string> {
  const next = new Set(set)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}

function SyncView({ initial, onDone }: { initial: SyncSection; onDone: () => void }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const world = useActiveWorld()!
  const setChecked = useStore((s) => s.setChecked)
  const setBestiary = useStore((s) => s.setBestiary)
  const updatePlaythrough = useStore((s) => s.updatePlaythrough)
  const openDialog = useUi((s) => s.open)
  const areas = useAreas()
  const [section, setSection] = useState<SyncSection>(initial)
  const [scope, setScope] = useScanScope('sync')
  const detection = usePrefs((s) => s.chestDetection)
  // items: "to be checked" the user deselected / "not found" the user chose to uncheck
  const [skipCheck, setSkipCheck] = useState<Set<string>>(new Set())
  const [uncheck, setUncheck] = useState<Set<string>>(new Set())
  // bestiary: changes the user deselected
  const [skipBestiary, setSkipBestiary] = useState<Set<string>>(new Set())

  const items = useMemo(() => {
    const selected = areas.filter((a) => scope.areaIds.includes(a.id))
    const scan = scanContainers(data, containersIn(world, selected, { ...scope, detection }), pt.platform)
    const checked = new Set(pt.checked)
    const ignored = new Set(pt.ignored)
    const available = availabilityCheck(data, pt)
    const counts = (item: Item) => available(item) && !ignored.has(item.key)
    const toCheck = [...scan.found.values()]
      .filter((f) => counts(f.item) && !checked.has(f.item.key))
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
    const notFound = pt.checked
      .map((k) => data.itemsByKey.get(k))
      .filter((i): i is Item => !!i && counts(i) && !scan.found.has(i.key))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { scan, toCheck, notFound }
  }, [data, world, pt, areas, scope, detection])

  const bestiary = useMemo(() => bestiaryDiff(data, pt, world), [data, pt, world])

  const willCheck = items.toCheck.filter((f) => !skipCheck.has(f.item.key))
  const willUncheck = items.notFound.filter((i) => uncheck.has(i.key))
  const willUnlock = bestiary?.toCheck.filter((e) => !skipBestiary.has(e.id)) ?? []
  const willLock = bestiary?.toUncheck.filter((e) => !skipBestiary.has(e.id)) ?? []
  const nothing = !willCheck.length && !willUncheck.length && !willUnlock.length && !willLock.length

  const apply = () => {
    setChecked(
      willCheck.map((f) => f.item.key),
      true,
    )
    setChecked(
      willUncheck.map((i) => i.key),
      false,
    )
    setBestiary(
      willUnlock.map((e) => e.id),
      true,
    )
    setBestiary(
      willLock.map((e) => e.id),
      false,
    )
    updatePlaythrough(pt.id, (p) => ({
      ...p,
      world: p.world && { ...p.world, lastSyncedAt: new Date().toISOString() },
    }))
    const parts = []
    if (willCheck.length || willUncheck.length)
      parts.push(`items: ${willCheck.length} checked, ${willUncheck.length} unchecked`)
    if (willUnlock.length || willLock.length)
      parts.push(`bestiary: ${willUnlock.length} checked, ${willLock.length} unchecked`)
    toast.success(`Synced – ${parts.join('; ')}`)
    onDone()
  }

  const itemChanges = items.toCheck.length + items.notFound.length
  const bestiaryChanges = bestiary ? bestiary.toCheck.length + bestiary.toUncheck.length : 0

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Sync with <em>{world.name}</em>
        </DialogTitle>
        <DialogDescription>
          Compare your progress with the items in the world's chests and with the world's bestiary. Nothing changes
          until you press Apply.
        </DialogDescription>
      </DialogHeader>

      {/* section switch: items / bestiary */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="What to sync">
        {(
          [
            ['items', 'Items', itemChanges],
            ['bestiary', 'Bestiary', bestiaryChanges],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              section === id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <span className="text-muted-foreground">({plural(n, 'difference')})</span>
          </button>
        ))}
      </div>

      {section === 'items' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <AreaSelector
            scope={scope}
            onChange={setScope}
            onManage={() => openDialog({ type: 'areas', returnTo: { type: 'sync', section: 'items' } })}
          />
          <p className="text-sm text-muted-foreground">Scanned {plural(items.scan.containers, 'container')}.</p>
          <Tabs defaultValue="check" className="min-h-0 flex-1">
            <TabsList>
              <TabsTrigger value="check">To be checked ({items.toCheck.length})</TabsTrigger>
              <TabsTrigger value="notFound">Checked but not found ({items.notFound.length})</TabsTrigger>
              <TabsTrigger value="unknown">Unknown items ({items.scan.unknownIds.size})</TabsTrigger>
            </TabsList>
            <TabsContent value="check" className="flex min-h-0 flex-col gap-2">
              <ListHeader
                text="Items found in chests that are not checked yet."
                ids={items.toCheck.map((f) => f.item.key)}
                allOn={!items.toCheck.some((f) => skipCheck.has(f.item.key))}
                onAll={(ids, on) => setSkipCheck((s) => withIds(s, ids, !on))}
              />
              <Rows
                empty="Everything in the scanned chests is already checked."
                rows={items.toCheck.map((f) => ({
                  id: f.item.key,
                  icon: f.item.icon,
                  name: f.item.name,
                  on: !skipCheck.has(f.item.key),
                  detail: foundText(f),
                }))}
                onToggle={(id, on) => setSkipCheck((s) => withIds(s, [id], !on))}
              />
            </TabsContent>
            <TabsContent value="notFound" className="flex min-h-0 flex-col gap-2">
              <ListHeader
                text="Checked items that are in none of the scanned containers. Tick the ones you no longer have to uncheck them."
                ids={items.notFound.map((i) => i.key)}
                allOn={items.notFound.every((i) => uncheck.has(i.key))}
                onAll={(ids, on) => setUncheck((s) => withIds(s, ids, on))}
                labels={['Uncheck none', 'Uncheck all']}
              />
              <Rows
                empty="All checked items were found."
                rows={items.notFound.map((item) => ({
                  id: item.key,
                  icon: item.icon,
                  name: item.name,
                  on: uncheck.has(item.key),
                  detail: uncheck.has(item.key) ? 'will be unchecked' : 'stays checked',
                }))}
                onToggle={(id, on) => setUncheck((s) => withIds(s, [id], on))}
              />
            </TabsContent>
            <TabsContent value="unknown" className="flex min-h-0 flex-col gap-2">
              <UnknownItems unknown={[...items.scan.unknownIds.values()]} />
            </TabsContent>
          </Tabs>
        </div>
      ) : !bestiary ? (
        <p className="grid h-[45vh] place-items-center rounded-lg border text-sm text-muted-foreground">
          The bestiary could not be read from this world.
        </p>
      ) : (
        <Tabs
          defaultValue={bestiary.toCheck.length || !bestiary.toUncheck.length ? 'check' : 'uncheck'}
          className="min-h-0 flex-1"
        >
          <TabsList>
            <TabsTrigger value="check">To be checked ({bestiary.toCheck.length})</TabsTrigger>
            <TabsTrigger value="uncheck">To be unchecked ({bestiary.toUncheck.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="check" className="flex min-h-0 flex-col gap-2">
            <ListHeader
              text="Unlocked in the world, not checked yet."
              ids={bestiary.toCheck.map((e) => e.id)}
              allOn={!bestiary.toCheck.some((e) => skipBestiary.has(e.id))}
              onAll={(ids, on) => setSkipBestiary((s) => withIds(s, ids, !on))}
            />
            <Rows
              empty="Everything unlocked in the world is already checked."
              rows={entryRows(bestiary.toCheck, skipBestiary, world.bestiary!)}
              onToggle={(id, on) => setSkipBestiary((s) => withIds(s, [id], !on))}
            />
          </TabsContent>
          <TabsContent value="uncheck" className="flex min-h-0 flex-col gap-2">
            <ListHeader
              text="Checked, but not unlocked in the world. Deselect entries you want to keep checked."
              ids={bestiary.toUncheck.map((e) => e.id)}
              allOn={!bestiary.toUncheck.some((e) => skipBestiary.has(e.id))}
              onAll={(ids, on) => setSkipBestiary((s) => withIds(s, ids, !on))}
            />
            <Rows
              empty="Every checked entry is unlocked in the world."
              rows={entryRows(bestiary.toUncheck, skipBestiary, world.bestiary!)}
              onToggle={(id, on) => setSkipBestiary((s) => withIds(s, [id], !on))}
            />
          </TabsContent>
        </Tabs>
      )}

      <DialogFooter className="items-center">
        <span className="mr-auto text-xs text-muted-foreground">
          Items: {willCheck.length} to check · {willUncheck.length} to uncheck
          <br />
          Bestiary: {willUnlock.length} to check · {willLock.length} to uncheck
        </span>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={nothing}>
          Apply
        </Button>
      </DialogFooter>
    </>
  )
}

/** Item ids in the world that the item data does not know - with everything the world tells. */
function UnknownItems({ unknown }: { unknown: UnknownItem[] }) {
  const data = useStore((s) => s.data)!
  const world = useActiveWorld()!
  const maxId = useMemo(() => Math.max(...data.items.map((i) => i.id)), [data])
  if (!unknown.length)
    return (
      <p className="grid h-[40vh] place-items-center rounded-lg border text-sm text-muted-foreground">
        Every item in the scanned containers is known.
      </p>
    )
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Items that are not in the item list, so they cannot be checked or unchecked – items missing from the wiki's item
        list (named from its recipes where possible), or items from a newer game version than the data. The world file
        only stores the item id.
      </p>
      <ul className="h-[40vh] overflow-y-auto rounded-lg border">
        {[...unknown]
          .sort((a, b) => a.id - b.id)
          .map((u) => {
            const known = data.missingItems.get(u.id)
            return (
              <li key={u.id} className="flex flex-col gap-1 border-b px-3 py-2 text-sm last:border-b-0">
                <div className="flex items-center gap-3">
                  {known?.icon ? (
                    <WikiIcon src={known.icon} alt="" size={28} />
                  ) : (
                    <span className="grid size-7 place-items-center rounded border bg-muted/40 text-xs text-muted-foreground">
                      ?
                    </span>
                  )}
                  <span className="flex-1 font-medium">
                    {known ? known.name : `Item id ${u.id}`}
                    {known && <span className="font-normal text-muted-foreground"> · id {u.id}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {u.stack} in {plural(u.containers.length, 'container')}
                  </span>
                </div>
                {known ? (
                  <p className="pl-10 text-xs text-muted-foreground">
                    Missing from the wiki's item list (the name comes from its recipes), so it is not tracked.
                  </p>
                ) : (
                  u.id > maxId && (
                    <p className="pl-10 text-xs text-muted-foreground">
                      Higher than every known item id ({maxId}) – probably added in a newer game version.
                    </p>
                  )
                )}
                <ul className="pl-10 text-xs text-muted-foreground">
                  {u.containers.map((c, i) => (
                    <li key={i}>
                      {CONTAINER_LABELS[c.kind]}
                      {c.name && ` “${c.name}”`} · {formatTilePosition(c.x, c.y, world)} · tile {c.x}, {c.y}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
      </ul>
    </>
  )
}

const foundText = (f: FoundItem) => `${f.stack} in ${plural(f.containers, 'container')}`

function entryRows(entries: BestiaryEntry[], skip: Set<string>, b: WorldBestiary): Row[] {
  return entries.map((e) => ({
    id: e.id,
    number: e.n,
    icon: e.icon,
    name: e.name,
    on: !skip.has(e.id),
    detail: worldState(b, e.id).text ?? 'not in the world',
  }))
}

function ListHeader({
  text,
  ids,
  allOn,
  onAll,
  labels = ['Deselect all', 'Select all'],
}: {
  text: string
  ids: string[]
  allOn: boolean
  onAll: (ids: string[], on: boolean) => void
  /** [label when all are on, label otherwise] */
  labels?: [string, string]
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex-1">{text}</span>
      {ids.length > 0 && (
        <Button variant="ghost" size="xs" onClick={() => onAll(ids, !allOn)}>
          {allOn ? labels[0] : labels[1]}
        </Button>
      )}
    </div>
  )
}

interface Row {
  id: string
  /** bestiary number */
  number?: number
  icon?: string
  name: string
  on: boolean
  detail?: string
}

function Rows({ rows, onToggle, empty }: { rows: Row[]; onToggle: (id: string, on: boolean) => void; empty: string }) {
  if (!rows.length)
    return <p className="grid h-[40vh] place-items-center rounded-lg border text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="h-[40vh] overflow-y-auto rounded-lg border">
      {rows.map((r) => (
        <li key={r.id} className="border-b last:border-b-0">
          <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-muted/60">
            <Checkbox checked={r.on} onCheckedChange={(v) => onToggle(r.id, v === true)} />
            {r.number !== undefined && (
              <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{r.number}</span>
            )}
            <WikiIcon src={r.icon} alt="" size={28} />
            <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
            {r.detail && <span className="text-xs text-muted-foreground">{r.detail}</span>}
          </label>
        </li>
      ))}
    </ul>
  )
}
