import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'

import { FadeIn, Reaction, TourRow } from '@/src/components/tour/parts'
import { useTourContent } from '@/src/components/tour/useTourContent'
import { ROLLOVER_ROWS } from '@/src/components/tour/content'

/**
 * Chapter 4: the quiz, then a September 30 / October 1 toggle showing what a
 * new month actually does. Mirrors src/lib/envelope.ts: the assigned amount
 * carries as a template, the leftover rolls in on top, and Credit Card
 * Payment's target restarts at zero while its unspent cash still carries.
 */
export function RolloverDemo({ onComplete }: { onComplete: () => void }) {
  const { QUIZ_OPTIONS, QUIZ_QUESTION } = useTourContent()

  const { formatCurrency } = useCurrency()

  const [answer, setAnswer] = useState<string | null>(null)
  const [month, setMonth] = useState<'sep' | 'oct'>('sep')

  const picked = QUIZ_OPTIONS.find((option) => option.id === answer)
  const isOctober = month === 'oct'

  return (
    <div className="tour-demo">
      <div className="tour-quiz">
        <p className="tour-kicker is-accent">POP QUIZ</p>
        <p className="tour-quiz-question">{QUIZ_QUESTION}</p>
        {QUIZ_OPTIONS.map((option) => {
          const revealed = answer != null
          const good = revealed && option.correct
          const bad = answer === option.id && !option.correct
          return (
            <Reaction key={option.id} on={good || bad} kind={bad ? 'wobble' : 'bounce'} by={1.04}>
            <button
              type="button"
              className={`tour-quiz-option ${good ? 'is-good' : bad ? 'is-bad' : ''}`}
              onClick={() => {
                setAnswer(option.id)
                if (option.correct) onComplete()
              }}
            >
              <span className="tour-quiz-dot">{(good || bad) && <span className="tour-quiz-mark">{good ? '✓' : '✕'}</span>}</span>
              <span className="tour-quiz-label">{option.label}</span>
            </button>
            </Reaction>
          )
        })}
        {picked && (
          <FadeIn ms={200} key={picked.id}>
            <p className={`tour-quiz-feedback ${picked.correct ? 'is-mint' : 'is-warn'}`}>{picked.feedback}</p>
          </FadeIn>
        )}
      </div>

      <div className="tour-tabs" role="tablist">
        {(
          [
            { key: 'sep', label: 'September 30' },
            { key: 'oct', label: 'October 1' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={month === tab.key}
            className={`tour-tab ${month === tab.key ? 'is-active' : ''}`}
            onClick={() => {
              setMonth(tab.key)
              if (tab.key === 'oct') onComplete()
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {ROLLOVER_ROWS.map((row) => (
        <TourRow
          key={row.name}
          icon={row.icon}
          name={row.name}
          note={
            isOctober
              ? row.creditCard
                ? `target restarts at zero · ${formatCurrency(row.left)} cash carried`
                : row.left > 0
                  ? `${formatCurrency(row.plan)} plan · +${formatCurrency(row.left)} from September`
                  : 'plan carried from September'
              : row.left > 0
                ? `${formatCurrency(row.left)} still unspent`
                : 'fully spent'
          }
          right={
            <div className="tour-source-right">
              <span className="tour-row-name">{formatCurrency(isOctober ? (row.creditCard ? 0 : row.plan) + row.left : row.plan)}</span>
              <span className={`tour-kicker ${isOctober && row.left > 0 ? 'is-mint' : ''}`}>
                {isOctober ? (row.left > 0 ? 'LEFTOVER CARRIED' : 'AVAILABLE') : 'ASSIGNED'}
              </span>
            </div>
          }
        />
      ))}

      <p className="tour-result-note">
        {isOctober
          ? "Credit Card Payment's target restarts at 0, but its cash carries like the rest. Nothing needs triggering by hand."
          : 'On the 1st, Home shows a one-time card saying what rolled over. Overspent? The gap rolls too, so you can cover it.'}
      </p>
    </div>
  )
}
