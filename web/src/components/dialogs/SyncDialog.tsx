import { useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { useActivePlaythrough, useActivePlayer, useActiveWorld, useStore } from '@/store'
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
import { bannerText, earnedBanners } from '@/lib/banners'
import { formatRelativeDay, plural } from '@/lib/format'
import { getLoadedModified } from '@/lib/files'
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
import { PLAYER_STORAGES, playerStock, STORAGE_TEXT, usedUpgrades, type PlayerStorage } from '@/lib/player'
import { AreaSelector } from './AreaSelector'

// Sync the playthrough with the attached world and player, in one dialog:
//   Items     - items in the world's chests (selected areas), in the player's storages, the
//               permanent upgrades it has used and the banners the world has earned by kills
//               vs. checked items; the player and the banners only check
//   Bestiary  - the world's bestiary vs. the playthrough's
// Every change can be deselected; nothing changes until Apply.

export function SyncDialog() {
  const dialog = useUi((s) => s.dialog)
  const close = useUi((s) => s.close)
  // needs a loaded world or player (e.g. it may be detached while the dialog is open)
  const world = useActiveWorld()
  const player = useActivePlayer()
  const hasSource = world !== null || player !== null
  const open = dialog.type === 'sync' && hasSource
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
  const world = useActiveWorld()
  const player = useActivePlayer()
  const setChecked = useStore((s) => s.setChecked)
  const setBestiary = useStore((s) => s.setBestiary)
  const updatePlaythrough = useStore((s) => s.updatePlaythrough)
  const openDialog = useUi((s) => s.open)
  const areas = useAreas()
  // the sections with a source: items come from the world and the player, the bestiary needs the world
  const sections = (
    [
      ['items', 'Items', true],
      ['bestiary', 'Bestiary', !!world],
    ] as const
  ).filter(([, , has]) => has)
  const [section, setSection] = useState<SyncSection>(sections.some(([id]) => id === initial) ? initial : 'items')
  const [scope, setScope] = useScanScope('sync')
  const detection = usePrefs((s) => s.chestDetection)
  // items: "to be checked" the user deselected / "not found" the user chose to uncheck
  const [skipCheck, setSkipCheck] = useState<Set<string>>(new Set())
  const [uncheck, setUncheck] = useState<Set<string>>(new Set())
  // bestiary: changes the user deselected
  const [skipBestiary, setSkipBestiary] = useState<Set<string>>(new Set())
  // player: storages that count, used upgrades
  const [storages, setStorages] = useState<Set<PlayerStorage>>(new Set(PLAYER_STORAGES.map((x) => x.id)))
  const [withUpgrades, setWithUpgrades] = useState(true)
  // world: banners earned by kills count as obtained (since 1.4.5 they wait in the Banners Window)
  const [withBanners, setWithBanners] = useState(true)

  const checked = useMemo(() => new Set(pt.checked), [pt.checked])
  const counts = useMemo(() => {
    const ignored = new Set(pt.ignored)
    const available = availabilityCheck(data, pt)
    return (item: Item) => available(item) && !ignored.has(item.key)
  }, [data, pt])
  // everything on the player (all storages) - kept out of the world's "not found" list
  const stock = useMemo(() => (player ? playerStock(data, player, pt.platform) : null), [data, player, pt.platform])
  // used permanent upgrades (Life Crystal, Demon Heart, …) are gone from the storages, but obtained:
  // not "not found" either
  const used = useMemo(() => new Set(player ? usedUpgrades(player) : []), [player])

  const playerItems = useMemo(() => {
    if (!player || !stock) return []
    const rows: { item: Item; detail: string }[] = []
    for (const { item, places } of stock.values()) {
      const where = [...places].filter(([st]) => storages.has(st))
      if (!where.length || !counts(item) || checked.has(item.key)) continue
      rows.push({ item, detail: where.map(([st, n]) => `${n} ${STORAGE_TEXT[st]}`).join(' · ') })
    }
    if (withUpgrades)
      for (const key of usedUpgrades(player)) {
        const item = data.itemsByKey.get(key)
        if (item && counts(item) && !checked.has(key) && !rows.some((r) => r.item.key === key))
          rows.push({ item, detail: 'used (permanent upgrade)' })
      }
    return rows.sort((a, b) => a.item.name.localeCompare(b.item.name))
  }, [player, stock, storages, withUpgrades, counts, checked, data])

  const banners = useMemo(
    () => (world && withBanners ? earnedBanners(data, world) : new Map<string, never>()),
    [data, world, withBanners],
  )

  const items = useMemo(() => {
    if (!world) return null
    const selected = areas.filter((a) => scope.areaIds.includes(a.id))
    const scan = scanContainers(data, containersIn(world, selected, { ...scope, detection }), pt.platform)
    const toCheck = [...scan.found.values()]
      .filter((f) => counts(f.item) && !checked.has(f.item.key))
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
    const notFound = pt.checked
      .map((k) => data.itemsByKey.get(k))
      .filter(
        (i): i is Item =>
          !!i && counts(i) && !scan.found.has(i.key) && !stock?.has(i.key) && !used.has(i.key) && !banners.has(i.key),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
    return { scan, toCheck, notFound }
  }, [data, world, pt, areas, scope, detection, counts, checked, stock, used, banners])

  // to be checked: what is in the scanned containers or on the player, and the banners earned by
  // kills, each row with where
  const toCheck = useMemo(() => {
    const rows = new Map<string, { item: Item; where: string[] }>()
    const add = (item: Item, where: string) => {
      const row = rows.get(item.key)
      if (row) row.where.push(where)
      else rows.set(item.key, { item, where: [where] })
    }
    for (const f of items?.toCheck ?? []) add(f.item, foundText(f))
    for (const r of playerItems) add(r.item, r.detail)
    for (const b of banners.values()) if (counts(b.item) && !checked.has(b.item.key)) add(b.item, bannerText(b))
    return [...rows.values()]
      .map((r) => ({ item: r.item, detail: r.where.join(' · ') }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
  }, [items, playerItems, banners, counts, checked])

  const bestiary = useMemo(() => (world ? bestiaryDiff(data, pt, world) : null), [data, pt, world])

  const willCheck = toCheck.filter((r) => !skipCheck.has(r.item.key)).map((r) => r.item.key)
  const willUncheck = items?.notFound.filter((i) => uncheck.has(i.key)) ?? []
  const willUnlock = bestiary?.toCheck.filter((e) => !skipBestiary.has(e.id)) ?? []
  const willLock = bestiary?.toUncheck.filter((e) => !skipBestiary.has(e.id)) ?? []
  const nothing = !willCheck.length && !willUncheck.length && !willUnlock.length && !willLock.length

  const apply = () => {
    setChecked(willCheck, true)
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
    const now = new Date().toISOString()
    updatePlaythrough(pt.id, (p) => ({
      ...p,
      world: p.world && world ? { ...p.world, lastSyncedAt: now } : p.world,
      player: p.player && player ? { ...p.player, lastSyncedAt: now } : p.player,
    }))
    const parts = []
    if (willCheck.length || willUncheck.length)
      parts.push(`items: ${willCheck.length} checked, ${willUncheck.length} unchecked`)
    if (willUnlock.length || willLock.length)
      parts.push(`bestiary: ${willUnlock.length} checked, ${willLock.length} unchecked`)
    toast.success(`Synced – ${parts.join('; ')}`)
    onDone()
  }

  // when the game last saved the loaded files (their modification time)
  const saved = (
    [
      ['World file', world && getLoadedModified('world', pt.id)],
      ['player file', player && getLoadedModified('player', pt.id)],
    ] as const
  )
    .filter(([, time]) => time)
    .map(([file, time]) => `${file} saved ${formatRelativeDay(new Date(time as number).toISOString())}`)
    .join(' · ')

  const changes: Record<SyncSection, number> = {
    items: toCheck.length + (items?.notFound.length ?? 0),
    bestiary: bestiary ? bestiary.toCheck.length + bestiary.toUncheck.length : 0,
  }

  // what was looked through, and the options in short (shown on the collapsed container)
  const scanned = [items && plural(items.scan.containers, 'container'), player && `${player.name}'s storages`]
    .filter(Boolean)
    .join(' and ')
  const selected = areas.filter((a) => scope.areaIds.includes(a.id))
  const summary = [
    world && (selected.length === 1 ? selected[0].name : plural(selected.length, 'area')),
    world && scope.onlyPlayer && 'only player chests',
    world && scope.includeDisplays && world.displaysAvailable && 'with displays',
    world && world.bannerKills.length > 0 && withBanners && 'banners by kills',
    player &&
      (storages.size === PLAYER_STORAGES.length && withUpgrades
        ? 'everything on the player'
        : `${storages.size} of ${PLAYER_STORAGES.length} player storages${withUpgrades ? ', used upgrades' : ''}`),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Sync with {world && <em>{world.name}</em>}
          {world && player && ' and '}
          {player && <em>{player.name}</em>}
        </DialogTitle>
        <DialogDescription>
          Compare your progress with{' '}
          {world && "the items in the world's chests, the banners it has earned and its bestiary"}
          {world && player && ', and with '}
          {player && "the player's inventory, banks and used upgrades"}. Nothing changes until you press Apply.
        </DialogDescription>
        {saved && <p className="text-xs text-muted-foreground">{saved[0].toUpperCase() + saved.slice(1)}</p>}
      </DialogHeader>

      {/* section switch: items / bestiary (the ones with a source) */}
      {sections.length > 1 && (
        <div
          className="grid gap-1 rounded-lg bg-muted p-1"
          style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
          role="tablist"
          aria-label="What to sync"
        >
          {sections.map(([id, label]) => (
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
              {label} <span className="text-muted-foreground">({plural(changes[id], 'difference')})</span>
            </button>
          ))}
        </div>
      )}

      {section === 'items' ? (
        // scrolls as a whole when the open options leave too little room for the lists
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <Options summary={summary}>
            {world && (
              <AreaSelector
                scope={scope}
                onChange={setScope}
                onManage={() => openDialog({ type: 'areas', returnTo: { type: 'sync', section: 'items' } })}
              />
            )}
            {world && world.bannerKills.length > 0 && (
              <fieldset className="flex flex-col gap-1 rounded-lg border p-3">
                <legend className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Banners
                </legend>
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={withBanners} onCheckedChange={(v) => setWithBanners(v === true)} />
                  Count banners earned by kills
                </label>
                <p className="text-xs text-muted-foreground">
                  The world counts the kills for every enemy banner. Since 1.4.5 an earned banner is not dropped: it
                  waits in the Banners Window next to the crafting menu until you take it out.
                </p>
              </fieldset>
            )}
            {player && (
              <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
                <legend className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  On the player
                </legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {PLAYER_STORAGES.map((st) => (
                    <label
                      key={st.id}
                      className="flex items-center gap-1.5 text-sm"
                      title={'hint' in st ? st.hint : undefined}
                    >
                      <Checkbox
                        checked={storages.has(st.id)}
                        onCheckedChange={(v) =>
                          setStorages((cur) => {
                            const next = new Set(cur)
                            if (v === true) next.add(st.id)
                            else next.delete(st.id)
                            return next
                          })
                        }
                      />
                      {st.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={withUpgrades} onCheckedChange={(v) => setWithUpgrades(v === true)} />
                    Used permanent upgrades
                  </label>
                </div>
              </fieldset>
            )}
          </Options>
          <p className="text-sm text-muted-foreground">Scanned {scanned}.</p>
          <Tabs defaultValue="check" className="min-h-0 flex-1">
            <TabsList>
              <TabsTrigger value="check">To be checked ({toCheck.length})</TabsTrigger>
              {items && (
                <>
                  <TabsTrigger value="notFound">Checked but not found ({items.notFound.length})</TabsTrigger>
                  <TabsTrigger value="unknown">Unknown items ({items.scan.unknownIds.size})</TabsTrigger>
                </>
              )}
            </TabsList>
            <TabsContent value="check" className="flex min-h-0 flex-col gap-2">
              <ListHeader
                text={
                  !player
                    ? 'Items found in chests that are not checked yet.'
                    : !world
                      ? 'Items the player has (or has used) that are not checked yet.'
                      : 'Items found in chests or on the player (or used by it) that are not checked yet.'
                }
                note={banners.size > 0 ? 'Banners earned by kills are included.' : undefined}
                ids={toCheck.map((r) => r.item.key)}
                allOn={!toCheck.some((r) => skipCheck.has(r.item.key))}
                onAll={(ids, on) => setSkipCheck((s) => withIds(s, ids, !on))}
              />
              <Rows
                empty="Everything that was found is already checked."
                rows={toCheck.map((r) => ({
                  id: r.item.key,
                  icon: r.item.icon,
                  name: r.item.name,
                  on: !skipCheck.has(r.item.key),
                  detail: r.detail,
                }))}
                onToggle={(id, on) => setSkipCheck((s) => withIds(s, [id], !on))}
              />
            </TabsContent>
            {items && (
              <>
                <TabsContent value="notFound" className="flex min-h-0 flex-col gap-2">
                  <ListHeader
                    text={`Checked items that are in none of the scanned containers${player ? ', nor on the player (storages, used permanent upgrades)' : ''}${banners.size > 0 ? ', and no banners earned by kills' : ''}. Tick the ones you no longer have to uncheck them.`}
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
              </>
            )}
          </Tabs>
        </div>
      ) : !world ? null : !bestiary ? (
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
              rows={entryRows(bestiary.toCheck, skipBestiary, world!.bestiary!)}
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
              rows={entryRows(bestiary.toUncheck, skipBestiary, world!.bestiary!)}
              onToggle={(id, on) => setSkipBestiary((s) => withIds(s, [id], !on))}
            />
          </TabsContent>
        </Tabs>
      )}

      <DialogFooter className="items-center">
        <span className="mr-auto text-xs text-muted-foreground">
          Items: {willCheck.length} to check{world && ` · ${willUncheck.length} to uncheck`}
          {world && (
            <>
              <br />
              Bestiary: {willUnlock.length} to check · {willLock.length} to uncheck
            </>
          )}
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

/** All options of the item sync - which areas and containers of the world, what on the player -
 * in one collapsible container; collapsed it shows the current choice. The open state is
 * remembered in the browser. */
function Options({ summary, children }: { summary: string; children: React.ReactNode }) {
  const open = usePrefs((s) => s.openSections['sync-options'] ?? false)
  const setSectionOpen = usePrefs((s) => s.setSectionOpen)
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setSectionOpen('sync-options', !open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/60"
      >
        <ChevronRight
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        <span className="font-medium">Options</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{summary}</span>
      </button>
      {open && <div className="flex flex-col gap-3 border-t p-3">{children}</div>}
    </div>
  )
}

/** Item ids in the world that the item data does not know - with everything the world tells. */
function UnknownItems({ unknown }: { unknown: UnknownItem[] }) {
  const data = useStore((s) => s.data)!
  const world = useActiveWorld()!
  const maxId = useMemo(() => Math.max(...data.items.map((i) => i.id)), [data])
  if (!unknown.length)
    return (
      <p className="grid min-h-40 shrink grow basis-[40vh] place-items-center rounded-lg border text-sm text-muted-foreground">
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
      <ul className="min-h-40 shrink grow basis-[40vh] overflow-y-auto rounded-lg border">
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
                    Missing from the wiki's item list (the name comes from its recipes), so it has no progress here.
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
  note,
  ids,
  allOn,
  onAll,
  labels = ['Deselect all', 'Select all'],
}: {
  text: string
  /** a second sentence */
  note?: string
  ids: string[]
  allOn: boolean
  onAll: (ids: string[], on: boolean) => void
  /** [label when all are on, label otherwise] */
  labels?: [string, string]
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex-1">
        {text}
        {note && ` ${note}`}
      </span>
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

/** Height of a row (28 px icon, padding, border) - the lists are virtualized: thousands of rows
 * (e.g. everything checked but not found) would take seconds to render at once. The lists are
 * 40 % of the window high and give way when the dialog gets too high (the open options). */
const ROW_HEIGHT = 41

function Rows({ rows, onToggle, empty }: { rows: Row[]; onToggle: (id: string, on: boolean) => void; empty: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  if (!rows.length)
    return (
      <p className="grid min-h-40 shrink grow basis-[40vh] place-items-center rounded-lg border text-sm text-muted-foreground">
        {empty}
      </p>
    )
  return (
    <div ref={scrollRef} className="min-h-40 shrink grow basis-[40vh] overflow-y-auto rounded-lg border">
      <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const r = rows[v.index]
          return (
            <li key={r.id} className="absolute inset-x-0 border-b" style={{ top: v.start, height: ROW_HEIGHT }}>
              <label className="flex h-full cursor-pointer items-center gap-3 px-3 hover:bg-muted/60">
                <Checkbox checked={r.on} onCheckedChange={(on) => onToggle(r.id, on === true)} />
                {r.number !== undefined && (
                  <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{r.number}</span>
                )}
                <WikiIcon src={r.icon} alt="" size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                {r.detail && (
                  <span className="max-w-[60%] truncate text-xs text-muted-foreground" title={r.detail}>
                    {r.detail}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
