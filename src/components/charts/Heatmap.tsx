'use client'

import { useCurrency } from '@/src/context/CurrencyContext'



export interface HeatmapCell {
  date: string
  day: number
  value: number
}

interface Props {
  cells: HeatmapCell[]
  todayDate?: string
  hideAmounts?: boolean
  onSelectDate?: (date: string) => void
}

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const CELL = 38
const GAP = 6
const TOP = 25
const LEVEL_OPACITY = [0.16, 0.4, 0.65, 0.9]

export function heatmapLevels(cells: HeatmapCell[]) {
  const nonZero = cells.filter((cell) => cell.day > 0 && cell.value > 0).map((cell) => cell.value).sort((a, b) => a - b)
  const levels = new Map<string, number>()
  for (const cell of cells) {
    if (cell.day === 0 || cell.value <= 0) continue
    const rank = nonZero.findIndex((value) => value >= cell.value)
    levels.set(cell.date, Math.min(Math.floor((rank / nonZero.length) * 4), 3) + 1)
  }
  return levels
}

export function Heatmap({ cells, todayDate, hideAmounts = false, onSelectDate }: Props) {
  const { formatCurrency } = useCurrency()

  const rows = Math.max(1, Math.ceil(cells.length / 7))
  const width = CELL * 7 + GAP * 6
  const height = TOP + rows * CELL + (rows - 1) * GAP
  const levels = heatmapLevels(cells)

  return (
    <div className="ins-heatmap-shell">
      <svg className="ins-heatmap-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily spending calendar">
        {LABELS.map((label, index) => (
          <text key={`${label}-${index}`} x={index * (CELL + GAP) + CELL / 2} y={11} textAnchor="middle" className="ins-heatmap-weekday">
            {label}
          </text>
        ))}
        {Array.from({ length: rows * 7 }, (_, index) => {
          const cell = cells[index]
          if (!cell || cell.day === 0) return null
          const row = Math.floor(index / 7)
          const col = index % 7
          const x = col * (CELL + GAP)
          const y = TOP + row * (CELL + GAP)
          const level = levels.get(cell.date) ?? 0
          const future = Boolean(todayDate && cell.date > todayDate)
          const today = cell.date === todayDate
          const interactive = Boolean(onSelectDate && !future)
          const label = `${cell.date}, ${cell.value > 0 ? (hideAmounts ? 'spending amount hidden' : formatCurrency(cell.value)) : 'no spend'}`
          return (
            <g
              key={cell.date}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={label}
              className={interactive ? 'ins-heatmap-cell is-interactive' : 'ins-heatmap-cell'}
              style={{
                transformOrigin: `${x + CELL / 2}px ${y + CELL / 2}px`,
                animationDelay: `${150 + col * 70 + row * 15}ms`,
              }}
              onClick={() => interactive && onSelectDate?.(cell.date)}
              onKeyDown={(event) => {
                if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onSelectDate?.(cell.date)
                }
              }}
            >
              <title>{label}</title>
              <rect
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx="10"
                className={`${future ? 'is-future' : ''} ${today ? 'is-today' : ''}`}
                style={level > 0 && !future ? { fill: `color-mix(in oklab, var(--gold) ${LEVEL_OPACITY[level - 1] * 100}%, var(--erd-card-solid))` } : undefined}
              />
              <text x={x + CELL / 2} y={y + CELL / 2 + 4} textAnchor="middle" className={level >= 3 && !future ? 'ins-heatmap-day is-bright' : 'ins-heatmap-day'}>
                {cell.day}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="ins-heatmap-legend" aria-hidden="true">
        <span>Less</span>
        <i />
        {LEVEL_OPACITY.map((opacity) => <i key={opacity} style={{ background: `color-mix(in oklab, var(--gold) ${opacity * 100}%, var(--erd-card-solid))` }} />)}
        <span>More</span>
      </div>
    </div>
  )
}
