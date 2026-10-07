import { ExpenseNoticeDialog } from './ExpenseNoticeDialog'
import { useQueryClient } from '@tanstack/react-query'
import { ExpenseWriteError, expenseChanges, expenseDraft, rebaseExpenseDraft } from '../lib/expenseConflict'
import type { ExpenseRow } from '../types'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useRef, useState } from 'react'
import { AccountChips } from './AccountChips'
import { liveAccounts, useAccounts } from '../hooks/useAccounts'
import { updateExpense, addExpense, deleteExpense } from '../api/expenses'
import { Scrim, Sheet } from './MotionSheet'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { DatePicker } from './DatePicker'
import { CategoryPicker } from './CategoryPicker'
import { SplitExpenseEditor, makeSplitLine, type SplitLine } from './SplitExpenseEditor'

interface Props {
  id?: string
  version?: number
  timestamp: string
  item: string
  amountInr: number
  date: string
  category: string
  /** The row's account, '' for none. */
  accountId?: string
  onClose: () => void
  onSaved: () => void
}

export function TransactionEditModal({
  id,
  version,
  timestamp,
  item: initialItem,
  amountInr,
  date: initialDate,
  category: initialCategory,
  accountId: initialAccountId = '',
  onClose,
  onSaved,
}: Props) {
  const accounts = liveAccounts(useAccounts().data)
  const [accountId, setAccountId] = useState(initialAccountId)
  const { currencySymbol } = useCurrency()

  const qc = useQueryClient()
  const [base, setBase] = useState({ item: initialItem, amount: String(amountInr), date: initialDate.slice(0, 10), category: initialCategory })
  const [expectedVersion, setExpectedVersion] = useState(version)
  const [conflict, setConflict] = useState<ExpenseRow | null>(null)
  const reviewRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (conflict) reviewRef.current?.focus() }, [conflict])
  const [deleted, setDeleted] = useState(false)
  const [showDeletedNotice, setShowDeletedNotice] = useState(false)
  const [item, setItem] = useState(initialItem)
  const [amount, setAmount] = useState(String(amountInr))
  const [date, setDate] = useState(initialDate.slice(0, 10))
  const [category, setCategory] = useState(initialCategory)
  const [isSplit, setIsSplit] = useState(false)
  const [splitLines, setSplitLines] = useState<SplitLine[]>(() => [
    makeSplitLine(initialCategory, String(amountInr)),
  ])
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const [error, setError] = useState('')

  const amt = parseFloat(amount)
  const canSave = isSplit
    ? item.trim() !== '' && date.trim() !== ''
    : item.trim() !== '' && !Number.isNaN(amt) && amt >= 0 && date.trim() !== '' && category !== ''

  function refresh() {
    for (const key of ['expenses', 'budgets', 'ai-brief', 'category-map']) void qc.invalidateQueries({ queryKey: [key] })
  }

  function reviewLatest(keepDraft: boolean) {
    if (!conflict) return
    const draft = keepDraft ? rebaseExpenseDraft(base, { item, amount, date, category }, conflict) : expenseDraft(conflict)
    setBase(expenseDraft(conflict))
    setExpectedVersion(conflict.version)
    setItem(draft.item); setAmount(draft.amount); setDate(draft.date); setCategory(draft.category)
    setConflict(null); setError('')
    if (!keepDraft) {
      setIsSplit(false)
      setSplitLines([makeSplitLine(draft.category, draft.amount)])
    }
  }

  function handleError(err: unknown) {
    if (err instanceof ExpenseWriteError) {
      if (err.status === 409 && err.current) setConflict(err.current)
      if (err.status === 404) {
        setDeleted(true); setShowDeletedNotice(true); setError(''); refresh(); fail(); return
      }
    }
    setError(err instanceof Error ? err.message : 'Failed to update transaction')
    refresh()
    fail()
  }

  async function handleSave() {
    if (!canSave || saving || success || conflict || deleted) return
    setError('')

    if (isSplit) {
      const validLines = splitLines.filter((l) => l.category && Number(l.amount) > 0)
      const allocated = validLines.reduce((s, l) => s + Number(l.amount), 0)
      if (validLines.length < 2 || Math.abs(allocated - amt) >= 0.01) {
        setError('Split lines must add up to the total amount.')
        return
      }
      start()
      try {
        await deleteExpense(id, timestamp, initialItem, amountInr, expectedVersion)
        for (let i = 0; i < validLines.length; i++) {
          const line = validLines[i]
          await addExpense({
            item: item.trim(),
            amount_inr: String(line.amount),
            category: line.category,
            date,
            notes: `Split ${i + 1}/${validLines.length} of ${amount}`,
            ...(accountId ? { account_id: accountId } : {}),
          })
        }
        refresh()
        onSaved()
        succeed(onClose)
      } catch (err) {
        handleError(err)
      }
      return
    }

    start()
    try {
      const changes = {
        ...expenseChanges(base, { item, amount, date, category }),
        ...(accountId !== initialAccountId ? { new_account_id: accountId } : {}),
      }
      if (Object.keys(changes).length) {
        await updateExpense(id, timestamp, initialItem, amountInr, changes, expectedVersion)
      }
      refresh()
      onSaved()
      succeed(onClose)
    } catch (err) {
      handleError(err)
    }
  }

  const merged = conflict ? rebaseExpenseDraft(base, { item, amount, date, category }, conflict) : null
  const reviewRows = conflict && merged ? [
    { label: 'Description', saved: conflict.item, next: merged.item, changed: conflict.item !== base.item || item.trim() !== base.item },
    { label: 'Amount', saved: `${currencySymbol}${Number(conflict.amount_inr).toLocaleString()}`, next: `${currencySymbol}${Number(merged.amount).toLocaleString()}`, changed: Number(conflict.amount_inr) !== Number(base.amount) || Number(amount) !== Number(base.amount) },
    { label: 'Date', saved: conflict.date.slice(0, 10), next: merged.date, changed: conflict.date.slice(0, 10) !== base.date || date !== base.date },
    { label: 'Category', saved: conflict.category, next: merged.category, changed: conflict.category !== base.category || category !== base.category },
  ].filter((row) => row.changed) : []

  return (
    <Scrim
      className="category-manager-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {showDeletedNotice && <ExpenseNoticeDialog status={404} action="edit" onBack={() => setShowDeletedNotice(false)} />}
      <Sheet className="category-manager subscription-modal">
        <div className="category-manager-header">
          <h3>Edit transaction</h3>
          <button type="button" className="action-button is-ghost" onClick={onClose} aria-label="Close" disabled={success}>
            ✕
          </button>
        </div>

        {error && !conflict && <p className="txn-entry-error">{error}</p>}
        {conflict && (
          <div className="txn-review" ref={reviewRef} tabIndex={-1} role="region" aria-labelledby="txn-review-title">
            <span className="txn-review-icon" aria-hidden="true">↻</span>
            <h4 id="txn-review-title">This transaction was updated</h4>
            <p className="txn-review-intro">A newer version was saved elsewhere. Your edits are still here.</p>
            {reviewRows.length > 0 && (
              <div className="txn-review-comparison">
                <div className="txn-review-columns" aria-hidden="true"><span>Latest saved</span><span>With your changes</span></div>
                {reviewRows.map((row) => (
                  <div className="txn-review-row" key={row.label}>
                    <div className="txn-review-label">{row.label}</div>
                    <div className="txn-review-values">
                      <span><span className="txn-review-sr-only">Latest saved: </span>{row.saved}</span>
                      <span className={row.saved !== row.next ? 'txn-review-changed' : ''}><span className="txn-review-sr-only">With your changes: </span>{row.next}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="txn-review-note">Continue with your edits and keep other updates. You can review everything before saving.</p>
            <div className="txn-review-actions">
              <button type="button" className="txn-review-primary" onClick={() => reviewLatest(true)}>Continue with my changes <span aria-hidden="true">→</span></button>
              <button type="button" className="txn-review-secondary" onClick={() => reviewLatest(false)}>Use latest instead</button>
            </div>
            <p className="txn-review-footnote">Nothing will be saved until you confirm.</p>
          </div>
        )}

        {!conflict && <>
        <div className="category-manager-body">
          <div className="subscription-modal-form">
            <label className="subscription-modal-field">
              <span>Description</span>
              <input
                type="text"
                className="txn-entry-input"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="What was this for?"
                autoFocus
              />
            </label>

            <label className="subscription-modal-field">
              <span>Amount ({currencySymbol})</span>
              <input
                type="number"
                step="any"
                min="0"
                className="txn-entry-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isSplit}
              />
            </label>

            <label className="subscription-modal-field">
              <span>Date</span>
              <DatePicker mode="single" value={date} onChange={setDate} />
            </label>

            {isSplit ? (
              <SplitExpenseEditor total={amt || 0} lines={splitLines} onChange={setSplitLines} />
            ) : (
              <label className="subscription-modal-field">
                <span>Category</span>
                <CategoryPicker value={category} onChange={setCategory} />
              </label>
            )}

            {accounts.length > 0 && (
              <div className="subscription-modal-field">
                <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} allowNone />
              </div>
            )}
          </div>
        </div>

        <div className="subscription-modal-actions">
          <button type="button" className="action-button is-ghost" onClick={onClose} disabled={success}>
            Cancel
          </button>
          <SuccessButton
            type="button"
            disabled={!canSave || saving || success || !!conflict || deleted}
            saving={saving}
            success={success}
            onClick={handleSave}
          >
            Save changes
          </SuccessButton>
        </div>
        </>}
      </Sheet>
    </Scrim>
  )
}
