'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence } from 'motion/react'
import { CaretDownIcon, CaretRightIcon, CheckIcon, PlusIcon } from '@/src/components/icons'
import { createBudget, switchBudget, type BudgetSummary } from '../api/spaces'
import { HttpError } from '../api/client'
import { useSpaces } from '../hooks/useSpaces'
import { useCurrency } from '@/src/context/CurrencyContext'
import { currencyInfo } from '../lib/currencies'
import { Scrim, Sheet } from './MotionSheet'
import { CurrencyPicker } from './CurrencyPicker'
import { SuccessButton, useButtonPhase } from './SuccessButton'

/** Where "Need more?" sends you: the help page, which links to every way to reach us. */
const SUPPORT_PATH = '/account/help'

export const BUDGET_EMOJI = ['🏠', '✈️', '👨‍👩‍👧', '💼', '🎓', '🐾', '🚗', '🎉', '💍', '🏖️', '🛠️', '💰']

/**
 * The top bar's "<emoji> <name> ▾" chip. Renders nothing until there are two
 * budgets, so a one-budget account looks exactly as before. `labelClassName`
 * lets the sidebar fold the name away in its collapsed rail.
 */
export function BudgetSwitcher({ className = '', labelClassName = '', onOpen }: { className?: string; labelClassName?: string; onOpen?: () => void }) {
  const { multi, active } = useSpaces()
  const [open, setOpen] = useState(false)
  if (!multi || !active) return null
  return (
    <>
      <button
        type="button"
        className={`budget-chip ${className}`.trim()}
        aria-haspopup="dialog"
        aria-label={`Budget: ${active.name}. Switch budget`}
        onClick={() => { onOpen?.(); setOpen(true) }}
      >
        <span aria-hidden="true">{active.emoji}</span>
        <span className={`budget-chip-name ${labelClassName}`.trim()}>{active.name}</span>
        <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
      </button>
      <AnimatePresence>{open && <BudgetSheet onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}

function BudgetSheet({ onClose }: { onClose: () => void }) {
  const { budgets, active, count, limit, atLimit } = useSpaces()
  const [creating, setCreating] = useState(false)
  if (creating) return <CreateBudgetDialog onClose={onClose} />
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card budget-sheet" role="dialog" aria-modal="true" aria-label="Your budgets" onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>Your budgets</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul className="budget-list">
          {budgets.map((b) => {
            const current = b.id === active?.id
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={`budget-row${current ? ' is-active' : ''}`}
                  aria-current={current || undefined}
                  onClick={() => (current ? onClose() : switchBudget(b))}
                >
                  <span className="budget-row-emoji" aria-hidden="true">{b.emoji}</span>
                  <span className="budget-row-name">{b.name}</span>
                  {b.role === 'owner' && <span className="budget-owner-badge">Owner</span>}
                  <Avatars members={b.members} />
                  <span className="budget-row-check">{current && <CheckIcon size={16} weight="bold" aria-label="Current budget" />}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="budget-count">{`${count} of ${limit} budgets`}</p>
        {atLimit ? (
          <p className="budget-limit">
            {"That's the most you can have. Need more? "}
            <Link href={SUPPORT_PATH} onClick={onClose}>Contact us</Link>
          </p>
        ) : (
          <button type="button" className="budget-row budget-new" onClick={() => setCreating(true)}>
            <span className="budget-row-emoji" aria-hidden="true"><PlusIcon size={16} weight="bold" /></span>
            <span className="budget-row-name">New budget</span>
          </button>
        )}
      </Sheet>
    </Scrim>
  )
}

function Avatars({ members }: { members: BudgetSummary['members'] }) {
  return (
    <span className="budget-avatars" aria-hidden="true">
      {members.slice(0, 3).map((m) =>
        m.avatarUrl ? (
          <Image key={m.userId} className="budget-avatar" src={m.avatarUrl} alt="" width={20} height={20} unoptimized />
        ) : (
          <span key={m.userId} className="budget-avatar">{(m.name ?? '?').charAt(0).toUpperCase()}</span>
        ),
      )}
    </span>
  )
}

/** "Logging to 🏠 Home" in a sheet that writes to the active budget. Nothing with one budget. */
export function BudgetLine({ verb = 'Logging to' }: { verb?: string }) {
  const { multi, active } = useSpaces()
  if (!multi || !active) return null
  return <p className="budget-line">{`${verb} ${active.emoji} ${active.name}`}</p>
}

/** Account page's "New budget" row: the one entry point a one-budget account sees. */
export function NewBudgetEntry({ render }: { render: (open: () => void) => React.ReactNode }) {
  const { canCreate, atLimit } = useSpaces()
  const [open, setOpen] = useState(false)
  if (!canCreate || atLimit) return null
  return (
    <>
      {render(() => setOpen(true))}
      <AnimatePresence>{open && <CreateBudgetDialog onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}

function createError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 409) return "You've hit your budget limit. Need more? Contact us from Help & feedback."
    if (err.status === 402) return 'A new budget needs an active plan.'
    if (err.status === 400) return 'Give it a name and pick an emoji.'
  }
  return 'Check your connection and try again.'
}

export function CreateBudgetDialog({ onClose }: { onClose: () => void }) {
  const { active } = useSpaces()
  const { currencyCode: current } = useCurrency()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(BUDGET_EMOJI[0])
  const [currencyCode, setCurrencyCode] = useState<string>(current)
  const [pickCurrency, setPickCurrency] = useState(false)
  const [copyCategories, setCopyCategories] = useState(true)
  const [error, setError] = useState('')
  const button = useButtonPhase()
  const busy = button.saving || button.success
  const currency = currencyInfo(currencyCode)
  const from = active?.name ?? 'this budget'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setError('')
    button.start()
    try {
      const budget = await createBudget({ name: name.trim(), emoji, currencyCode, copyCategories })
      button.succeed(() => switchBudget(budget))
    } catch (err) {
      setError(createError(err))
      button.fail()
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card budget-create" role="dialog" aria-modal="true" aria-label="New budget" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="erd-modal-head">
            <h3>New budget</h3>
            <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
          </div>
          <p className="account-row-meta">A trip, a household, a side hustle. Each one keeps its own money and categories.</p>

          <label className="erd-log-label" htmlFor="budget-name" style={{ display: 'block' }}>Name</label>
          <input
            id="budget-name"
            className="erd-log-input"
            style={{ marginTop: 0 }}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home, Goa trip, Studio…"
            autoFocus
          />

          <div className="erd-log-label">Emoji</div>
          <div className="budget-emoji-grid" role="radiogroup" aria-label="Emoji">
            {BUDGET_EMOJI.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={emoji === e} className={`budget-emoji${emoji === e ? ' is-selected' : ''}`} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>

          <div className="erd-log-label">Currency</div>
          {pickCurrency ? (
            <CurrencyPicker value={currencyCode} onChange={(code) => { setCurrencyCode(code); setPickCurrency(false) }} />
          ) : (
            <button type="button" className="account-row budget-currency" onClick={() => setPickCurrency(true)}>
              <span className="account-row-label">{currency.name}</span>
              <span className="account-chip">
                {currency.code}{currency.symbol !== currency.code ? ` · ${currency.symbol}` : ''}
                <CaretRightIcon size={14} aria-hidden="true" />
              </span>
            </button>
          )}

          <label className="account-row budget-copy">
            <span className="account-row-label">
              {`Copy categories from ${from}`}
              <span className="account-row-hint">Just the categories. None of the money comes along.</span>
            </span>
            <input type="checkbox" role="switch" className="account-switch" checked={copyCategories} onChange={(e) => setCopyCategories(e.target.checked)} />
          </label>

          {error && <p className="erd-log-error" role="alert">{error}</p>}

          <div className="archive-confirm-actions">
            <button type="button" className="account-pill-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <SuccessButton
              type="submit"
              className="is-active erd-accent-action"
              saving={button.saving}
              success={button.success}
              savingLabel="Creating…"
              successLabel="Created"
              disabled={!name.trim() || busy}
            >
              Create budget
            </SuccessButton>
          </div>
        </form>
      </Sheet>
    </Scrim>
  )
}
