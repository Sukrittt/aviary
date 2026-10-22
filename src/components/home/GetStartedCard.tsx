import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { CheckIcon, CaretRightIcon, PlusCircleIcon, CompassIcon, CardholderIcon, EnvelopeSimpleIcon } from '@/src/components/icons'

type Props = {
  incomeDone: boolean
  fundDone: boolean
  /** Live remainder, e.g. "₹49,920 still to assign"; falls back to a generic hint. */
  fundHint?: string
  /** First pay lands next month, e.g. "Your pay lands Nov 4. Budget what you have till then."
   * Step one then asks for what's in the account now, not an income. */
  upcomingPayHint?: string
  manualTransactionDone: boolean
  guidedTourDone: boolean
  onAddIncome: () => void
  onFund: () => void
  onAddTransaction: () => void
  onTakeTour: () => void
  onSkip: () => void
  /** e.g. "Free until 21 November 2026 · no card needed". Replaces the old
   * full-screen trial notice after onboarding, so the trial is mentioned
   * without standing between a new user and their first expense. */
  trialNote?: string
}

/** Setup is done but can skip income, so the first step stays open until the
 * envelopes have money to hold, and the second until all of it is assigned.
 * The last two milestones are shared across devices. Twin of Mobile's
 * src/components/home/GetStartedCard.tsx. */
export function GetStartedCard({ incomeDone, fundDone, fundHint, upcomingPayHint, manualTransactionDone, guidedTourDone, onAddIncome, onFund, onAddTransaction, onTakeTour, onSkip, trialNote }: Props) {
  const reduce = useReducedMotion()
  const steps = [
    incomeDone
      ? { key: 'budget', icon: CardholderIcon, label: 'Set up your budget', hint: 'Your categories are ready', done: true }
      : { key: 'budget', icon: CardholderIcon, label: upcomingPayHint ? 'Add what you have now' : 'Add your income', hint: upcomingPayHint ?? 'Give your categories money to hold', done: false, onClick: onAddIncome },
    { key: 'fund', icon: EnvelopeSimpleIcon, label: 'Assign all your income', hint: fundHint ?? 'Give all of it a category', done: fundDone, onClick: onFund },
    { key: 'transaction', icon: PlusCircleIcon, label: 'Add a manual transaction', hint: 'Log one expense by hand', done: manualTransactionDone, onClick: onAddTransaction },
    { key: 'tour', icon: CompassIcon, label: 'Take a guided tour', hint: 'See where everything lives', done: guidedTourDone, onClick: onTakeTour },
  ]
  const count = steps.filter((step) => step.done).length
  const next = steps.find((step) => !step.done)?.key

  return (
    <article
      className="erd-card home-get-started"
      aria-labelledby="get-started-heading"
    >
      <div className="get-started-heading">
        <div>
          <h2 id="get-started-heading">Get started</h2>
          <p>Four small steps, then this card gets out of your way.</p>
          {trialNote && <Link href="/account/trial-notice?from=more" className="get-started-trial">{trialNote}</Link>}
        </div>
        <button type="button" className="get-started-skip" aria-label="Skip getting started" onClick={onSkip}>Skip</button>
      </div>
      <div className="get-started-progress" role="progressbar" aria-label="Getting started" aria-valuemin={0} aria-valuemax={4} aria-valuenow={count} aria-valuetext={`${count} of 4 getting started steps complete`}>
        <div className="get-started-segments">
          {steps.map((step, i) => (
            <span key={step.key} className="get-started-segment">
              <motion.span initial={reduce ? false : { width: '0%' }} animate={{ width: step.done ? '100%' : '0%' }} transition={reduce ? { duration: 0 } : { type: 'spring', damping: 22, stiffness: 180, delay: 0.22 + i * 0.09 }} />
            </span>
          ))}
        </div>
        <span aria-hidden="true">{count}/4</span>
      </div>
      <div className="get-started-steps">
        {steps.map((step, i) => {
          const Icon = step.done ? CheckIcon : step.icon
          return (
            <motion.div
              key={step.key}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', damping: 20, stiffness: 220, delay: 0.14 + i * 0.07 }}
            >
              <motion.button
                type="button"
                className={`get-started-step${step.done ? ' is-done' : ''}${step.key === next ? ' is-next' : ''}`}
                aria-label={`${step.label}${step.done ? ', complete' : ''}`}
                disabled={step.done}
                onClick={step.onClick}
                whileTap={reduce || step.done ? undefined : { scale: 0.98 }}
                transition={{ duration: reduce ? 0 : 0.14 }}
              >
                <span className="get-started-icon"><Icon size={16} aria-hidden="true" /></span>
                <span className="get-started-step-copy"><strong>{step.label}</strong><span>{step.done ? 'Done' : step.hint}</span></span>
                {!step.done && <CaretRightIcon size={17} aria-hidden="true" />}
              </motion.button>
            </motion.div>
          )
        })}
      </div>
    </article>
  )
}
