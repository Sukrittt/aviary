import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'

import { AmountText, type as tokenType } from '@/src/components/landing/mobile/kit'
import { TourRow } from '@/src/components/tour/parts'
import { ASSIGN_ROWS, TOUR_INCOME } from '@/src/components/tour/content'

/** Chapter 1: hand out the income until Ready to Assign hits zero. */
export function AssignDemo({ onComplete }: { onComplete: () => void }) {
  const { formatCurrency } = useCurrency()

  const [funded, setFunded] = useState<Record<string, boolean>>({})

  const assigned = ASSIGN_ROWS.reduce((sum, row) => sum + (funded[row.id] ? row.plan : 0), 0)
  const readyToAssign = TOUR_INCOME - assigned

  function toggle(id: string) {
    const next = { ...funded }
    if (next[id]) delete next[id]
    else next[id] = true
    setFunded(next)
    const left = TOUR_INCOME - ASSIGN_ROWS.reduce((sum, row) => sum + (next[row.id] ? row.plan : 0), 0)
    if (left === 0) onComplete()
  }

  const heroClass = readyToAssign === 0 ? 'is-mint' : readyToAssign < 0 ? 'is-coral' : ''
  const heroColor = readyToAssign === 0 ? 'var(--mint)' : readyToAssign < 0 ? 'var(--coral)' : 'var(--erd-text)'
  const note =
    readyToAssign === 0
      ? 'All your money has a job ✓'
      : readyToAssign < 0
        ? "You've assigned more than you earn"
        : `${formatCurrency(readyToAssign)} of your ${formatCurrency(TOUR_INCOME)} income has no job yet`

  return (
    <div className="tour-demo">
      <div className="tour-hero">
        <span className="tour-hero-label">READY TO ASSIGN</span>
        <AmountText
          value={readyToAssign}
          size={tokenType.display}
          color={heroColor}
          weight="displayBold"
          animate
          id="tour-rta"
        />
        <span className={`tour-hero-note ${heroClass}`}>{note}</span>
      </div>

      {ASSIGN_ROWS.map((row) => {
        const on = !!funded[row.id]
        return (
          <TourRow
            key={row.id}
            icon={row.icon}
            name={row.name}
            note={on ? `${formatCurrency(row.plan)} funded` : `needs ${formatCurrency(row.plan)}`}
            noteClass={on ? 'is-mint' : ''}
            right={
              <button type="button" className={`tour-pill ${on ? 'is-done' : ''}`} onClick={() => toggle(row.id)}>
                {on ? '✓ Funded' : `Assign ${formatCurrency(row.plan)}`}
              </button>
            }
          />
        )
      })}

      <button type="button" className="tour-reset" onClick={() => setFunded({})}>
        Start over
      </button>
    </div>
  )
}
