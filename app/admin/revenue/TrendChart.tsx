'use client'

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { inr, inrShort, num } from '../format'

export interface TrendPoint {
  /** IST calendar day, YYYY-MM-DD. */
  day: string
  value: number
}

const W = 1000
const H = 220

/** "2026-09-17" to "17 Sept 2026". Parsed and printed in UTC so the calendar day never shifts. */
const longDay = (day: string) => new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortDay = (day: string) => new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A round axis maximum at or above `max`, split into 4 even steps. */
export function niceMax(max: number): number {
  if (max <= 0) return 4
  const step = max / 4
  const mag = 10 ** Math.floor(Math.log10(step))
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * mag >= step)! * mag
  return nice * 4
}

/**
 * One series over time: a 2px line over a soft area, with a crosshair and
 * tooltip on hover, and arrow keys to step through days when focused.
 * `money` values are paise; otherwise they're counts.
 */
export function TrendChart({ points, money, label }: { points: TrendPoint[]; money: boolean; label: string }) {
  const [active, setActive] = useState<number | null>(null)
  const plot = useRef<HTMLDivElement>(null)
  const gradient = useId()
  const fmt = money ? inr : num
  const axis = money ? inrShort : num

  const top = niceMax(Math.max(...points.map((p) => p.value)))
  const x = (i: number) => (points.length === 1 ? W : (i / (points.length - 1)) * W)
  const y = (v: number) => H - (v / top) * H
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const area = `${line}L${W},${H}L0,${H}Z`
  const ticks = [4, 3, 2, 1, 0].map((k) => (top / 4) * k)

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = plot.current!.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    setActive(Math.round(frac * (points.length - 1)))
  }
  const step = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = points.length - 1
    const next = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
    if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (next) setActive((i) => Math.min(last, Math.max(0, (i ?? last) + next)))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const shown = active === null ? null : points[active]
  const first = points[0]
  const lastPoint = points[points.length - 1]

  return (
    <div className="adm-trend">
      <div className="adm-trend-yaxis" aria-hidden>
        {ticks.map((t) => (
          <span key={t}>{axis(t)}</span>
        ))}
      </div>
      <div
        ref={plot}
        className="adm-trend-plot"
        role="img"
        tabIndex={0}
        aria-label={`${label}, ${longDay(first.day)} to today: ${fmt(first.value)} to ${fmt(lastPoint.value)}. Use the arrow keys to read each day.`}
        onPointerMove={pick}
        onPointerLeave={() => setActive(null)}
        onKeyDown={step}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <i key={t} className="adm-trend-grid" style={{ top: `${(1 - t / top) * 100}%` }} aria-hidden />
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tk-mint)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--tk-mint)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="var(--tk-mint)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {shown && active !== null && (
          <>
            <i className="adm-trend-cross" style={{ left: `${(x(active) / W) * 100}%` }} aria-hidden />
            <i className="adm-trend-dot" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(shown.value) / H) * 100}%` }} aria-hidden />
            <div className={`adm-trend-tip ${active > points.length / 2 ? 'is-left' : ''}`} style={{ left: `${(x(active) / W) * 100}%` }} role="status">
              <span>{longDay(shown.day)}</span>
              <b>{fmt(shown.value)}</b>
            </div>
          </>
        )}
      </div>
      <div className="adm-bars-axis">
        <span>{shortDay(first.day)}</span>
        <span>{shortDay(points[Math.floor(points.length / 2)].day)}</span>
        <span>Today</span>
      </div>
    </div>
  )
}
