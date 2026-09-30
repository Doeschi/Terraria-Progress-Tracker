import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, MapPin, Search } from 'lucide-react'
import { useActivePlaythrough, useActiveWorld, useStore } from '@/store'
import { useUi } from '@/ui'
import { usePrefs } from '@/lib/prefs'
import { formatTilePosition } from '@/lib/coords'
import { createSearch, searchRanks } from '@/lib/filtering'
import { CONTAINER_LABELS, containersIn, resolveItem, scanContainers, type Container } from '@/lib/world'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { WikiIcon } from '../common'
import { cn } from '@/lib/utils'
import type { Area } from '@/lib/saveFile'
import { WorldMap } from './WorldMap'
import { useAreas, useScanScope } from '@/hooks/useAreas'
import { AreaSelector } from './AreaSelector'
import { plural } from '@/lib/format'

export function ChestSearchDialog() {
  const dialog = useUi((s) => s.dialog)
  const close = useUi((s) => s.close)
  // needs a loaded world (e.g. it may be detached while the dialog is open)
  const hasWorld = useActiveWorld() !== null
  const open = dialog.type === 'chestSearch' && hasWorld
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        {open && <ChestSearch initialKey={dialog.itemKey} />}
      </DialogContent>
    </Dialog>
  )
}

function ChestSearch({ initialKey }: { initialKey?: string }) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const world = useActiveWorld()!
  const areas = useAreas()
  // remembered per playthrough, like the sync dialog's
  const [scope, setScope] = useScanScope('chests')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | undefined>(initialKey)

  const detection = usePrefs((s) => s.chestDetection)
  const containers = useMemo(
    () =>
      containersIn(
        world,
        areas.filter((a) => scope.areaIds.includes(a.id)),
        { ...scope, detection },
      ),
    [world, areas, scope, detection],
  )
  const scan = useMemo(() => scanContainers(data, containers, pt.platform), [data, containers, pt.platform])
  const found = useMemo(() => [...scan.found.values()], [scan])
  const searcher = useMemo(() => createSearch(found.map((f) => f.item)), [found])
  const searchMode = usePrefs((s) => s.searchMode)
  const results = useMemo(() => {
    const ranks = searchRanks(searcher, query, searchMode)
    if (!ranks) return [...found].sort((a, b) => a.item.name.localeCompare(b.item.name))
    return found.filter((f) => ranks.has(f.item.key)).sort((a, b) => ranks.get(a.item.key)! - ranks.get(b.item.key)!)
  }, [searcher, found, query, searchMode])

  const selected = selectedKey ? data.itemsByKey.get(selectedKey) : undefined

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Search chests in <em>{world.name}</em>
        </DialogTitle>
        <DialogDescription>Find where an item is stored.</DialogDescription>
      </DialogHeader>
      <AreaSelector
        scope={scope}
        onChange={setScope}
        onManage={() =>
          useUi.getState().open({ type: 'areas', returnTo: { type: 'chestSearch', itemKey: selectedKey } })
        }
      />

      {selected ? (
        <Locations
          itemKey={selected.key}
          containers={containers}
          // the playthrough's own areas that are searched (not the "Full World" entry)
          areas={pt.areas.filter((a) => scope.areaIds.includes(a.id))}
          onBack={() => setSelectedKey(undefined)}
        />
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${found.length} different items in ${containers.length} containers…`}
              className="pl-8"
              autoFocus
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
            {results.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">No matching items in these containers.</li>
            )}
            {results.slice(0, 200).map((f) => (
              <li key={f.item.key} className="border-b last:border-b-0">
                <button
                  onClick={() => setSelectedKey(f.item.key)}
                  className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-muted/60"
                >
                  <WikiIcon src={f.item.icon} alt="" size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">{f.item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {f.stack} in {plural(f.containers, 'container')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Locations({
  itemKey,
  containers,
  areas,
  onBack,
}: {
  itemKey: string
  containers: Container[]
  areas: Area[]
  onBack: () => void
}) {
  const data = useStore((s) => s.data)!
  const pt = useActivePlaythrough()!
  const world = useActiveWorld()!
  const item = data.itemsByKey.get(itemKey)!
  // chest shown on the map: hovered or clicked in the list, or clicked on the map
  const [active, setActive] = useState<number | null>(null)
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  const hits = useMemo(
    () =>
      containers
        .map((c) => ({
          c,
          stack: c.items
            .filter((s) => resolveItem(data, s.id, pt.platform)?.key === itemKey)
            .reduce((n, s) => n + s.stack, 0),
        }))
        .filter((h) => h.stack > 0),
    [containers, data, pt.platform, itemKey],
  )
  const total = hits.reduce((n, h) => n + h.stack, 0)
  const label = (c: Container) => `${CONTAINER_LABELS[c.kind]}${c.name ? ` “${c.name}”` : ''}`
  const highlights = useMemo(
    () =>
      hits.map(({ c, stack }) => ({
        x: c.x,
        y: c.y,
        label: `${label(c)} · ×${stack} · ${formatTilePosition(c.x, c.y, world)}`,
      })),
    [hits, world],
  )

  const show = (i: number) => {
    setActive(i)
    setFocus({ x: hits[i].c.x, y: hits[i].c.y })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </Button>
        <WikiIcon src={item.icon} alt="" size={32} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-muted-foreground">
            {hits.length ? `${total} in ${plural(hits.length, 'container')}` : 'Not found in the selected areas'}
          </div>
        </div>
      </div>
      {hits.length > 0 && (
        <>
          <WorldMap
            dims={{ ...world, rockLayer: world.rockLayer }}
            world={world}
            areas={areas}
            editable={false}
            highlights={highlights}
            active={active}
            onHighlightClick={(i) => {
              setActive(i)
              rowRefs.current[i]?.scrollIntoView({ block: 'nearest' })
            }}
            focus={focus}
            svgClassName="max-h-[36vh] min-h-40"
          />
          <ul className="min-h-28 flex-1 overflow-y-auto rounded-lg border" onMouseLeave={() => setActive(null)}>
            {hits.map(({ c, stack }, i) => (
              <li
                key={i}
                ref={(el) => {
                  rowRefs.current[i] = el
                }}
                className="border-b last:border-b-0"
              >
                <button
                  onClick={() => show(i)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60',
                    active === i && 'bg-emerald-500/10',
                  )}
                  title="Show on the map"
                >
                  <MapPin
                    className={cn('size-4 shrink-0', active === i ? 'text-emerald-500' : 'text-muted-foreground')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {CONTAINER_LABELS[c.kind]}
                      {c.name && <span className="font-normal text-muted-foreground"> “{c.name}”</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTilePosition(c.x, c.y, world)} · tile {c.x}, {c.y}
                    </div>
                  </div>
                  <span className="tabular-nums">×{stack}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
