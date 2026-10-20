'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { ChatTextIcon, UploadSimpleIcon, ArrowClockwiseIcon, ArrowLeftIcon, CaretRightIcon, XIcon } from '@/src/components/icons'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { CategoryPicker } from '@/src/components/CategoryPicker'
import { CategoryIcon } from '@/src/components/CategoryIcon'
import { splitEmoji } from '@/src/lib/emoji'
import { LogExpenseModal } from '@/src/components/LogExpenseModal'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAddExpense, useLastSpent } from '@/src/hooks/useExpenses'
import { useCategories } from '@/src/hooks/useCategories'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { useAccessAllowed } from '@/src/hooks/useBillingStatus'
import { formatDateShort } from '@/src/lib/format'
import { todayLocal } from '@/src/lib/date'
import { track } from '@/src/lib/analytics'
import { StatementModal } from './StatementModal'
import { freshStartExpense, freshStartSplit, gapToFill, GAP_SEEN_KEY } from './gap'

const asString = (raw: string) => raw
// 'sheet' is the sheet reopened by an option's back arrow, after this gap was already marked seen.
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
  // The option opened from the sheet. The sheet itself shows for any gap not yet seen while none is open.
  const [step, setStep] = useState<Step>(null)
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
  const back = () => setStep('sheet')

  return (
    <>
      <AnimatePresence>
        {((step === null && since) || step === 'sheet') && <GapSheet since={gap} onChoose={choose} />}
      </AnimatePresence>
      <AnimatePresence>
        {step === 'type' && <LogExpenseModal onClose={() => setStep(null)} onBack={back} onSaved={() => {}} />}
      </AnimatePresence>
      <AnimatePresence>
        {step === 'upload' && <StatementModal onClose={() => setStep(null)} onBack={back} />}
      </AnimatePresence>
      <AnimatePresence>
        {step === 'fresh' && <FreshStartModal since={gap} today={today} onClose={() => setStep(null)} onBack={back} />}
      </AnimatePresence>
    </>
  )
}

function GapSheet({ since, onChoose }: { since: string; onChoose: (step: Step, option: string) => void }) {
  // Upload leads: the reason people can't catch up is not remembering, and their UPI app does.
  const others = [
    { step: 'type' as const, icon: ChatTextIcon, label: 'Type what you remember', hint: 'Add what you remember, one at a time.' },
    { step: 'fresh' as const, icon: ArrowClockwiseIcon, label: 'Start fresh', hint: 'One rough total, then carry on from today.' },
  ]
  return (
    <Scrim className="erd-modal-overlay" onClick={() => onChoose(null, 'dismiss')}>
      <Sheet className="erd-modal-card gap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pick up where you left off">
        <div className="erd-modal-head">
          <div>
            <h3>Pick up where you left off</h3>
            <p className="scan-subtitle">{`Last logged on ${formatDateShort(since)}. Catching up takes about a minute, and nothing lands until you've checked it.`}</p>
          </div>
        </div>
        <button type="button" className="gap-hero" onClick={() => onChoose('upload', 'upload')}>
          <span className="gap-chip">Easiest</span>
          <span className="gap-hero-top">
            <span className="gap-tile gap-tile--upload"><UploadSimpleIcon size={24} aria-hidden="true" /></span>
            <span>
              <span className="gap-option-label">Upload a screenshot or statement</span>
              <span className="gap-option-hint">Your UPI or bank app remembers what you don&apos;t.</span>
            </span>
          </span>
          <span className="gap-steps">
            <span><i>1</i><b>Share it</b></span>
            <span><i>2</i>Aviary reads it</span>
            <span><i>3</i>You tick what&apos;s right</span>
          </span>
        </button>
        <div className="gap-options">
          {others.map(({ step, icon: Icon, label, hint }) => (
            <button key={step} type="button" className="gap-option" onClick={() => onChoose(step, step)}>
              <span className="gap-tile"><Icon size={18} aria-hidden="true" /></span>
              <span>
                <span className="gap-option-label">{label}</span>
                <span className="gap-option-hint">{hint}</span>
              </span>
              <CaretRightIcon size={16} aria-hidden="true" />
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

/**
 * "Start fresh": one question. A number logs a single "Untracked spending" today; "No idea" just closes.
 * "Split across categories" is there for whoever remembers roughly where it went: a rough amount per category instead.
 */
export function FreshStartModal({ since, today, onClose, onBack }: { since: string; today: string; onClose: () => void; onBack?: () => void }) {
  const { currencySymbol } = useCurrency()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  // null: one total. Otherwise the split's rows, in the order their categories were picked.
  const [split, setSplit] = useState<{ amount: string; category: string }[] | null>(null)
  const [error, setError] = useState('')
  const button = useButtonPhase()
  // The lists refetch once after the save, not after every row of a split.
  const addExpense = useAddExpense({ refetch: false })
  const single = freshStartExpense(amount, category, since, today)
  const expenses = split ? freshStartSplit(split, since, today) : single && [single]
  const busy = button.saving || button.success
  const categoriesQ = useCategories()
  const categoryIcons = new Map((categoriesQ.data ?? []).map((c) => [c.name, { icon: c.icon, group: c.group }]))
  const cleanAmount = (raw: string) => raw.replace(/[^\d.,]/g, '')

  function pickForSplit(name: string) {
    if (!name) return
    setSplit((rows) => (rows!.some((r) => r.category === name) ? rows : [...rows!, { amount: '', category: name }]))
  }

  async function save() {
    if (!expenses || busy) return
    button.start()
    setError('')
    try {
      // One after another; each is keyed by the gap (and category), so a retry after a partial failure only adds what's missing.
      for (const expense of expenses) await addExpense.mutateAsync(expense)
      track('fresh_start_logged', { categories: expenses.length })
      button.succeed(onClose)
    } catch {
      button.fail()
      setError('Check your connection and try again.')
    } finally {
      addExpense.refresh()
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card gap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Start fresh">
        {onBack && (
          <button type="button" className="erd-modal-back" onClick={onBack} disabled={busy}>
            <ArrowLeftIcon size={14} aria-hidden="true" /> Back
          </button>
        )}
        <div className="erd-modal-head">
          <div>
            <h3>Roughly how much did you spend while away?</h3>
            <p className="scan-subtitle">
              {split
                ? 'A ballpark per category is fine. Each goes in as one expense today, so every category\'s money left stays right.'
                : <>A ballpark is fine. It goes in as one expense today, so what&apos;s left stays right and your history stays as it was.</>}
            </p>
          </div>
          {!onBack && (
            <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
              ✕
            </button>
          )}
        </div>
        {split ? (
          <>
            {split.length > 0 && (
              <ul className="gap-split">
                {split.map((row, i) => (
                  <li key={row.category}>
                    <span className="gap-split-cat">
                      <CategoryIcon name={row.category} {...categoryIcons.get(row.category)} />
                      {splitEmoji(row.category).text}
                    </span>
                    <label className="gap-split-amount">
                      <span>{currencySymbol}</span>
                      <input
                        inputMode="decimal"
                        autoFocus={i === split.length - 1}
                        placeholder="0"
                        value={row.amount}
                        disabled={busy}
                        onChange={(e) => setSplit(split.map((r, j) => (j === i ? { ...r, amount: cleanAmount(e.target.value) } : r)))}
                        aria-label={`Rough amount for ${splitEmoji(row.category).text}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="gap-split-remove"
                      onClick={() => setSplit(split.filter((_, j) => j !== i))}
                      disabled={busy}
                      aria-label={`Remove ${splitEmoji(row.category).text}`}
                    >
                      <XIcon size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="gap-note">{split.length ? 'Add another category' : 'Pick the categories it went on'}</p>
            <CategoryPicker value="" onChange={pickForSplit} />
            <button type="button" className="gap-split-toggle" onClick={() => setSplit(null)} disabled={busy}>
              Use one total instead
            </button>
          </>
        ) : (
          <>
            <label className="gap-amount">
              <span>{currencySymbol}</span>
              <input
                inputMode="decimal"
                autoFocus
                placeholder="0"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(cleanAmount(e.target.value))}
                aria-label="Rough total"
              />
            </label>
            <p className="gap-note">Which category should it come out of?</p>
            <CategoryPicker value={category} onChange={setCategory} />
            <button
              type="button"
              className="gap-split-toggle"
              onClick={() => setSplit(category ? [{ amount, category }] : [])}
              disabled={busy}
            >
              Split across categories
            </button>
          </>
        )}
        {error && <p className="erd-log-error" role="alert">{error}</p>}
        <SuccessButton
          type="button"
          baseClass="erd-log-submit"
          saving={button.saving}
          success={button.success}
          savingLabel="Logging…"
          successLabel="Fresh start"
          disabled={!expenses || busy}
          onClick={save}
        >
          {expenses && expenses.length > 1 ? `Log ${expenses.length} expenses` : 'Log it'}
        </SuccessButton>
        <button type="button" className="gap-later" onClick={onClose} disabled={busy}>
          No idea
        </button>
      </Sheet>
    </Scrim>
  )
}
