'use client'

import { useCurrency } from '@/src/context/CurrencyContext'
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AmountText, popIn, staggerDelay } from '../components/landing/mobile/kit'
import { LoadingCaption } from '../components/LoadingCaption'
import { BirdEmptyState } from '../components/BirdEmptyState'
import { RecurringIncomeModal } from '../components/RecurringIncomeModal'
import { AddIncomeScreen } from '../components/MoneyScreens'
import { accountName } from '../components/AccountChips'
import { useDeleteIncome, useIncomes, useRecurringIncomes } from '../hooks/useIncomes'
import { useAccounts } from '../hooks/useAccounts'
import { useHideAmounts } from '../hooks/useHideAmounts'
import { formatDateShort } from '../lib/format'
import { currentMonthKey, monthLabel } from '../lib/envelope'
import { dueLabel, monthlyAmount } from './RecurringPage'
import type { IncomeRow, RecurringIncomeRow } from '../types'

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Added by you',
  recurring: 'Payday',
  balance_gap: 'From your balance check',
}

/** Same wording as recurring expenses, but it's money arriving. */
function payLabel(row: RecurringIncomeRow): string {
  if (row.status === 'ended') return 'Finished'
  if (row.status !== 'active') return 'Paused'
  return dueLabel(row.next_run_date).replace('Due', 'Pay').replace('Next on', 'Next pay on')
}

/**
 * `/account/income`: what comes in. Recurring income (a salary, a weekly gig)
 * on top, and every payment recorded this month below. Twin of Mobile's
 * app/account/income.tsx. Ready to Assign math lives on the server
 * (Web/lib/income.ts); this page only reads and writes through it.
 */
export function IncomePage() {
  const { formatCurrency } = useCurrency()
  const [hideAmounts] = useHideAmounts()
  const recurringQ = useRecurringIncomes()
  const incomesQ = useIncomes()
  const accounts = useAccounts().data
  const removeIncome = useDeleteIncome()
  // undefined: closed. '': adding. An id: editing that schedule.
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [addingOneOff, setAddingOneOff] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  const month = currentMonthKey()
  const schedules = recurringQ.data ?? []
  const active = schedules.filter((r) => r.status === 'active')
  const inactive = schedules.filter((r) => r.status !== 'active')
  const thisMonth = (incomesQ.data ?? []).filter((r) => r.date.startsWith(month))
  const monthlyTotal = active.reduce((sum, r) => sum + monthlyAmount(Number(r.amount) || 0, r.frequency), 0)
  const receivedTotal = thisMonth.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const loading = recurringQ.isLoading || incomesQ.isLoading
  const loadError = recurringQ.isError || incomesQ.isError

  async function remove(row: IncomeRow) {
    setError('')
    try {
      await removeIncome.mutateAsync({ id: row.id, version: row.version })
      setConfirmDelete(null)
    } catch {
      setConfirmDelete(null)
      setError("Couldn't delete that. Check your connection and try again.")
    }
  }

  function scheduleSection(title: string, list: RecurringIncomeRow[], offset: number) {
    if (list.length === 0) return null
    return (
      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>{title}</div>
        <ul className="account-card recurring-list" aria-label={title}>
          {list.map((row, i) => {
            const isActive = row.status === 'active'
            const account = accountName(accounts, row.account_id)
            return (
              <motion.li key={row.id} {...popIn(staggerDelay(offset + i))}>
                <button type="button" className="account-row" onClick={() => setEditing(row.id)}>
                  <span className="recurring-dot" style={{ background: 'var(--mint)', opacity: isActive ? 1 : 0.5 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="account-row-label recurring-title">{row.label}</span>
                    <span className="account-row-meta recurring-meta">
                      <span className="recurring-pill">{CADENCE_LABELS[row.frequency] ?? row.frequency}</span>
                      {account ? ` · ${account}` : ''}
                    </span>
                    <span className={`account-row-meta ${isActive && row.next_run_date ? 'recurring-due' : ''}`}>{payLabel(row)}</span>
                  </span>
                  <strong style={{ opacity: isActive ? 1 : 0.5 }}>{formatCurrency(Number(row.amount) || 0, hideAmounts)}</strong>
                </button>
              </motion.li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <>
      <div className="account-page-heading">
        <div>
          <div className="account-section-label">Income</div>
          <div className="account-row-meta" style={{ padding: '2px 4px 0' }}>
            {active.length === 0 ? 'Nothing coming in on repeat yet' : `${active.length} coming in on repeat`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="account-compact-btn" onClick={() => setAddingOneOff(true)}>+ One-off</button>
          <button type="button" className="account-compact-btn" onClick={() => setEditing('')}>+ Recurring</button>
        </div>
      </div>

      {loading ? (
        <LoadingCaption placement="page" />
      ) : loadError ? (
        <div className="account-empty">
          <p className="account-row-meta">Couldn&apos;t load your income. Check your connection and try again.</p>
        </div>
      ) : schedules.length === 0 && thisMonth.length === 0 ? (
        <BirdEmptyState
          subject="recurring"
          title="What comes in?"
          description="Add your salary once and it counts toward Ready to Assign every month. Weekly gigs land on each payday."
          action={{ label: 'Add your income', onClick: () => setEditing('') }}
        />
      ) : (
        <>
          <div className="account-card recurring-hero">
            <div className="account-section-label">Comes in each month</div>
            <div className="recurring-hero-amount">
              {hideAmounts ? formatCurrency(monthlyTotal, true) : <AmountText value={monthlyTotal} animate />}
            </div>
            <div className="account-row-meta">
              {formatCurrency(receivedTotal, hideAmounts)} recorded in {monthLabel(month)}
            </div>
          </div>
          {scheduleSection('Recurring', active, 0)}
          {scheduleSection('Paused and finished', inactive, active.length)}

          <div>
            <div className="account-section-label" style={{ marginBottom: 10 }}>{monthLabel(month)}</div>
            {thisMonth.length === 0 ? (
              <p className="account-row-meta" style={{ padding: '0 4px' }}>Nothing recorded yet this month.</p>
            ) : (
              <ul className="account-card recurring-list" aria-label={`Income in ${monthLabel(month)}`}>
                {thisMonth.map((row) => {
                  const account = accountName(accounts, row.account_id)
                  return (
                    <li key={row.id} className="account-row" style={{ cursor: 'default' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="account-row-label recurring-title">{row.label}</span>
                        <span className="account-row-meta">
                          {formatDateShort(row.date)} · {SOURCE_LABELS[row.source] ?? 'Income'}
                          {account ? ` · ${account}` : ''}
                        </span>
                      </span>
                      {confirmDelete === row.id ? (
                        <span style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="account-confirm-cancel" onClick={() => setConfirmDelete(null)} disabled={removeIncome.isPending}>Back</button>
                          <button type="button" className="account-danger-btn" style={{ marginTop: 0 }} onClick={() => remove(row)} disabled={removeIncome.isPending}>
                            {removeIncome.isPending ? 'Working…' : 'Delete'}
                          </button>
                        </span>
                      ) : (
                        <>
                          <strong style={{ color: 'var(--mint)' }}>+{formatCurrency(Number(row.amount) || 0, hideAmounts)}</strong>
                          <button type="button" className="scan-link-btn" aria-label={`Delete ${row.label}`} onClick={() => setConfirmDelete(row.id)}>Delete</button>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {confirmDelete && thisMonth.find((r) => r.id === confirmDelete)?.counted === 'monthly' && (
              <p className="recurring-hint" style={{ padding: '6px 4px 0' }}>This only removes the record. Your monthly income still counts.</p>
            )}
            {error && <p className="erd-log-error">{error}</p>}
          </div>
        </>
      )}

      <AnimatePresence>
        {editing !== undefined && <RecurringIncomeModal id={editing || undefined} onClose={() => setEditing(undefined)} />}
        {addingOneOff && <AddIncomeScreen onClose={() => setAddingOneOff(false)} />}
      </AnimatePresence>
    </>
  )
}
