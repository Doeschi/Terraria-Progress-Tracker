import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Hand, Maximize, Minus, Plus, Settings2, SquareDashedMousePointer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTilePosition, type WorldDims } from '@/lib/coords'
import type { Area } from '@/lib/saveFile'
import { CONTAINER_LABELS, DEFAULT_DETECTION, playerPlaced, type LoadedWorld } from '@/lib/world'
import { usePrefs } from '@/lib/prefs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// Schematic world map (stage 1): depth layers from the world header, the spawn
// marker, chests as dots and the areas as rectangles. SVG in tile
// coordinates; pan/zoom by changing the viewBox. Areas are drawn, moved and
// resized directly on the map - or, read-only (editable=false), the map shows
// highlighted containers, e.g. the chests a searched item is in.

export type Rect = Pick<Area, 'x1' | 'y1' | 'x2' | 'y2'>

export interface MapHighlight {
  x: number
  y: number
  /** tooltip */
  label: string
}

interface Props {
  dims: WorldDims & { rockLayer?: number }
  world: LoadedWorld | null
  areas: Area[]
  selectedId?: string | null
  onSelect?(id: string | null): void
  onCreate?(rect: Rect): void
  onChange?(area: Area): void
  /** false: no drawing or editing of areas (they are shown faintly) */
  editable?: boolean
  /** containers to highlight; all other containers are dimmed */
  highlights?: MapHighlight[]
  /** index of the emphasised highlight */
  active?: number | null
  onHighlightClick?(index: number): void
  /** center the map on this point whenever the object changes */
  focus?: { x: number; y: number } | null
  svgClassName?: string
}

const NOOP = () => {}

type View = { x: number; y: number; w: number; h: number }
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'
type Drag =
  | { kind: 'pan'; clientX: number; clientY: number; view: View; moved: boolean; hit?: number }
  | { kind: 'draw'; start: { x: number; y: number }; rect: Rect }
  | { kind: 'edit'; handle: Handle; start: { x: number; y: number }; orig: Area; draft: Area }

const MIN_VIEW = 40 // tiles visible at most zoom

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  move: 'move',
}

export function WorldMap({
  dims,
  world,
  areas,
  selectedId = null,
  onSelect = NOOP,
  onCreate = NOOP,
  onChange = NOOP,
  editable = true,
  highlights,
  active = null,
  onHighlightClick,
  focus,
  svgClassName,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 }) // measured by the ResizeObserver
  const [view, setView] = useState<View>({ x: 0, y: 0, w: dims.width, h: dims.height })
  const [toolState, setTool] = useState<'pan' | 'draw'>('draw')
  const tool = editable ? toolState : 'pan'
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  // natural (world generation) chests are hidden unless "All chests" is chosen
  const [showAll, setShowAll] = useState(false)
  const detection = usePrefs((s) => s.chestDetection)
  const player = world ? playerPlaced(world, detection) : []
  // counts on the "chests shown" buttons: chests only (displays always count as player-placed)
  const chestCount = world ? world.containers.filter((c) => c.kind === 'chest').length : 0
  const playerChestCount = world ? world.containers.filter((c, i) => c.kind === 'chest' && player[i]).length : 0

  // world units per screen pixel
  const scale = size.w ? Math.max(view.w / size.w, view.h / size.h) : 1

  const fit = useCallback(() => {
    const aspect = size.w / size.h
    const margin = 0.02
    let w = dims.width * (1 + margin * 2)
    let h = w / aspect
    if (h < dims.height * (1 + margin * 2)) {
      h = dims.height * (1 + margin * 2)
      w = h * aspect
    }
    setView({ x: dims.width / 2 - w / 2, y: dims.height / 2 - h / 2, w, h })
  }, [size, dims.width, dims.height])

  // track the element size; fit the whole world on first layout
  const fitted = useRef(false)
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width || 1, h: e.contentRect.height || 1 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!fitted.current && size.w > 1 && size.h > 1) {
      fitted.current = true
      fit()
    }
  }, [size, fit])

  // center on a requested point (e.g. a chest from a result list), zoomed in to about 250 tiles
  useEffect(() => {
    if (!focus || size.w <= 1) return
    setView((v) => {
      const w = Math.min(v.w, 250)
      const h = (w * v.h) / v.w
      return { x: focus.x - w / 2, y: focus.y - h / 2, w, h }
    })
  }, [focus, size.w])

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }, [])

  const zoom = useCallback(
    (factor: number, center?: { x: number; y: number }) => {
      setView((v) => {
        const w = Math.min(Math.max(v.w * factor, MIN_VIEW), dims.width * 1.5)
        const f = w / v.w
        const c = center ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 }
        return { x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w, h: v.h * f }
      })
    },
    [dims.width],
  )

  // wheel zoom around the cursor (non-passive listener to stop page scrolling)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom(Math.exp(e.deltaY * 0.0015), toWorld(e.clientX, e.clientY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, toWorld])

  const clampTile = (p: { x: number; y: number }) => ({
    x: Math.min(dims.width - 1, Math.max(0, Math.floor(p.x))),
    y: Math.min(dims.height - 1, Math.max(0, Math.floor(p.y))),
  })
  const normalize = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  })

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element
    const areaId = target.getAttribute('data-area')
    const handle = target.getAttribute('data-handle') as Handle | null
    const p = toWorld(e.clientX, e.clientY)
    svgRef.current!.setPointerCapture(e.pointerId)
    if (areaId && e.button === 0 && editable) {
      const area = areas.find((a) => a.id === areaId)!
      onSelect(areaId)
      setDrag({ kind: 'edit', handle: handle ?? 'move', start: p, orig: area, draft: area })
      return
    }
    if (tool === 'draw' && e.button === 0) {
      const t = clampTile(p)
      setDrag({ kind: 'draw', start: t, rect: normalize(t, t) })
      return
    }
    // a highlight counts as clicked when the pointer comes up without panning
    const hit = target.getAttribute('data-highlight')
    setDrag({
      kind: 'pan',
      clientX: e.clientX,
      clientY: e.clientY,
      view,
      moved: false,
      hit: hit === null ? undefined : Number(hit),
    })
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY)
    setHover(p.x >= 0 && p.y >= 0 && p.x < dims.width && p.y < dims.height ? clampTile(p) : null)
    if (!drag) return
    if (drag.kind === 'pan') {
      const dx = (e.clientX - drag.clientX) * scale
      const dy = (e.clientY - drag.clientY) * scale
      setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy })
      if (Math.abs(dx) + Math.abs(dy) > 2 * scale) setDrag({ ...drag, moved: true })
    } else if (drag.kind === 'draw') {
      setDrag({ ...drag, rect: normalize(drag.start, clampTile(p)) })
    } else {
      const dx = Math.round(p.x - drag.start.x)
      const dy = Math.round(p.y - drag.start.y)
      const o = drag.orig
      let { x1, y1, x2, y2 } = o
      const h = drag.handle
      if (h === 'move') {
        // keep the size, stay inside the world
        const w = o.x2 - o.x1
        const ht = o.y2 - o.y1
        x1 = Math.min(Math.max(0, o.x1 + dx), dims.width - 1 - w)
        y1 = Math.min(Math.max(0, o.y1 + dy), dims.height - 1 - ht)
        x2 = x1 + w
        y2 = y1 + ht
      } else {
        if (h.includes('w')) x1 = o.x1 + dx
        if (h.includes('e')) x2 = o.x2 + dx
        if (h.includes('n')) y1 = o.y1 + dy
        if (h.includes('s')) y2 = o.y2 + dy
      }
      const r = normalize(clampTile({ x: x1, y: y1 }), clampTile({ x: x2, y: y2 }))
      setDrag({ ...drag, draft: { ...o, ...r } })
    }
  }

  const onPointerUp = () => {
    if (!drag) return
    if (drag.kind === 'draw') {
      const r = drag.rect
      if (r.x2 - r.x1 >= 2 && r.y2 - r.y1 >= 2) onCreate(r)
    } else if (drag.kind === 'edit') {
      const d = drag.draft
      const o = drag.orig
      if (d.x1 !== o.x1 || d.y1 !== o.y1 || d.x2 !== o.x2 || d.y2 !== o.y2) onChange(d)
    } else if (!drag.moved) {
      if (drag.hit !== undefined) onHighlightClick?.(drag.hit)
      else onSelect(null) // click on empty map
    }
    setDrag(null)
  }

  const shown = areas.map((a) => (drag?.kind === 'edit' && drag.orig.id === a.id ? drag.draft : a))
  const selected = shown.find((a) => a.id === selectedId)
  const px = (n: number) => n * scale // screen pixels -> world units

  // depth layers (as the game defines them)
  const space = dims.worldSurface * 0.35
  const underworld = dims.height - 200
  const rock = dims.rockLayer
  const layers = [
    { name: 'Space', y1: 0, y2: space, color: '#1e2a4a' },
    { name: 'Surface', y1: space, y2: dims.worldSurface, color: '#4a86b8' },
    ...(rock
      ? [
          { name: 'Underground', y1: dims.worldSurface, y2: rock, color: '#7a5a3a' },
          { name: 'Caverns', y1: rock, y2: underworld, color: '#5a4a44' },
        ]
      : [{ name: 'Underground', y1: dims.worldSurface, y2: underworld, color: '#6a5040' }]),
    { name: 'Underworld', y1: underworld, y2: dims.height, color: '#6e2a20' },
  ]

  const cursor =
    drag?.kind === 'pan'
      ? 'grabbing'
      : drag?.kind === 'edit'
        ? HANDLE_CURSOR[drag.handle]
        : tool === 'pan'
          ? 'grab'
          : 'crosshair'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {editable && (
          <ControlGroup label="Tool">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={tool}
              onValueChange={(v) => v && setTool(v as 'pan' | 'draw')}
            >
              <ToggleGroupItem value="draw" title="Drag on the map to draw a new area">
                <SquareDashedMousePointer /> Draw area
              </ToggleGroupItem>
              <ToggleGroupItem value="pan" title="Drag to move the map (the middle mouse button always pans)">
                <Hand /> Pan
              </ToggleGroupItem>
            </ToggleGroup>
          </ControlGroup>
        )}
        <ControlGroup label="Zoom">
          <Button variant="outline" size="icon-sm" onClick={() => zoom(1 / 1.5)} aria-label="Zoom in" title="Zoom in">
            <Plus />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => zoom(1.5)} aria-label="Zoom out" title="Zoom out">
            <Minus />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={fit}
            aria-label="Show the whole world"
            title="Show the whole world"
          >
            <Maximize />
          </Button>
        </ControlGroup>
        {world && (
          // only changes what the map shows - separated from the tools
          <ControlGroup label="Chests shown on the map" className="border-l pl-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={showAll ? 'all' : 'player'}
              onValueChange={(v) => v && setShowAll(v === 'all')}
              aria-label="Chests shown on the map"
            >
              <ToggleGroupItem
                value="player"
                title="Show only player chests: chests with a name, or placed near other chests"
              >
                Player chests <span className="text-muted-foreground">{playerChestCount}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="all" title="Also show the loot chests placed by world generation">
                All chests <span className="text-muted-foreground">{chestCount}</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <DetectionSettings total={chestCount} player={playerChestCount} />
          </ControlGroup>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3 self-end pb-1.5 text-xs text-muted-foreground">
          {highlights && <Legend color="#34d399" label="Found here" ring />}
          <Legend color="#f5b642" label="Chest" />
          <Legend color="#c084fc" label="Display" />
          <Legend color="#ffffff" label="Spawn" ring />
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn(
          'max-h-[50vh] min-h-56 w-full touch-none rounded-lg border bg-black/80 select-none',
          svgClassName,
        )}
        // height follows the world's shape (large worlds are 3.5 : 1), plus some room to pan
        style={{ cursor, aspectRatio: `${dims.width} / ${dims.height * 1.25}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        role="application"
        aria-label="World map"
      >
        {layers.map((l) => (
          <g key={l.name}>
            <rect x={0} y={l.y1} width={dims.width} height={l.y2 - l.y1} fill={l.color} />
            <text x={px(8)} y={l.y1 + px(16)} fontSize={px(12)} fill="white" opacity={0.7} pointerEvents="none">
              {l.name}
            </text>
          </g>
        ))}
        <rect
          x={0}
          y={0}
          width={dims.width}
          height={dims.height}
          fill="none"
          stroke="white"
          strokeOpacity={0.4}
          vectorEffect="non-scaling-stroke"
        />

        {world?.containers.map((c, i) =>
          !showAll && !player[i] ? null : (
            <circle
              key={i}
              cx={c.x + 1}
              cy={c.y + 1}
              r={px(c.kind === 'chest' ? 2.5 : 2)}
              fill={c.kind === 'chest' ? '#f5b642' : '#c084fc'}
              // with highlights, the other containers are only context
              opacity={highlights ? 0.3 : 1}
              pointerEvents={drag ? 'none' : 'auto'}
            >
              <title>
                {`${CONTAINER_LABELS[c.kind]}${c.name ? ` “${c.name}”` : ''}${player[i] ? '' : ' (natural)'} · ${formatTilePosition(c.x, c.y, dims)}`}
              </title>
            </circle>
          ),
        )}
        {world && <Marker x={world.spawnX} y={world.spawnY} color="#ffffff" label="Spawn" px={px} />}

        {shown.map((a) => {
          const isSel = a.id === selectedId
          return (
            <g key={a.id} opacity={editable ? 1 : 0.5} pointerEvents={editable ? undefined : 'none'}>
              <rect
                data-area={a.id}
                x={a.x1}
                y={a.y1}
                width={a.x2 - a.x1 + 1}
                height={a.y2 - a.y1 + 1}
                fill="var(--primary)"
                fillOpacity={isSel ? 0.3 : 0.15}
                stroke="var(--primary)"
                strokeWidth={isSel ? 2 : 1.5}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: isSel ? 'move' : 'pointer' }}
              />
              <text
                x={a.x1 + px(4)}
                y={a.y1 - px(4)}
                fontSize={px(12)}
                fill="white"
                fontWeight={600}
                pointerEvents="none"
              >
                {a.name}
              </text>
            </g>
          )
        })}

        {drag?.kind === 'draw' && (
          <rect
            x={drag.rect.x1}
            y={drag.rect.y1}
            width={drag.rect.x2 - drag.rect.x1 + 1}
            height={drag.rect.y2 - drag.rect.y1 + 1}
            fill="var(--primary)"
            fillOpacity={0.2}
            stroke="var(--primary)"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

        {selected && editable && <Handles area={selected} px={px} />}

        {/* highlighted containers on top; the active one last so nothing covers it */}
        {highlights &&
          [...highlights.keys()]
            .sort((a, b) => Number(a === active) - Number(b === active))
            .map((i) => {
              const h = highlights[i]
              const isActive = i === active
              return (
                <g key={i} style={{ cursor: 'pointer' }}>
                  <circle
                    cx={h.x + 1}
                    cy={h.y + 1}
                    r={px(isActive ? 11 : 7)}
                    fill="#34d399"
                    fillOpacity={isActive ? 0.35 : 0.2}
                    stroke="#34d399"
                    strokeWidth={isActive ? 3 : 2}
                    vectorEffect="non-scaling-stroke"
                    data-highlight={i}
                  >
                    <title>{h.label}</title>
                  </circle>
                  <circle cx={h.x + 1} cy={h.y + 1} r={px(3)} fill="#ffffff" pointerEvents="none" />
                </g>
              )
            })}
      </svg>

      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {hover
            ? `${formatTilePosition(hover.x, hover.y, dims)} · tile ${hover.x}, ${hover.y}`
            : 'Hover the map for coordinates'}
        </span>
        <span>
          {!editable
            ? 'Mouse wheel zooms · drag to move the map · click a green marker to select its chest'
            : drag?.kind === 'draw'
              ? `${drag.rect.x2 - drag.rect.x1 + 1} × ${drag.rect.y2 - drag.rect.y1 + 1} tiles`
              : selected
                ? 'Drag the area to move it, its handles to resize it · click the empty map to deselect'
                : tool === 'draw'
                  ? 'Drag on the map to draw an area · click an area to select it · mouse wheel zooms'
                  : 'Drag to move the map · click an area to select it · mouse wheel zooms'}
        </span>
      </div>
    </div>
  )
}

/** Rule for "your" chests: named, or at least N containers within D tiles. */
function DetectionSettings({ total, player }: { total: number; player: number }) {
  const detection = usePrefs((s) => s.chestDetection)
  const setDetection = usePrefs((s) => s.setChestDetection)
  const num = (v: string, min: number) => Math.max(min, Math.round(Number(v) || min))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="How player chests are recognized"
          title="How player chests are recognized"
        >
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <p className="mb-3 text-xs text-muted-foreground">
          The world file does not record who placed a chest. A chest counts as a player chest if it has a name, or if at
          least <b>{detection.minGroup}</b> chests are within <b>{detection.distance}</b> tiles of each other. Used by
          the map, sync and chest search.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="det-distance">Distance (tiles)</Label>
            <Input
              id="det-distance"
              type="number"
              min={1}
              value={detection.distance}
              onChange={(e) => setDetection({ ...detection, distance: num(e.target.value, 1) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="det-group">Group size</Label>
            <Input
              id="det-group"
              type="number"
              min={2}
              value={detection.minGroup}
              onChange={(e) => setDetection({ ...detection, minGroup: num(e.target.value, 2) })}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {player} of {total} chests are player chests
          </span>
          <Button variant="ghost" size="xs" onClick={() => setDetection(DEFAULT_DETECTION)}>
            Defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Handles({ area, px }: { area: Area; px: (n: number) => number }) {
  const s = px(9)
  const mx = (area.x1 + area.x2 + 1) / 2
  const my = (area.y1 + area.y2 + 1) / 2
  const pts: [Handle, number, number][] = [
    ['nw', area.x1, area.y1],
    ['n', mx, area.y1],
    ['ne', area.x2 + 1, area.y1],
    ['e', area.x2 + 1, my],
    ['se', area.x2 + 1, area.y2 + 1],
    ['s', mx, area.y2 + 1],
    ['sw', area.x1, area.y2 + 1],
    ['w', area.x1, my],
  ]
  return (
    <g>
      {pts.map(([h, x, y]) => (
        <rect
          key={h}
          data-area={area.id}
          data-handle={h}
          x={x - s / 2}
          y={y - s / 2}
          width={s}
          height={s}
          fill="white"
          stroke="var(--primary)"
          vectorEffect="non-scaling-stroke"
          style={{ cursor: HANDLE_CURSOR[h] }}
        />
      ))}
    </g>
  )
}

function Marker({
  x,
  y,
  color,
  label,
  px,
}: {
  x: number
  y: number
  color: string
  label: string
  px: (n: number) => number
}) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={px(5)} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <text x={x + px(8)} y={y + px(4)} fontSize={px(11)} fill={color} fontWeight={600}>
        {label}
      </text>
    </g>
  )
}

/** A labelled group of map controls (like the fields in the header). */
function ControlGroup({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

function Legend({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn('inline-block size-2.5 rounded-full', ring && 'border-2 bg-transparent')}
        style={ring ? { borderColor: color } : { background: color }}
      />
      {label}
    </span>
  )
}
