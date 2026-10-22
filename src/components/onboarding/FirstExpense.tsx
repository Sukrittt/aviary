'use client'

import { useState } from 'react'
import { useCurrency } from '@/src/context/CurrencyContext'
import { CATEGORY_ICON_COMPONENTS } from '@/src/components/CategoryIcon'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { fillClass, pillClass } from '@/src/components/EnvelopeGrid'
import { avatarStyleFor } from '@/src/lib/emoji'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'
import { AmountTicker } from './AmountTicker'

export interface StarterEnvelope {
  key: string
  name: string
  icon: CategoryIconKey
  assigned: number
}

/**
 * Setup's last step: one real expense against the budget just made, so the
 * envelope visibly moves before Home ever opens. The row is Home's envelope
 * row (EnvelopeGrid's bar and "left" pill), redrawn on every key. Twin of
 * Mobile's FirstExpense.tsx.
 */
export function FirstExpense({
  envelopes,
  initialKey,
  onLog,
  onSkip,
  onDone,
}: {
  envelopes: StarterEnvelope[]
  initialKey?: string
  /** Saves it. Throws to keep the user here with an error. */
  onLog: (envelope: StarterEnvelope, amount: number) => Promise<void>
  onSkip: () => void
  /** After the saved check has played. */
  onDone: () => void
}) {
  const { formatMoney } = useCurrency()
  const phase = useButtonPhase()
  const [key, setKey] = useState(initialKey ?? envelopes[0]?.key)
  const [amount, setAmount] = useState('')
  const [tick, setTick] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [error, setError] = useState('')

  const env = envelopes.find((e) => e.key === key) ?? envelopes[0]
  if (!env) return null
  const spent = Number(amount) || 0
  const left = env.assigned - spent
  // Home's maths for one row with nothing spent yet (computeEnvelopeState).
  const spentPct = env.assigned > 0 ? Math.min(100, (spent / env.assigned) * 100) : spent > 0 ? 100 : 0
  const row = { assigned: env.assigned, spent, isOverspent: left < 0 }
  const busy = phase.saving || phase.success
  const Icon = CATEGORY_ICON_COMPONENTS[env.icon]

  const change = (v: string) => {
    // Keeps one decimal point and two places, so a pasted 12.50 stays 12.50, not 1250.
    const [whole = '', ...frac] = v.replace(/[^\d.]/g, '').split('.')
    const int = whole.replace(/^0+/, '').slice(0, 8)
    const next = frac.length ? `${int || '0'}.${frac.join('').slice(0, 2)}` : int
    setDir((Number(next) || 0) >= spent ? 1 : -1)
    setTick((t) => t + 1)
    setAmount(next)
    setError('')
  }

  const log = async () => {
    if (!spent || busy) return
    phase.start()
    try {
      await onLog(env, spent)
      phase.succeed(onDone)
    } catch {
      phase.fail()
      setError('Couldn’t save that. Check your connection and try again.')
    }
  }

  return (
    <div className="setup-body setup-first-expense">
      <div className="setup-quick-row setup-first-chips" role="group" aria-label="Where it came from">
        {envelopes.map((e) => (
          <button
            key={e.key}
            type="button"
            className={`setup-chip ${e.key === env.key ? 'is-active' : ''}`}
            aria-pressed={e.key === env.key}
            disabled={busy}
            onClick={() => setKey(e.key)}
          >
            {e.name}
          </button>
        ))}
      </div>

      <label className="setup-amount-field">
        <AmountTicker text={formatMoney(spent)} tick={tick} dir={dir} delta={0} dimmed={!amount} />
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          className="setup-amount-hidden"
          aria-label="Amount spent"
          value={amount}
          disabled={busy}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void log()
          }}
        />
      </label>
      {/* Hidden, not removed, so the envelope below doesn't jump on the first key. */}
      <p className="setup-amount-hint" style={amount ? { visibility: 'hidden' } : undefined}>Type what you spent</p>

      <div className="erd-card setup-first-envelope" data-testid="first-expense-envelope">
        <div className="env2-row">
          <div className="env2-row-main">
            <span className="env2-row-top">
              <span className="env2-emoji env2-category-icon" style={avatarStyleFor(env.name)} aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="env2-name">{env.name}</span>
              <span className="env2-spent-of">
                {env.assigned > 0 ? `${formatMoney(spent)} of ${formatMoney(env.assigned)} spent` : 'Nothing budgeted here yet'}
              </span>
            </span>
            <span className="env-bar-track env2-bar">
              <span className={`env-bar-fill ${fillClass(row)}`} style={{ display: 'block', width: `${spentPct}%` }} />
            </span>
          </div>
          <span className="env2-available">
            <span className="env2-balance-label">{left < 0 ? 'Overspent' : 'Left'}</span>
            <span className={`env2-pill ${pillClass(row)}`}>{formatMoney(left)}</span>
          </span>
        </div>
      </div>

      {error !== '' && <p className="setup-error" role="alert">{error}</p>}

      <SuccessButton
        type="button"
        baseClass="setup-cta"
        disabled={!spent || busy}
        saving={phase.saving}
        success={phase.success}
        savingLabel="Logging it…"
        successLabel="Logged"
        onClick={() => void log()}
      >
        Log it
      </SuccessButton>
      <button type="button" className="setup-pick-own" disabled={busy} onClick={onSkip}>
        Skip for now
      </button>
    </div>
  )
}
