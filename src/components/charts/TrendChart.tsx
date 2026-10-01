'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { useCurrency } from '@/src/context/CurrencyContext'

import { monthAbbrev } from '@/src/lib/envelope'
import { BirdEmptyState } from '../BirdEmptyState'


export interface TrendPoint {
  date: string
  value: number
  /** No income on record for this month: drawn as an outlined placeholder, not a value. */
  missing?: boolean
}

interface Props {
  data: TrendPoint[]
  baseline?: number | null
  selectedKey?: string | null
  hideAmounts?: boolean
  onSelect?: (key: string) => void
  partialKey?: string | null
  partialNote?: string | null
  /** Shown instead of the chart when `data` is empty. */
  emptyNote?: string
  ariaLabel?: string
}

const HEIGHT = 245
const PAD_TOP = 38
const PAD_BOTTOM = 34
const PAD_X = 12



export function TrendChart({
  data,
  baseline,
  selectedKey,
  hideAmounts = false,
  onSelect,
  partialKey,
  partialNote,
  emptyNote = 'No spending data yet',
  ariaLabel = 'Spending over the last 12 months',
}: Props) {
  const { formatCompact, formatCurrency } = useCurrency()
  // viewBox tracks the rendered width so the plot spans the whole card. A
  // fixed-width viewBox gets letterboxed into the middle of wide cards.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [WIDTH, setWidth] = useState(800)
  const empty = data.length === 0
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [empty])

  if (empty) return (
    <BirdEmptyState
      compact
      subject="insights"
      title={emptyNote}
      description="A few logged expenses will turn this quiet card into a trend."
      className="ins-chart-empty"
      style={{ minHeight: HEIGHT }}
    />
  )

  const max = Math.max(...data.map((point) => point.value), baseline ?? 0, 1)
  // Savings can go negative (a month that spent more than it earned): those
  // bars hang below a zero line instead of the chart's floor.
  const min = Math.min(0, ...data.map((point) => point.value))
  const range = max - min
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const zeroY = HEIGHT - PAD_BOTTOM - (-min / range) * plotHeight
  const slot = (WIDTH - PAD_X * 2) / data.length
  // Bars fill their slot, so they widen/narrow as months are added.
  const barWidth = Math.max(8, slot - Math.min(16, slot * 0.2))
  const baselineY = baseline == null ? null : zeroY - (baseline / range) * plotHeight

  return (
    <div className="ins-trend-wrap" ref={wrapRef}>
      <div className="ins-axis-row">
        <span>{formatCompact(max, hideAmounts)}</span>
      </div>
      <svg className="ins-trend-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
        {min < 0 && <line x1={PAD_X} x2={WIDTH - PAD_X} y1={zeroY} y2={zeroY} className="ins-trend-zero" />}
        {data.map((point, index) => {
          const negative = point.value < 0
          const height = point.missing
            ? (zeroY - PAD_TOP) * 0.45
            : point.value !== 0 ? Math.max(3, (Math.abs(point.value) / range) * plotHeight) : 2
          const x = PAD_X + index * slot + (slot - barWidth) / 2
          const y = negative ? zeroY : zeroY - height
          const selected = point.date === selectedKey
          const dimmed = (point.value === 0 && !point.missing) || (selectedKey != null && !selected && point.date !== partialKey)
          const amountText = point.missing ? 'No income set' : hideAmounts ? 'Amount hidden' : formatCurrency(point.value)
          const label = `${monthAbbrev(point.date)}${point.date === partialKey ? '*' : ''}`
          return (
            <g
              key={point.date}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${label}, ${amountText}`}
              aria-pressed={selected}
              className="ins-trend-column"
              onClick={() => onSelect?.(point.date)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onSelect(point.date)
                }
              }}
            >
              <title>{label} · {amountText}</title>
              <rect x={PAD_X + index * slot} y={PAD_TOP} width={slot} height={plotHeight} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx="7"
                className={point.missing ? 'ins-trend-bar is-missing' : negative ? 'ins-trend-bar is-negative' : 'ins-trend-bar'}
                style={{ opacity: dimmed ? 0.42 : 1, animationDelay: `${index * 30}ms` }}
              />
              {selected && (
                <text
                  x={x + barWidth / 2}
                  y={negative ? Math.min(HEIGHT - PAD_BOTTOM - 4, y + height + 14) : Math.max(15, y - 10)}
                  textAnchor="middle"
                  className="ins-trend-value"
                >
                  {point.missing ? 'Add income' : formatCompact(point.value, hideAmounts)}
                </text>
              )}
              <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className={selected ? 'ins-trend-label is-selected' : 'ins-trend-label'}>
                {label}
              </text>
            </g>
          )
        })}
        {/* Drawn after the bars so tall bars don't hide it. */}
        {baselineY != null && (
          // Keyed on the value so the draw-in replays when the average changes;
          // starts once the last bar has finished rising.
          <g
            key={baseline}
            className="ins-trend-baseline-group"
            style={{ '--ins-baseline-delay': `${(data.length - 1) * 30 + 350}ms` } as CSSProperties}
          >
            <line x1={PAD_X} x2={WIDTH - PAD_X} y1={baselineY} y2={baselineY} className="ins-trend-baseline" />
            <text x={PAD_X + 4} y={baselineY - 6} className="ins-trend-baseline-label">
              avg {formatCompact(baseline!, hideAmounts)}
            </text>
          </g>
        )}
      </svg>
      {partialKey && partialNote && data.some((point) => point.date === partialKey) && (
        <p className="ins-chart-note">* {partialNote}</p>
      )}
    </div>
  )
}
