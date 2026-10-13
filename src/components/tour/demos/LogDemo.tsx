import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'

import { SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { LOG_CHIPS, SPEND_ROWS } from '@/src/components/tour/content'

interface Logged {
  id: string
  category: string
  amount: number
  method: string
  what: string
  emoji: string
}

/** Chapter 2: log a quick expense and watch exactly one bar move. */
export function LogDemo({ onComplete }: { onComplete: () => void }) {
  const { formatCurrency } = useCurrency()

  const [logged, setLogged] = useState<Logged[]>([])

  const extra: Record<string, number> = {}
  for (const entry of logged) extra[entry.category] = (extra[entry.category] ?? 0) + entry.amount
  const cardTotal = logged.filter((l) => l.method === 'Card').reduce((sum, l) => sum + l.amount, 0)
  const lastCategory = logged.length ? logged[logged.length - 1].category : null

  return (
    <div className="tour-demo">
      {SPEND_ROWS.map((row) => {
        const spent = row.spent + (extra[row.id] ?? 0)
        const pct = Math.min(100, Math.round((spent / row.plan) * 100))
        const hot = row.id === lastCategory
        return (
          <div key={row.id} className={`tour-log-card ${hot ? 'is-hot' : ''}`}>
            <div className="tour-log-head">
              <div className="tour-row-tile">{row.emoji}</div>
              <div className="tour-row-body">
                <span className="tour-row-name">{row.name}</span>
                <span className="tour-row-note">
                  {formatCurrency(spent)} spent of {formatCurrency(row.plan)}
                </span>
              </div>
              <span className={`tour-log-left ${hot ? 'is-hot' : ''}`}>{formatCurrency(Math.max(0, row.plan - spent))} left</span>
            </div>
            <div className="env-bar-track">
              <div
                className={`env-bar-fill ${pct === 100 ? 'is-done' : pct > 90 ? 'is-coral' : pct > 75 ? 'is-warn' : 'is-mint'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}

      {cardTotal > 0 && (
        <ResultCard tone="mint">
          <div className="tour-log-head">
            <span style={{ fontSize: 16 }}>💳</span>
            <div className="tour-row-body">
              <span className="tour-row-name">Credit Card Payment</span>
              <span className="tour-row-note">auto filled by card spends</span>
            </div>
            <span className="tour-log-left is-mint">{formatCurrency(cardTotal)} set aside</span>
          </div>
        </ResultCard>
      )}

      <SectionLabel>QUICK LOG ONE · WATCH ONE BAR MOVE</SectionLabel>
      <div className="tour-chip-row">
        {LOG_CHIPS.map((chip) => {
          const used = logged.some((l) => l.id === chip.id)
          return (
            <button
              key={chip.id}
              type="button"
              disabled={used}
              className={`tour-chip ${used ? 'is-used' : ''}`}
              onClick={() => {
                setLogged((prev) => prev.concat([{ ...chip }]))
                onComplete()
              }}
            >
              {chip.emoji} <span className="tour-chip-amount">{formatCurrency(chip.amount)}</span> · {chip.what}
            </button>
          )
        })}
      </div>

      {logged.length > 0 && (
        <ResultCard tone="accent">
          <p className="tour-kicker">JUST LOGGED</p>
          {logged.map((entry) => (
            <div key={entry.id} className="tour-log-entry">
              <span style={{ fontSize: 14 }}>{entry.emoji}</span>
              <span className="tour-log-entry-text">
                {formatCurrency(entry.amount)} · {entry.what}
              </span>
              <span className="tour-log-entry-method">{entry.method}</span>
            </div>
          ))}
          <p className="tour-result-note">
            {cardTotal > 0
              ? 'Paid by card? The same amount lands in Credit Card Payment automatically, so the money to clear the bill is already set aside, not spent twice.'
              : 'Only that one category moved. Every other bar is exactly where you left it.'}
          </p>
        </ResultCard>
      )}

      <div className="tour-tip">
        <span style={{ fontSize: 17 }}>🧾</span>
        <p>
          Long receipt? Scan a bill reads it into line items you can edit, split by however many people ate, and file into
          categories before logging.
        </p>
      </div>
    </div>
  )
}
