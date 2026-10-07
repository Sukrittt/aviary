'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { CaptureProposal } from '@/src/api/ai'
import type { BalanceResult, BalanceStatus, MoneyInReason, ResolveAnswer } from '@/src/api/balanceChecks'
import { CaptureReview } from '@/src/components/CaptureReview'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { GAP_ORIGIN } from '@/src/features/capture/captureRows'
import { useBalanceStatus, useResolveBalanceCheck, useSubmitBalance } from '@/src/hooks/useBalanceCheck'
import { track } from '@/src/lib/analytics'

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
/** Same cap as the server's: more than this isn't someone's everyday accounts. */
const MAX_ACCOUNTS = 5

type Measured = Exclude<BalanceResult, { kind: 'baseline' }>
type GapReason = 'unlogged' | 'card_bill' | 'moved' | 'mix'
type Step =
  | { name: 'enter' }
  | { name: 'gap'; check: Measured }
  | { name: 'amounts'; check: Measured; reason: Exclude<GapReason, 'unlogged'> }
  | { name: 'surplus'; check: Measured }
  | { name: 'review'; proposal: CaptureProposal; cardShortfall: number; loggedPct: number }

const SAVE_FAILED = "Couldn't save your balance. Check your connection and try again."
const RESOLVE_FAILED = "Couldn't save that. Check your connection and try again."

const GAP_OPTIONS: { reason: GapReason; title: string; body: string }[] = [
  { reason: 'unlogged', title: "Spends I didn't log", body: "We'll split it across your usual envelopes. You can fix it before it's logged." },
  { reason: 'card_bill', title: 'Card bill', body: 'You paid a credit card bill from this account.' },
  { reason: 'moved', title: 'Moved, lent or cash', body: 'Sent to savings, lent to someone or took out cash.' },
  { reason: 'mix', title: 'A mix', body: 'Some of each. Tell us the amounts.' },
]

const MONEY_IN_OPTIONS: { reason: MoneyInReason; title: string }[] = [
  { reason: 'income', title: 'Income or salary' },
  { reason: 'refund', title: 'Refund or paid back' },
  { reason: 'moved_in', title: 'Moved in from another account' },
]

function parseAmount(text: string): number {
  const t = text.trim()
  return AMOUNT_RE.test(t) ? Number(t) : NaN
}

/** What an account is called when the user hasn't named it. Distinct per row, so the server never sees two the same. */
function defaultName(i: number): string {
  return i === 0 ? 'Bank' : `Account ${i + 1}`
}

/**
 * The weekly balance check. The user types the balance of each account they
 * pay from, named once and asked about again every week, and the server
 * checks the total against what they logged. A gap gets one more question
 * with one-click answers, and spends they didn't log come back as estimates
 * on the same review card Ask Aviary uses. Twin of Mobile's
 * app/modals/balance-check.tsx.
 */
export function BalanceCheckModal({ onClose: close }: { onClose: () => void }) {
  const statusQ = useBalanceStatus({ fresh: true })
  const [step, setStep] = useState<Step>({ name: 'enter' })
  // The check is already resolved by the time estimates show, and they live only here: closing
  // would lose them, so the review has to end with Log or Not now.
  const [reviewing, setReviewing] = useState(false)
  const onClose = useCallback(() => {
    if (!reviewing) close()
  }, [close, reviewing])
  // The expected balance moves with every expense logged since the last fetch, so wait for this open's own answer.
  const ready = statusQ.isFetchedAfterMount || statusQ.isError

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  let body: ReactNode
  if (!ready) body = <LoadingCaption />
  else if (step.name === 'enter') body = <EnterBalance status={statusQ.data ?? null} onDone={onClose} onMeasured={setStep} />
  else if (step.name === 'gap') body = <GapQuestion check={step.check} onDone={onClose} onNext={setStep} />
  else if (step.name === 'amounts') {
    body = <GapAmounts check={step.check} reason={step.reason} onDone={onClose} onNext={setStep} onBack={() => setStep({ name: 'gap', check: step.check })} />
  }
  else if (step.name === 'surplus') body = <SurplusQuestion check={step.check} onDone={onClose} />
  else body = <Estimates {...step} onReviewing={setReviewing} onDone={close} />

  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card balance-card" role="dialog" aria-modal="true" aria-label="Balance check" onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>Balance check</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={reviewing}>
            <X size={18} />
          </button>
        </div>
        {body}
      </Sheet>
    </Scrim>
  )
}

type AccountRow = { name: string; amount: string }

function EnterBalance({ status: fetched, onDone, onMeasured }: {
  status: BalanceStatus | null
  onDone: () => void
  onMeasured: (step: Step) => void
}) {
  const { formatMoney, currencyPrefix } = useCurrency()
  const submit = useSubmitBalance()
  const button = useButtonPhase()
  // Frozen at open: saving refetches the status, which would flip the copy under the success tick.
  const [status] = useState(fetched)
  const first = status !== null && !status.anchor
  const expected = status?.expected ?? null
  // Each balance is typed, never prefilled: the app can't know how the total splits, and a
  // prefill invites confirming without opening the bank app.
  const [rows, setRows] = useState<AccountRow[]>(() =>
    (status?.accounts?.length ? status.accounts : ['']).map((name) => ({ name, amount: '' })),
  )
  const [caption, setCaption] = useState<string | null>(null)
  const [error, setError] = useState('')

  const multi = rows.length > 1
  const names = rows.map((r, i) => r.name.trim() || defaultName(i))
  const values = rows.map((r) => parseAmount(r.amount))
  const complete = values.every((v) => !Number.isNaN(v))
  const total = values.reduce((sum, v) => sum + (Number.isNaN(v) ? 0 : v), 0)
  const busy = button.saving || button.success

  function setRow(index: number, patch: Partial<AccountRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setError('')
  }

  async function onSubmit() {
    if (!complete || busy) return
    if (new Set(names.map((n) => n.toLowerCase())).size < names.length) {
      setError('Give each account its own name.')
      return
    }
    setError('')
    button.start()
    try {
      const result = await submit.mutateAsync(rows.map((_, i) => ({ name: names[i], balance: values[i] })))
      track('balance_checked', { kind: result.kind, accounts: rows.length })
      if (result.kind === 'unlogged' || result.kind === 'surplus') {
        button.reset()
        onMeasured({ name: result.kind === 'unlogged' ? 'gap' : 'surplus', check: result })
        return
      }
      setCaption(
        result.kind !== 'baseline'
          ? "All square. You've logged everything."
          : result.reason === 'accounts_changed'
            ? "New starting point saved. We'll compare next week."
            : 'Starting point saved. See you next week.',
      )
      button.succeed(onDone)
    } catch {
      button.fail()
      setError(SAVE_FAILED)
    }
  }

  const hint = first
    ? "This is your starting point. Next week we'll compare."
    : expected === null
      ? 'Type the balance your bank shows.'
      : `We expect about ${formatMoney(expected)}${multi ? ' in total' : ''}.`

  return (
    <form className="balance-step" onSubmit={(e) => { e.preventDefault(); void onSubmit() }}>
      <div className="balance-intro">
        <span className="balance-intro-icon" aria-hidden="true">🏦</span>
        <div>
          <strong>{first ? 'Your starting balance' : status?.open ? "Let's finish your last check" : "What's your balance now?"}</strong>
          <p>
            {first
              ? 'Add each account you pay from with UPI. Check them in GPay, PhonePe or your bank app.'
              : 'Check it in GPay, PhonePe or your bank app.'}
          </p>
        </div>
      </div>

      <div className="balance-accounts">
        {rows.map((r, i) => (
          <div key={i} className="balance-account">
            {multi && (
              <input
                className="balance-account-name"
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder={defaultName(i)}
                maxLength={30}
                aria-label={`Account ${i + 1} name`}
                disabled={busy}
              />
            )}
            <label className="balance-amount">
              <span aria-hidden="true">{currencyPrefix}</span>
              <input
                value={r.amount}
                onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                inputMode="decimal"
                placeholder="0"
                aria-label={`${names[i]} balance`}
                autoFocus={i === 0}
                disabled={busy}
              />
            </label>
            {multi && (
              <button
                type="button"
                className="balance-account-remove"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove ${names[i]}`}
                disabled={busy}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {multi && <p className="balance-total">{`Total ${formatMoney(total)}`}</p>}
        {rows.length < MAX_ACCOUNTS && (
          <button type="button" className="balance-add" onClick={() => setRows((prev) => [...prev, { name: '', amount: '' }])} disabled={busy}>
            + Add another account
          </button>
        )}
      </div>

      <p className="balance-hint">{caption ?? hint}</p>
      {error !== '' && <p className="balance-error" role="alert">{error}</p>}
      <SuccessButton
        type="submit"
        baseClass="erd-log-submit"
        saving={button.saving}
        success={button.success}
        savingLabel="Checking…"
        successLabel="Saved"
        disabled={!complete || busy}
      >
        {first ? 'Save' : 'Check'}
      </SuccessButton>
    </form>
  )
}

function Option({ title, body, busy, success, disabled, onClick }: {
  title: string
  body?: string
  busy?: boolean
  success?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <SuccessButton
      type="button"
      baseClass="balance-option"
      saving={busy}
      success={success}
      savingLabel="One sec…"
      successLabel="Saved"
      disabled={disabled}
      onClick={onClick}
    >
      <strong>{title}</strong>
      {body && <small>{body}</small>}
    </SuccessButton>
  )
}

function GapQuestion({ check, onDone, onNext }: { check: Measured; onDone: () => void; onNext: (step: Step) => void }) {
  const { formatMoney } = useCurrency()
  const resolve = useResolveBalanceCheck()
  const button = useButtonPhase()
  const [caption, setCaption] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function pick(reason: GapReason) {
    if (reason !== 'unlogged') {
      onNext({ name: 'amounts', check, reason })
      return
    }
    setError('')
    button.start()
    try {
      const result = await resolve.mutateAsync({ id: check.id, answer: {} })
      track('balance_resolved', { reason })
      if (result.proposal) {
        button.reset()
        onNext({ name: 'review', proposal: result.proposal, cardShortfall: result.cardShortfall, loggedPct: result.loggedPct })
      } else {
        setCaption('Got it. Nothing to log.')
        button.succeed(onDone)
      }
    } catch {
      button.fail()
      setError(RESOLVE_FAILED)
    }
  }

  const busy = button.saving || button.success
  return (
    <div className="balance-step">
      <h4 className="balance-title">{`${formatMoney(check.gap)} left your account that you haven't logged.`}</h4>
      <p className="balance-hint">{caption ?? 'What was it?'}</p>
      {GAP_OPTIONS.map((o) => (
        <Option
          key={o.reason}
          title={o.title}
          body={o.body}
          busy={o.reason === 'unlogged' && button.saving}
          success={o.reason === 'unlogged' && button.success}
          disabled={busy}
          onClick={() => void pick(o.reason)}
        />
      ))}
      {error !== '' && <p className="balance-error" role="alert">{error}</p>}
    </div>
  )
}

function AmountField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { currencyPrefix } = useCurrency()
  return (
    <label className="balance-field">
      <span>{label}</span>
      <span className="balance-amount">
        <span aria-hidden="true">{currencyPrefix}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0" aria-label={`${label} amount`} />
      </span>
    </label>
  )
}

function GapAmounts({ check, reason, onDone, onNext, onBack }: {
  check: Measured
  reason: Exclude<GapReason, 'unlogged'>
  onDone: () => void
  onNext: (step: Step) => void
  onBack: () => void
}) {
  const { formatMoney } = useCurrency()
  const resolve = useResolveBalanceCheck()
  const button = useButtonPhase()
  const [card, setCard] = useState('')
  const [moved, setMoved] = useState('')
  const [caption, setCaption] = useState<string | null>(null)
  const [error, setError] = useState('')

  const askCard = reason === 'card_bill' || reason === 'mix'
  const askMoved = reason === 'moved' || reason === 'mix'
  const cardValue = askCard ? parseAmount(card) : 0
  const movedValue = askMoved ? parseAmount(moved) : 0
  const valid = !Number.isNaN(cardValue) && !Number.isNaN(movedValue) && cardValue + movedValue > 0
  const rest = Math.round(check.gap - (cardValue || 0) - (movedValue || 0))
  const restLine = rest > check.tolerance ? `The other ${formatMoney(rest)} counts as spends you didn't log.` : 'That covers it.'
  const busy = button.saving || button.success

  async function onSubmit() {
    if (!valid || busy) return
    setError('')
    button.start()
    const answer: ResolveAnswer = { ...(askCard ? { cardBill: cardValue } : {}), ...(askMoved ? { movedOut: movedValue } : {}) }
    try {
      const result = await resolve.mutateAsync({ id: check.id, answer })
      track('balance_resolved', { reason })
      if (result.proposal) {
        button.reset()
        onNext({ name: 'review', proposal: result.proposal, cardShortfall: result.cardShortfall, loggedPct: result.loggedPct })
      } else {
        setCaption('Got it. Nothing to log.')
        button.succeed(onDone)
      }
    } catch {
      button.fail()
      setError(RESOLVE_FAILED)
    }
  }

  return (
    <form className="balance-step" onSubmit={(e) => { e.preventDefault(); void onSubmit() }}>
      <h4 className="balance-title">{`${formatMoney(check.gap)} left your account.`}</h4>
      <p className="balance-hint">{reason === 'mix' ? 'How much of it was each?' : 'How much was it?'}</p>
      {askCard && <AmountField label="Card bill" value={card} onChange={setCard} />}
      {askMoved && <AmountField label="Moved, lent or cash" value={moved} onChange={setMoved} />}
      {valid && <p className="balance-hint">{caption ?? restLine}</p>}
      {error !== '' && <p className="balance-error" role="alert">{error}</p>}
      <SuccessButton type="submit" baseClass="erd-log-submit" saving={button.saving} success={button.success} successLabel="Saved" disabled={!valid || busy}>
        Continue
      </SuccessButton>
      <button type="button" className="action-button is-ghost balance-back" onClick={onBack} disabled={busy}>
        Pick something else
      </button>
    </form>
  )
}

function SurplusQuestion({ check, onDone }: { check: Measured; onDone: () => void }) {
  const { formatMoney } = useCurrency()
  const resolve = useResolveBalanceCheck()
  const button = useButtonPhase()
  const [picked, setPicked] = useState<MoneyInReason | null>(null)
  const [caption, setCaption] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function pick(reason: MoneyInReason) {
    setPicked(reason)
    setError('')
    button.start()
    try {
      await resolve.mutateAsync({ id: check.id, answer: { moneyIn: reason } })
      track('balance_resolved', { reason })
      setCaption('Got it. Nothing to log.')
      button.succeed(onDone)
    } catch {
      setPicked(null)
      button.fail()
      setError(RESOLVE_FAILED)
    }
  }

  return (
    <div className="balance-step">
      <h4 className="balance-title">{`You've got ${formatMoney(-check.gap)} more than we expected.`}</h4>
      <p className="balance-hint">{caption ?? 'Where did it come from? Nothing gets logged.'}</p>
      {MONEY_IN_OPTIONS.map((o) => (
        <Option
          key={o.reason}
          title={o.title}
          busy={picked === o.reason && button.saving}
          success={picked === o.reason && button.success}
          disabled={button.saving || button.success}
          onClick={() => void pick(o.reason)}
        />
      ))}
      {error !== '' && <p className="balance-error" role="alert">{error}</p>}
    </div>
  )
}

function Estimates({ proposal, cardShortfall, loggedPct, onReviewing, onDone }: {
  proposal: CaptureProposal
  cardShortfall: number
  loggedPct: number
  onReviewing: (reviewing: boolean) => void
  onDone: () => void
}) {
  const { formatMoney } = useCurrency()
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    onReviewing(!settled)
  }, [onReviewing, settled])
  return (
    <div className="balance-step">
      <h4 className="balance-title">Here&apos;s our best guess</h4>
      <p className="balance-hint">Split across the envelopes you usually spend from, and marked as estimates. Fix anything that&apos;s off, then log.</p>
      {cardShortfall > 0 && (
        <p className="balance-hint">{`Your card bill was ${formatMoney(cardShortfall)} more than the card spends you logged, so those are in here too.`}</p>
      )}
      {!settled && <p className="balance-hint">Log them, or choose Not now. Closing would lose these.</p>}
      <CaptureReview proposal={proposal} origin={GAP_ORIGIN} onSettled={() => setSettled(true)} />
      {settled && (
        <>
          <p className="balance-hint">{`You'd logged ${loggedPct}% of what left your account yourself.`}</p>
          <button type="button" className="erd-log-submit" onClick={onDone}>Done</button>
        </>
      )}
    </div>
  )
}
