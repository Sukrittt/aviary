'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AmountText, popIn, staggerDelay } from '../components/landing/mobile/kit'
import { AllocationBar, type AllocationSegment } from '../components/charts/AllocationBar'
import { LoadingCaption } from '../components/LoadingCaption'
import { RecurringSuggestions } from '../components/RecurringSuggestions'
import { RecurringExpenseModal } from '../components/RecurringExpenseModal'
import { useRecurringExpenses } from '../hooks/useRecurringExpenses'
import { useHideAmounts } from '../hooks/useHideAmounts'
import { toISTDateString } from '../lib/date'
import { splitEmoji } from '../lib/emoji'
import { formatDateShort } from '../lib/format'
import { CHART_COLORS } from '../theme/chartColors'
import type { RecurringExpenseRow } from '../types'
import { BirdEmptyState } from '../components/BirdEmptyState'

const CADENCE_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
}

/** Rough monthly cost, only for the hero total and allocation bar. Twin of Mobile's account/recurring.tsx. */
export function monthlyEquivalent(row: RecurringExpenseRow): number {
  const amount = Number(row.amount_inr) || 0
  switch (row.frequency) {
    case 'daily':
      return amount * 30
    case 'weekly':
      return (amount * 52) / 12
    case 'yearly':
      return amount / 12
    default:
      return amount
  }
}

/** Same IST date-string compare as Mobile, no Intl. */
export function dueLabel(nextRunDate: string): string {
  if (!nextRunDate) return 'Not scheduled'
  const today = new Date()
  if (nextRunDate === toISTDateString(today)) return 'Due today'
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (nextRunDate === toISTDateString(tomorrow)) return 'Due tomorrow'
  return `Next on ${formatDateShort(nextRunDate)}`
}

/**
 * `/account/recurring`. `next_run_date` is rendered exactly as the server sent
 * it, with no local due-date math: one schedule owner, and it's the server.
 */
export function RecurringPage() {
  const { formatCurrency } = useCurrency()

  const recurringQ = useRecurringExpenses()
  const [hideAmounts] = useHideAmounts()
  // undefined: closed. '': adding. An id: editing that row.
  const [editing, setEditing] = useState<string | undefined>(undefined)

  const rows = recurringQ.data ?? []
  const loading = recurringQ.isLoading
  const loadError = recurringQ.isError
  const active = rows.filter((r) => r.status === 'active')
  const inactive = rows.filter((r) => r.status !== 'active')
  const monthlyTotal = active.reduce((sum, r) => sum + monthlyEquivalent(r), 0)

  const byCategory = new Map<string, number>()
  for (const r of active) {
    const cat = splitEmoji(r.category).text || r.category
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + monthlyEquivalent(r))
  }
  const segments: AllocationSegment[] = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
  const categoryColor = new Map(segments.map((s) => [s.label, s.color]))

  // `offset` continues the stagger across sections, as Mobile's row index does.
  function section(title: string, list: RecurringExpenseRow[], offset: number) {
    if (list.length === 0) return null
    return (
      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          {title}
        </div>
        <ul className="account-card recurring-list" aria-label={title}>
          {list.map((row, i) => {
            const isActive = row.status === 'active'
            const category = splitEmoji(row.category)
            return (
              <motion.li key={row.id} {...popIn(staggerDelay(offset + i))}>
                <button type="button" className="account-row" onClick={() => setEditing(row.id)}>
                  <span
                    className="recurring-dot"
                    style={{
                      background: categoryColor.get(category.text || row.category) ?? 'var(--erd-text3)',
                      opacity: isActive ? 1 : 0.5,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="account-row-label recurring-title">{row.item}</span>
                    <span className="account-row-meta recurring-meta">
                      <span className="recurring-pill">{CADENCE_LABELS[row.frequency] ?? row.frequency}</span>
                      {category.text ? ` · ${category.text}` : ''}
                    </span>
                    <span className={`account-row-meta ${isActive && row.next_run_date ? 'recurring-due' : ''}`}>
                      {row.status === 'ended' ? 'Finished' : !isActive ? 'Paused' : dueLabel(row.next_run_date)}
                    </span>
                  </span>
                  <strong style={{ opacity: isActive ? 1 : 0.5 }}>
                    {formatCurrency(Number(row.amount_inr) || 0, hideAmounts)}
                  </strong>
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
          <div className="account-section-label">Recurring</div>
          <div className="account-row-meta" style={{ padding: '2px 4px 0' }}>
            {active.length === 0 ? 'Nothing repeating yet' : `${active.length} active`}
          </div>
        </div>
        <button type="button" className="account-compact-btn" onClick={() => setEditing('')}>
          + Add
        </button>
      </div>

      <RecurringSuggestions />

      {loading ? (
        <LoadingCaption feature="recurring" placement="page" />
      ) : loadError ? (
        <div className="account-empty">
          <p className="account-row-meta">Couldn&apos;t load your recurring expenses. Check your connection and try again.</p>
        </div>
      ) : rows.length === 0 ? (
        <BirdEmptyState
          subject="recurring"
          title="Set it once, forget it"
          description="Rent, the gym, your maid. Add it here and we’ll log it for you on every due date."
          action={{ label: 'Add a recurring expense', onClick: () => setEditing('') }}
        />
      ) : (
        <>
          <div className="account-card recurring-hero">
            <div className="account-section-label">Committed each month</div>
            <div className="recurring-hero-amount">
              {hideAmounts ? formatCurrency(monthlyTotal, true) : <AmountText value={monthlyTotal} animate />}
            </div>
            {segments.length > 0 && <AllocationBar segments={segments} />}
          </div>
          {section('Active', active, 0)}
          {section('Paused and finished', inactive, active.length)}
        </>
      )}

      <AnimatePresence>
        {editing !== undefined && (
          <RecurringExpenseModal id={editing || undefined} onClose={() => setEditing(undefined)} />
        )}
      </AnimatePresence>
    </>
  )
}
