'use client'

import { useEffect, useRef, useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import type { CaptureProposal, ProposalStatus } from '@/src/api/ai'
import { Select } from '@/src/components/Select'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import {
  canLog,
  editedCount,
  keptRows,
  rowIncomplete,
  rowShare,
  rowToExpense,
  rowTotal,
  toRows,
  CAPTURE_ORIGIN,
  type CaptureRow,
  type RowOrigin,
} from '@/src/features/capture/captureRows'
import { useCategories } from '@/src/hooks/useCategories'
import { useAddExpense, useRecentExpenses } from '@/src/hooks/useExpenses'
import { track } from '@/src/lib/analytics'
import { todayIST } from '@/src/lib/date'
import { categoryEmoji, splitEmoji } from '@/src/lib/emoji'
import { formatDateShort } from '@/src/lib/format'
import { unusualAmount } from '@/src/lib/unusualAmount'

interface Props {
  proposal: CaptureProposal
  /**
   * Called once the user logged or dismissed the card, with the ids of the
   * expenses it became. The drawer records it on the chat so a reopened chat
   * shows it read-only; best effort, since client_ids already stop a second log.
   */
  onSettled?: (status: Exclude<ProposalStatus, 'pending'>, expenseIds: string[]) => void
  /** Money-brain rows by default; a balance check's estimates log as `balance_gap`. */
  origin?: RowOrigin
}

function secondsSince(startedAt: number): number {
  return Math.round((Date.now() - startedAt) / 1000)
}

/** Why Log is disabled, naming the one thing to fix when there's only one. Null when nothing blocks it. */
function blockerHint(kept: CaptureRow[]): string | null {
  const fixes = kept.flatMap((row) => {
    const name = row.item.trim()
    const out: string[] = []
    if (!name) out.push('Name each spend')
    if (Number.isNaN(rowTotal(row))) out.push(name ? `Fix the amount for ${name}` : 'Fix the amounts')
    if (!row.category) out.push(name ? `Pick an envelope for ${name}` : 'Pick an envelope for each spend')
    return out
  })
  if (fixes.length === 0) return null
  return `${fixes.length === 1 ? fixes[0] : 'Fix the highlighted spends'} to log these.`
}

function spendsLabel(n: number): string {
  return `${n} ${n === 1 ? 'spend' : 'spends'}`
}

/**
 * The review card under an Ask Aviary reply to "auto 240, lunch 150, turf
 * 1200 split 6", and under a balance check's estimates. Nothing is logged
 * until the user presses Log: rows can be renamed, re-priced, moved to
 * another envelope or removed first. Each row is logged through the normal
 * add-expense path with a client_id fixed by the proposal, so logging a card
 * twice can't double it. Twin of Mobile's src/components/brain/CaptureReview.tsx.
 */
export function CaptureReview({ proposal, onSettled, origin = CAPTURE_ORIGIN }: Props) {
  const { formatMoney, currencyPrefix } = useCurrency()
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const addExpense = useAddExpense()
  const button = useButtonPhase()

  const [status, setStatus] = useState<ProposalStatus>(proposal.status ?? 'pending')
  const [rows, setRows] = useState<CaptureRow[]>(() => toRows(proposal))
  const [error, setError] = useState('')
  // Rows already logged by an earlier attempt that partly failed. They leave the card, and a retry skips them.
  const [loggedRows, setLoggedRows] = useState<ReadonlySet<string>>(new Set())
  // Rows whose last attempt failed. They're locked to retry as they are: the server may have saved one
  // whose response was lost, and a retry reuses its client_id, so an edit would never reach that expense.
  const [failedRows, setFailedRows] = useState<ReadonlySet<string>>(new Set())
  const [summary, setSummary] = useState<{ count: number; total: number | null }>({
    count: proposal.expenseIds?.length || proposal.items.length,
    total: null,
  })
  const expenseIds = useRef<string[]>([])
  const shownAt = useRef(0)
  const today = todayIST()

  // Once the envelope list loads, a row whose envelope is gone (deleted since it was read) has none:
  // logging it would file the spend under a name that no longer exists.
  const known = categoriesQ.data ? new Set(categoriesQ.data.map((c) => c.name)) : null
  const open = rows
    .filter((r) => !loggedRows.has(r.id))
    .map((r) => (known && r.category && !known.has(r.category) ? { ...r, category: '' } : r))
  const kept = keptRows(open)
  const busy = button.saving || button.success
  const ready = canLog(open)
  // Names usually carry their emoji already ("🍜 Eating out"): show it once, as the icon.
  const toOption = (name: string, group?: string) => {
    const { icon, text } = splitEmoji(name)
    return { value: name, label: text, icon: icon || categoryEmoji(name, group) }
  }
  const categoryOptions = (categoriesQ.data ?? []).map((c) => toOption(c.name, c.group))
  // A row's envelope shows while the list is still loading.
  if (!known) for (const name of new Set(rows.map((r) => r.category))) if (name) categoryOptions.push(toOption(name))
  const hint = blockerHint(kept)

  useEffect(() => {
    shownAt.current = Date.now()
  }, [])

  function update(id: string, patch: Partial<CaptureRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setError('')
  }

  async function submit() {
    if (!ready || busy) return
    button.start()
    setError('')
    const toLog = kept
    const done = new Set(loggedRows)
    const failedIds = new Set<string>()
    let failed = 0
    // One at a time, in the order they were said, so their timestamps keep that order in Activity.
    for (const row of toLog) {
      try {
        const result = await addExpense.mutateAsync(rowToExpense(proposal.id, row, formatMoney, origin))
        if (result.id) expenseIds.current.push(result.id)
        done.add(row.id)
      } catch {
        failed++
        failedIds.add(row.id)
      }
    }
    setLoggedRows(done)
    setFailedRows(failedIds)

    if (failed > 0) {
      // The rows that made it leave the card; the rest stay editable. A retry reuses their client_ids.
      setError(`Couldn't log ${failed === toLog.length ? 'these' : spendsLabel(failed)}. Check your connection and try again.`)
      button.fail()
      return
    }

    const loggedAll = rows.filter((r) => done.has(r.id))
    setSummary({ count: loggedAll.length, total: loggedAll.reduce((sum, r) => sum + rowShare(r), 0) })
    track('capture_logged', {
      source: origin.source,
      rows: loggedAll.length,
      edited: editedCount(rows, proposal),
      removed: proposal.items.length - loggedAll.length,
      seconds: secondsSince(shownAt.current),
    })
    onSettled?.('submitted', expenseIds.current)
    button.succeed(() => setStatus('submitted'))
  }

  function dismiss() {
    if (busy) return
    track('capture_dismissed', { source: origin.source, rows: proposal.items.length, logged: loggedRows.size })
    if (loggedRows.size > 0) {
      // Some rows made it before a failure: the card is a record of those, not "Not logged".
      const logged = rows.filter((r) => loggedRows.has(r.id))
      setSummary({ count: logged.length, total: logged.reduce((sum, r) => sum + rowShare(r), 0) })
      setStatus('submitted')
      onSettled?.('submitted', expenseIds.current)
      return
    }
    setStatus('dismissed')
    onSettled?.('dismissed', [])
  }

  if (status !== 'pending') {
    return (
      <div className={`capture-summary${status === 'submitted' ? ' is-logged' : ''}`} data-testid="capture-summary">
        {status === 'submitted'
          ? `Logged ${spendsLabel(summary.count)}${summary.total !== null ? ` · ${formatMoney(summary.total)}` : ''}`
          : 'Not logged'}
      </div>
    )
  }

  return (
    <div className="capture-review" data-testid="capture-review">
      {kept.map((row) => {
        const total = rowTotal(row)
        const share = rowShare(row)
        const locked = failedRows.has(row.id)
        const unusual = !Number.isNaN(share) && row.category ? unusualAmount(share, row.category, expensesQ.data ?? [], today) : null
        const icon = row.category ? splitEmoji(row.category).icon || categoryEmoji(row.category) : '❔'
        return (
          <div key={row.id} className={`capture-row${rowIncomplete(row) ? ' is-incomplete' : ''}`} data-testid={`capture-row-${row.id}`}>
            <span className="capture-icon" aria-hidden="true">{icon}</span>
            <div className="capture-main">
              <input
                className="capture-item"
                value={row.item}
                onChange={(e) => update(row.id, { item: e.target.value })}
                disabled={busy || locked}
                aria-label="What you paid for"
                placeholder="What was it?"
              />
              <div className="capture-row-meta">
                <Select
                  className={`capture-envelope${row.category ? '' : ' is-empty'}`}
                  value={row.category}
                  onChange={(category) => update(row.id, { category })}
                  options={categoryOptions}
                  placeholder="Pick an envelope"
                  aria-label={row.category ? `Envelope: ${row.category}. Change it` : 'Pick an envelope'}
                  disabled={busy || locked}
                  searchable
                />
                {row.splitWays > 1 && !Number.isNaN(total) && <small>{`${formatMoney(total)} ÷ ${row.splitWays}`}</small>}
                {row.date !== today && <small>{formatDateShort(row.date)}</small>}
              </div>
              {unusual && (
                <p className="capture-unusual">
                  <TriangleAlert size={12} aria-hidden="true" />
                  {`Way above your usual ${formatMoney(Math.round(unusual.typical))}. Double-check it.`}
                </p>
              )}
            </div>
            <div className="capture-money">
              <label className={`capture-amount${Number.isNaN(total) ? ' is-invalid' : ''}`}>
                <span aria-hidden="true">{currencyPrefix}</span>
                <input
                  value={row.amountText}
                  onChange={(e) => update(row.id, { amountText: e.target.value.replace(/[^\d.]/g, '') })}
                  disabled={busy || locked}
                  inputMode="decimal"
                  // 1 crore with paise: the server's cap, and all the field can show.
                  maxLength={11}
                  aria-label={`Amount for ${row.item || 'this spend'}`}
                  // Sized to its digits so the currency sign sits right against them.
                  style={{ width: `${Math.max(row.amountText.length, 1) + 0.2}ch` }}
                />
              </label>
              {row.splitWays > 1 && !Number.isNaN(share) && <small>{`your share ${formatMoney(share)}`}</small>}
            </div>
            <button
              type="button"
              className="capture-remove"
              onClick={() => update(row.id, { removed: true })}
              disabled={busy || locked}
              aria-label={`Remove ${row.item || 'this spend'}`}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}

      {hint && <p className="capture-hint">{hint}</p>}

      {error !== '' && <p className="capture-error" role="alert">{error}</p>}

      <div className="capture-actions">
        <button type="button" className="action-button is-ghost" onClick={dismiss} disabled={busy}>
          Not now
        </button>
        <SuccessButton
          type="button"
          className="is-active erd-accent-action"
          saving={button.saving}
          success={button.success}
          savingLabel="Logging…"
          successLabel="Logged"
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {kept.length ? `Log ${spendsLabel(kept.length)}` : 'Nothing to log'}
        </SuccessButton>
      </div>
    </div>
  )
}
