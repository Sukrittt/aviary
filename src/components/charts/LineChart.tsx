'use client'

import { useState, type PointerEvent } from 'react'

export interface LinePoint {
  /** Any monotonic x (e.g. epoch ms); scaled to the width. */
  x: number
  y: number
}

const W = 100
const H = 40
const PAD_Y = 3

/** Smooth path through the points: quadratic curves via each point to the
 *  midpoint of the next, which never overshoots the data's min/max. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${pts[i].x},${pts[i].y} ${mx},${my}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${last.x},${last.y}`
}

/** Smooth line with a soft gradient fill, wiped in on mount. Hover (or drag
 *  on touch) snaps a dot + tooltip to the nearest point. Mirrors Mobile's
 *  LineChart. */
export function LineChart({
  data,
  label,
  formatX,
  formatY,
}: {
  data: LinePoint[]
  label: string
  formatX: (x: number) => string
  formatY: (y: number) => string
}) {
  const [active, setActive] = useState<number | null>(null)
  if (data.length < 2) return null
  const xs = data.map((p) => p.x)
  const ys = data.map((p) => p.y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const pts = data.map((p) => ({
    x: maxX === minX ? 0 : ((p.x - minX) / (maxX - minX)) * W,
    // Flat series sits mid-height instead of dividing by zero.
    y: maxY === minY ? H / 2 : PAD_Y + (1 - (p.y - minY) / (maxY - minY)) * (H - PAD_Y * 2),
  }))
  const line = smoothPath(pts)

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - fx) < Math.abs(pts[best].x - fx)) best = i
    setActive(best)
  }

  const p = active != null ? pts[active] : null

  return (
    <div className="ins-line">
      <div className="ins-line-plot" onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <defs>
            <linearGradient id="ins-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--gold)" stopOpacity={0.25} />
              <stop offset="1" stopColor="var(--gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#ins-line-fill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--gold)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* HTML, not SVG: the viewBox is stretched (preserveAspectRatio="none"),
            which would squash a circle into an ellipse. */}
        {p && active != null && (
          <>
            <span className="ins-line-guide" style={{ left: `${p.x}%` }} />
            <span className="ins-line-dot" style={{ left: `${p.x}%`, top: `${(p.y / H) * 100}%` }} />
            <div className="ins-line-tip" style={{ left: `${Math.min(88, Math.max(12, p.x))}%`, top: `${(p.y / H) * 100}%` }}>
              <strong>{formatY(data[active].y)}</strong>
              <span>{formatX(data[active].x)}</span>
            </div>
          </>
        )}
      </div>
      <div className="ins-line-axis">
        <span>{formatX(minX)}</span>
        <span>{formatX(maxX)}</span>
      </div>
    </div>
  )
}
