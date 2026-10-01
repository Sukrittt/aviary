import { motion, useReducedMotion } from 'motion/react'
import { Check, ChevronRight, CirclePlus, Compass, WalletCards } from 'lucide-react'

type Props = {
  manualTransactionDone: boolean
  guidedTourDone: boolean
  onAddTransaction: () => void
  onTakeTour: () => void
  onSkip: () => void
}

/** Setup is done; the two remaining milestones are shared across devices. */
export function GetStartedCard({ manualTransactionDone, guidedTourDone, onAddTransaction, onTakeTour, onSkip }: Props) {
  const reduce = useReducedMotion()
  const steps = [
    { key: 'budget', icon: WalletCards, label: 'Set up your budget', hint: 'Your envelopes are ready', done: true },
    { key: 'transaction', icon: CirclePlus, label: 'Add a manual transaction', hint: 'Log one expense by hand', done: manualTransactionDone, onClick: onAddTransaction },
    { key: 'tour', icon: Compass, label: 'Take a guided tour', hint: 'See where everything lives', done: guidedTourDone, onClick: onTakeTour },
  ]
  const count = steps.filter((step) => step.done).length
  const next = steps.find((step) => !step.done)?.key

  return (
    <motion.article
      className="erd-card home-get-started"
      aria-labelledby="get-started-heading"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: reduce ? 0 : 0.25 }}
    >
      <div className="get-started-heading">
        <div>
          <h2 id="get-started-heading">Get started</h2>
          <p>Three small steps, then this card gets out of your way.</p>
        </div>
        <button type="button" className="get-started-skip" aria-label="Skip getting started" onClick={onSkip}>Skip</button>
      </div>
      <div className="get-started-progress" role="progressbar" aria-label="Getting started" aria-valuemin={0} aria-valuemax={3} aria-valuenow={count} aria-valuetext={`${count} of 3 getting started steps complete`}>
        <div className="get-started-segments">
          {steps.map((step, i) => (
            <span key={step.key} className="get-started-segment">
              <motion.span initial={reduce ? false : { width: '0%' }} animate={{ width: step.done ? '100%' : '0%' }} transition={reduce ? { duration: 0 } : { type: 'spring', damping: 22, stiffness: 180, delay: 0.22 + i * 0.09 }} />
            </span>
          ))}
        </div>
        <span aria-hidden="true">{count}/3</span>
      </div>
      <div className="get-started-steps">
        {steps.map((step, i) => {
          const Icon = step.done ? Check : step.icon
          return (
            <motion.button
              key={step.key}
              type="button"
              className={`get-started-step${step.done ? ' is-done' : ''}${step.key === next ? ' is-next' : ''}`}
              aria-label={`${step.label}${step.done ? ', complete' : ''}`}
              disabled={step.done}
              onClick={step.onClick}
              whileTap={reduce || step.done ? undefined : { scale: 0.98 }}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', damping: 20, stiffness: 220, delay: 0.14 + i * 0.07 }}
            >
              <span className="get-started-icon"><Icon size={16} aria-hidden="true" /></span>
              <span className="get-started-step-copy"><strong>{step.label}</strong><span>{step.done ? 'Done' : step.hint}</span></span>
              {!step.done && <ChevronRight size={17} aria-hidden="true" />}
            </motion.button>
          )
        })}
      </div>
    </motion.article>
  )
}
