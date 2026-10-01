import type { CSSProperties, Ref } from 'react'
import { logoPixels, type PlantStage } from '@/lib/logoArt'
import type { LogoTheme } from '@/lib/season'

/** The pixel logo as inline SVG: a plant stage over a progress bar, in a seasonal look. */
export function LogoArt({
  size,
  stage = 'sprout',
  fill = 9,
  theme = null,
  svgRef,
  plantRef,
  style,
}: {
  size: number
  stage?: PlantStage
  fill?: number
  theme?: LogoTheme
  svgRef?: Ref<SVGSVGElement>
  /** the plant group (rotated for the wiggle, around the stem's base) */
  plantRef?: Ref<SVGGElement>
  style?: CSSProperties
}) {
  const { plant, bar, flip } = logoPixels(stage, fill, theme)
  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: 'block', ...style }}
    >
      {/* April Fools: upside down */}
      <g transform={flip ? 'translate(0 16) scale(1 -1)' : undefined}>
        <g ref={plantRef} style={{ transformOrigin: '8px 11px' }}>
          {plant.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
          ))}
        </g>
        {bar.map((r, i) => (
          <rect key={`b${i}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
        ))}
      </g>
    </svg>
  )
}
