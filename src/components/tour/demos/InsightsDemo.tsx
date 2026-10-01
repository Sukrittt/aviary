import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'

import { SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { useTourContent } from '@/src/components/tour/useTourContent'
import { NORMAL_BARS, NORMAL_BAR_MAX } from '@/src/components/tour/content'

const TYPE_INTERVAL_MS = 16
const CHARS_PER_TICK = 2

/** Chapter 5: the normal-month comparison, plus an Ask Aviary answer that types itself out. */
export function InsightsDemo({ onComplete }: { onComplete: () => void }) {
  const { BRAIN_ASKS } = useTourContent()

  const { formatCurrency } = useCurrency()

  const [asked, setAsked] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    [],
  )

  function ask(question: string) {
    if (timer.current) clearInterval(timer.current)
    const full = BRAIN_ASKS.find((b) => b.q === question)?.a ?? ''
    setAsked(question)
    setTyped('')
    let i = 0
    timer.current = setInterval(() => {
      i += CHARS_PER_TICK
      if (i >= full.length) {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        setTyped(full)
        onComplete()
      } else {
        setTyped(full.slice(0, i))
      }
    }, TYPE_INTERVAL_MS)
  }

  return (
    <div className="tour-demo">
      <div className="tour-card">
        <SectionLabel>IS THIS A NORMAL MONTH?</SectionLabel>
        {NORMAL_BARS.map((bar) => (
          <div key={bar.label} className="tour-normal-bar">
            <div className="tour-normal-bar-head">
              <span>{bar.label}</span>
              <span className="tour-row-name">{formatCurrency(bar.value)}</span>
            </div>
            <div className="env-bar-track">
              <div
                className={`env-bar-fill ${bar.accent ? '' : 'is-done'}`}
                style={{ width: `${Math.round((bar.value / NORMAL_BAR_MAX) * 100)}%`, background: bar.accent ? 'var(--gold)' : undefined }}
              />
            </div>
          </div>
        ))}
        <p className="tour-result-note">
          Compared day for day, so a half finished month is never judged against a full one. You can also hide the rent
          shaped categories that never move.
        </p>
      </div>

      <SectionLabel>ASK AVIARY</SectionLabel>
      <div className="tour-chip-row">
        {BRAIN_ASKS.map((item) => {
          const active = asked === item.q
          return (
            <button key={item.q} type="button" className={`tour-chip ${active ? 'is-active' : ''}`} onClick={() => ask(item.q)}>
              {item.q}
            </button>
          )
        })}
      </div>

      {asked && (
        <ResultCard tone="accent">
          <div className="tour-brain-answer">
            <span style={{ fontSize: 15 }}>🧠</span>
            <p>{typed}</p>
          </div>
        </ResultCard>
      )}
    </div>
  )
}
