'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { ChatTextIcon, UploadSimpleIcon, ArrowClockwiseIcon } from '@/src/components/icons'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { CategoryPicker } from '@/src/components/CategoryPicker'
import { LogExpenseModal } from '@/src/components/LogExpenseModal'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAddExpense, useLastSpent } from '@/src/hooks/useExpenses'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { useAccessAllowed } from '@/src/hooks/useBillingStatus'
import { formatDateShort } from '@/src/lib/format'
import { todayLocal } from '@/src/lib/date'
import { track } from '@/src/lib/analytics'
import { StatementModal } from './StatementModal'
import { freshStartExpense, gapToFill, GAP_SEEN_KEY } from './gap'

const asString = (raw: string) => raw
type Step = 'sheet' | 'type' | 'upload' | 'fresh' | null

/**
 * The dashboard's "Pick up where you left off". Shows once per gap, when the
 * last expense is two or more days old; any way out of it (an option, Not
 * now, the scrim) marks this gap seen, so it never nags.
 */
export function FillGap() {
  const lastSpent = useLastSpent().data
  const allowed = useAccessAllowed()
  const [seen, setSeen] = usePersistentState(GAP_SEEN_KEY, '', asString, asString)
  const [step, setStep] = useState<Step>('sheet')
  const today = todayLocal()
  const since = lastSpent ? gapToFill(lastSpent, today, seen || null) : null
  // Remembered once the sheet's been answered; the step it led to stays open after.
  const [answeredFor, setAnsweredFor] = useState<string | null>(null)
  const gap = since ?? answeredFor

  if (!gap || !allowed) return null

  function choose(next: Step, option: string) {
    track('gap_sheet_choice', { option })
    setAnsweredFor(gap)
    setSeen(gap!)
    setStep(next)
  }

  return (
    <>
      <AnimatePresence>
        {step === 'sheet' && since && <GapSheet since={since} onChoose={choose} />}
      </AnimatePresence>
      <AnimatePresence>
        {step === 'type' && <LogExpenseModal onClose={() => setStep(null)} onSaved={() => {}} />}
      </AnimatePresence>
      <AnimatePresence>
        {step === 'upload' && <StatementModal onClose={() => setStep(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {step === 'fresh' && <FreshStartModal since={gap} today={today} onClose={() => setStep(null)} />}
      </AnimatePresence>
    </>
  )
}

function GapSheet({ since, onChoose }: { since: string; onChoose: (step: Step, option: string) => void }) {
  const options = [
    { step: 'type' as const, icon: ChatTextIcon, label: 'Type what you spent', hint: 'Add what you remember, one at a time' },
    { step: 'upload' as const, icon: UploadSimpleIcon, label: 'Upload a statement or screenshot', hint: 'Your UPI or bank app has the details' },
    { step: 'fresh' as const, icon: ArrowClockwiseIcon, label: 'Start fresh', hint: 'One rough total, then carry on from today' },
  ]
  return (
    <Scrim className="erd-modal-overlay" onClick={() => onChoose(null, 'dismiss')}>
      <Sheet className="erd-modal-card gap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pick up where you left off">
        <div className="erd-modal-head">
          <div>
            <h3>Pick up where you left off</h3>
            <p className="scan-subtitle">{`Your last expense was on ${formatDateShort(since)}. Catch up whichever way is easiest.`}</p>
          </div>
          <button type="button" className="erd-modal-close" onClick={() => onChoose(null, 'dismiss')} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="gap-options">
          {options.map(({ step, icon: Icon, label, hint }) => (
            <button key={step} type="button" className="gap-option" onClick={() => onChoose(step, step)}>
              <Icon size={20} aria-hidden="true" />
              <span>
                <span className="gap-option-label">{label}</span>
                <span className="gap-option-hint">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="gap-later" onClick={() => onChoose(null, 'later')}>
          Not now
        </button>
      </Sheet>
    </Scrim>
  )
}

/** "Start fresh": one question. A number logs a single "Untracked spending" today; "No idea" just closes. */
export function FreshStartModal({ since, today, onClose }: { since: string; today: string; onClose: () => void }) {
  const { currencySymbol } = useCurrency()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const button = useButtonPhase()
  const addExpense = useAddExpense()
  const expense = freshStartExpense(amount, category, since, today)
  const busy = button.saving || button.success

  async function save() {
    if (!expense || busy) return
    button.start()
    setError('')
    try {
      await addExpense.mutateAsync(expense)
      track('fresh_start_logged', {})
      button.succeed(onClose)
    } catch {
      button.fail()
      setError('Check your connection and try again.')
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card gap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Start fresh">
        <div className="erd-modal-head">
          <div>
            <h3>Roughly how much did you spend while away?</h3>
            <p className="scan-subtitle">A ballpark is fine. It goes in as one expense today, so what&apos;s left stays right and your history stays as it was.</p>
          </div>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>
        <label className="gap-amount">
          <span>{currencySymbol}</span>
          <input
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            aria-label="Rough total"
          />
        </label>
        <p className="gap-note">Which category should it come out of?</p>
        <CategoryPicker value={category} onChange={setCategory} />
        {error && <p className="erd-log-error" role="alert">{error}</p>}
        <SuccessButton
          type="button"
          baseClass="erd-log-submit"
          saving={button.saving}
          success={button.success}
          savingLabel="Logging…"
          successLabel="Fresh start"
          disabled={!expense || busy}
          onClick={save}
        >
          Log it
        </SuccessButton>
        <button type="button" className="gap-later" onClick={onClose} disabled={busy}>
          No idea
        </button>
      </Sheet>
    </Scrim>
  )
}
