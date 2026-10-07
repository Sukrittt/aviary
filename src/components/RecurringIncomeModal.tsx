'use client'

import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'
import { Scrim, Sheet } from './MotionSheet'
import { DatePicker } from './DatePicker'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { AccountChips } from './AccountChips'
import { liveAccounts, useAccounts } from '../hooks/useAccounts'
import {
  useAddRecurringIncome,
  useDeleteRecurringIncome,
  useRecurringIncomes,
  useUpdateRecurringIncome,
} from '../hooks/useIncomes'
import { todayIST } from '../lib/date'

const FREQUENCIES = ['weekly', 'monthly', 'yearly', 'daily']
const RETRY = 'Check your connection and try again.'

interface Props {
  /** Present: edit that schedule. Absent: add one. */
  id?: string
  /** Prefills a new schedule, e.g. "Monthly income" from Home's Change income. */
  initial?: { label?: string; amount?: string; frequency?: string }
  onClose: () => void
}

/** Twin of Mobile's modals/recurring-income.tsx: a salary, a weekly gig, a yearly bonus. */
export function RecurringIncomeModal({ id, initial, onClose }: Props) {
  const { currencySymbol } = useCurrency()
  const recurringQ = useRecurringIncomes()
  const accounts = liveAccounts(useAccounts().data)
  const add = useAddRecurringIncome()
  const update = useUpdateRecurringIncome()
  const remove = useDeleteRecurringIncome()
  const existing = id ? recurringQ.data?.find((r) => r.id === id) : undefined
  const isEdit = id !== undefined
  const isActive = existing ? existing.status === 'active' : true

  const [label, setLabel] = useState(existing?.label ?? initial?.label ?? '')
  const [amount, setAmount] = useState(existing?.amount ?? initial?.amount ?? '')
  const [frequency, setFrequency] = useState(existing?.frequency || initial?.frequency || 'monthly')
  const [payday, setPayday] = useState(existing?.start_date || todayIST())
  const [endDate, setEndDate] = useState(existing?.end_date ?? '')
  const [accountId, setAccountId] = useState(existing?.account_id ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const { saving, success, start, succeed, fail } = useButtonPhase()

  const parsed = Number(amount)
  const endsBeforeStart = endDate !== '' && endDate < payday
  const canSubmit = label.trim() !== '' && parsed > 0 && payday !== '' && !endsBeforeStart
  const busy = saving || success || remove.isPending || update.isPending

  async function submit() {
    if (!canSubmit || busy) return
    const fields = { label: label.trim(), amount: String(parsed), frequency, start_date: payday, end_date: endDate, account_id: accountId }
    setError('')
    start()
    try {
      if (id) await update.mutateAsync({ id, updates: fields })
      else await add.mutateAsync(fields)
      succeed(onClose)
    } catch {
      fail()
      setError(`${isEdit ? "Couldn't save" : "Couldn't add this"}. ${RETRY}`)
    }
  }

  async function runAction(action: 'toggle' | 'delete') {
    if (!existing || busy) return
    setError('')
    try {
      if (action === 'delete') await remove.mutateAsync(existing.id)
      else await update.mutateAsync({ id: existing.id, updates: { status: isActive ? 'paused' : 'active' } })
      setConfirmingDelete(false)
      succeed(onClose)
    } catch {
      setConfirmingDelete(false)
      fail()
      setError(`${action === 'delete' ? "Couldn't delete this" : "Couldn't update this"}. ${RETRY}`)
    }
  }

  const hint =
    frequency === 'monthly'
      ? "Counts toward Ready to Assign from the 1st of every month. We'll record it on payday."
      : 'Lands in Ready to Assign on every payday.'

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card erd-recurring-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit income' : 'New income'}>
        <div className="erd-modal-head">
          <h3>{isEdit ? 'Edit income' : 'New income'}</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={success}>
            ✕
          </button>
        </div>

        <div className="erd-recurring-body">
          <div className="erd-recurring-grid">
            <section className="erd-recurring-section">
              <label className="erd-log-label" htmlFor="income-label">What is it</label>
              <input id="income-label" className="erd-log-input" placeholder="e.g. Salary" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={!isEdit} />
            </section>

            <section className="erd-recurring-section">
              <label className="erd-log-label" htmlFor="income-amount">Amount ({currencySymbol})</label>
              <input id="income-amount" className="erd-log-input" type="number" min={0} step="any" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </section>

            <section className="erd-recurring-section">
              <div className="erd-log-label">How often</div>
              <div className="erd-chip-row">
                {FREQUENCIES.map((f) => (
                  <button key={f} type="button" className={`erd-chip ${frequency === f ? 'is-selected' : ''}`} aria-pressed={frequency === f} onClick={() => setFrequency(f)} style={{ textTransform: 'capitalize' }}>
                    {f}
                  </button>
                ))}
              </div>
            </section>

            <section className="erd-recurring-section">
              <div className="erd-log-label">{isEdit ? 'Payday' : 'Next payday'}</div>
              <DatePicker mode="single" value={payday} onChange={setPayday} disableFuture={false} popoverOnDesktop />
            </section>

            <section className="erd-recurring-section">
              <div className="erd-log-label recurring-label-row">
                <span>Ends (optional)</span>
                {endDate && (
                  <button type="button" className="scan-link-btn" onClick={() => setEndDate('')}>Clear</button>
                )}
              </div>
              <DatePicker mode="single" value={endDate} onChange={setEndDate} disableFuture={false} popoverOnDesktop />
              {endsBeforeStart && <p className="erd-log-error">The end date can&apos;t be before payday.</p>}
            </section>

            {accounts.length > 0 && (
              <section className="erd-recurring-section">
                <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} allowNone label="Paid into" />
              </section>
            )}

            <section className="erd-recurring-section erd-recurring-span">
              <p className="recurring-hint">{hint}</p>
            </section>
          </div>

          {error && <p className="erd-log-error">{error}</p>}
        </div>

        <div className="erd-recurring-footer">
          <SuccessButton type="button" baseClass="erd-log-submit" saving={saving} success={success} successLabel="Saved" disabled={!canSubmit || busy} onClick={submit}>
            {isEdit ? 'Save changes' : 'Add income'}
          </SuccessButton>

          {existing && !success && (
            <div className="recurring-danger-zone">
              {confirmingDelete ? (
                <div className="account-confirm-panel">
                  <div className="account-confirm-copy">Remove &quot;{existing.label}&quot;? Paydays already recorded stay put.</div>
                  <div className="account-confirm-actions">
                    <button type="button" className="account-confirm-cancel" disabled={busy} onClick={() => setConfirmingDelete(false)}>Back</button>
                    <button type="button" className="account-danger-btn" style={{ marginTop: 0 }} disabled={busy} onClick={() => runAction('delete')}>
                      {remove.isPending ? 'Working…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className={`scan-link-btn ${isActive ? 'is-coral' : 'is-mint'}`} disabled={busy} onClick={() => runAction('toggle')}>
                    {update.isPending ? 'Working…' : isActive ? 'Pause this' : 'Resume this'}
                  </button>
                  <button type="button" className="scan-link-btn" disabled={busy} onClick={() => setConfirmingDelete(true)}>Delete</button>
                </>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </Scrim>
  )
}
