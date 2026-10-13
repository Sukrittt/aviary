import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'

import { SectionLabel, ResultCard, FadeIn, Reaction } from '@/src/components/tour/parts'
import { MOVE_AMOUNT, MOVE_IN_ENVELOPE, MOVE_NEED, MOVE_SOURCES } from '@/src/components/tour/content'

/** Chapter 3: cover a shortfall by borrowing from an envelope with slack. */
export function MoveDemo({ onComplete }: { onComplete: () => void }) {
  const { formatCurrency } = useCurrency()

  const [moved, setMoved] = useState<{ id: string; name: string; amount: number } | null>(null)

  const inEnvelope = MOVE_IN_ENVELOPE + (moved?.amount ?? 0)
  const short = Math.max(0, MOVE_NEED - inEnvelope)

  return (
    <div className="tour-demo">
      <div className="tour-move-dest">
        <div className="tour-move-tile">💡</div>
        <div className="tour-row-body">
          <p className="tour-kicker">ELECTRICITY · {formatCurrency(MOVE_NEED)} DUE THE 5TH</p>
          <span className="tour-move-amount">{formatCurrency(inEnvelope)} set aside</span>
          <span className={`tour-move-status ${short > 0 ? 'is-coral' : 'is-mint'}`}>
            {short > 0 ? `${formatCurrency(short)} short` : 'fully funded ✓'}
          </span>
        </div>
      </div>

      <SectionLabel>{short > 0 ? 'BEST PLACES TO BORROW FROM' : 'WHERE IT CAME FROM'}</SectionLabel>

      {MOVE_SOURCES.map((source) => {
        const taken = moved?.id === source.id ? moved.amount : 0
        const isProtected = 'protected' in source && source.protected
        return (
          <Reaction key={source.id} on={taken > 0}>
          <button
            type="button"
            className={`tour-source ${taken ? 'is-taken' : isProtected ? 'is-protected' : ''}`}
            onClick={() => {
              setMoved({ id: source.id, name: source.name, amount: Math.min(MOVE_AMOUNT, source.available) })
              onComplete()
            }}
          >
            <div className="tour-row-tile">{source.emoji}</div>
            <div className="tour-row-body">
              <span className="tour-row-name">{source.name}</span>
              <span className={`tour-row-note ${taken ? 'is-accent' : isProtected ? 'is-warn' : ''}`}>
                {taken ? `Gave ${formatCurrency(taken)} · still fine for the month` : source.note}
              </span>
            </div>
            <div className="tour-source-right">
              <span className="tour-source-available">{formatCurrency(source.available - taken)}</span>
              <span className="tour-kicker">AVAILABLE</span>
            </div>
          </button>
          </Reaction>
        )
      })}

      {moved && (
        <FadeIn ms={200}>
        <ResultCard tone="mint">
          <span className="tour-move-result-title">
            {formatCurrency(moved.amount)} moved from {moved.name}
          </span>
          <p className="tour-result-note">No money left your bank. Only the plan changed, and that is the whole trick.</p>
          <button type="button" className="tour-undo" onClick={() => setMoved(null)}>
            Undo
          </button>
        </ResultCard>
        </FadeIn>
      )}
    </div>
  )
}
