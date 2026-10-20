'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { PlusIcon } from '@/src/components/icons'
import { RecurringSuggestions } from '../components/RecurringSuggestions'
import { SubscriptionModal } from '../components/SubscriptionModal'
import { SubscriptionsPanel, type SubscriptionPanelItem } from '../components/SubscriptionsPanel'
import {
  useCancelSubscription,
  useReactivateSubscription,
  useSubscriptions,
} from '../hooks/useSubscriptions'
import { useHideAmounts } from '../hooks/useHideAmounts'
import { useSpaces } from '../hooks/useSpaces'
import { ReadOnlyDialog } from '../components/BudgetNotices'
import type { SubscriptionRow } from '../types'

interface SubscriptionEdit {
  service: string
  amount_inr: string
  billing_cycle: string
  next_due_date: string
  notes: string
  category: string
}

function toPanelItem(row: SubscriptionRow): SubscriptionPanelItem {
  return {
    timestamp: row.timestamp,
    service: row.service,
    amountInr: Number(row.amount_inr) || 0,
    billingCycle: row.billing_cycle,
    nextDueDate: row.next_due_date,
    status: row.status,
    renewalOrEndMonth: row.renewal_or_end_month,
    notes: row.notes,
    category: row.category,
  }
}

export function splitSubscriptions(rows: SubscriptionRow[]) {
  const subscriptions = rows.map(toPanelItem)
  return {
    active: subscriptions.filter((row) => /^active/i.test(row.status)),
    cancelled: subscriptions.filter((row) => /cancel/i.test(row.status)),
  }
}

export function SubscriptionsPage() {
  const subscriptionsQ = useSubscriptions()
  const cancelSubscription = useCancelSubscription()
  const reactivateSubscription = useReactivateSubscription()
  const [hideAmounts] = useHideAmounts()
  const { readOnly } = useSpaces()
  const [showReadOnly, setShowReadOnly] = useState(false)
  const [busyService, setBusyService] = useState<string | null>(null)
  const [editing, setEditing] = useState<SubscriptionEdit | null | undefined>(undefined)
  const [actionError, setActionError] = useState('')

  const subscriptions = useMemo(
    () => splitSubscriptions(subscriptionsQ.data ?? []),
    [subscriptionsQ.data],
  )

  function editSubscription(sub: SubscriptionPanelItem) {
    setEditing({
      service: sub.service,
      amount_inr: String(sub.amountInr),
      billing_cycle: sub.billingCycle,
      next_due_date: sub.nextDueDate,
      notes: sub.notes,
      category: sub.category,
    })
  }

  async function changeStatus(service: string, action: 'cancel' | 'reactivate') {
    // The panel owns the Cancel/Reactivate buttons; say why instead of a 402.
    if (readOnly) {
      setShowReadOnly(true)
      return
    }
    setBusyService(service)
    setActionError('')
    try {
      if (action === 'cancel') await cancelSubscription.mutateAsync(service)
      else await reactivateSubscription.mutateAsync(service)
    } catch {
      setActionError(`Couldn’t ${action} ${service}. Check your connection and try again.`)
    } finally {
      setBusyService(null)
    }
  }

  return (
    <>
      <header className="txn-page-header account-header">
        <div className="txn-page-heading">
          <span className="txn-page-eyebrow">Paid on repeat</span>
          <h1>Subscriptions</h1>
          <p>{subscriptions.active.length === 0 ? 'Nothing active yet' : `${subscriptions.active.length} active`}</p>
        </div>
        <div className="txn-page-actions">
          {!readOnly && (
            <button type="button" className="erd-log-btn txn-page-log-btn" onClick={() => setEditing(null)} disabled={subscriptionsQ.isLoading}>
              <PlusIcon size={14} aria-hidden="true" />
              Add subscription
            </button>
          )}
        </div>
      </header>

      <RecurringSuggestions kind="subscription" />

      {actionError && <p className="erd-log-error" role="alert">{actionError}</p>}

      <SubscriptionsPanel
        active={subscriptions.active}
        cancelled={subscriptions.cancelled}
        hideAmounts={hideAmounts}
        busyService={busyService}
        loading={subscriptionsQ.isLoading && !subscriptionsQ.data}
        error={subscriptionsQ.isError && !subscriptionsQ.data}
        onAdd={() => setEditing(null)}
        onEdit={editSubscription}
        onCancel={(service) => void changeStatus(service, 'cancel')}
        onReactivate={(service) => void changeStatus(service, 'reactivate')}
      />

      <AnimatePresence>
        {showReadOnly && <ReadOnlyDialog onClose={() => setShowReadOnly(false)} />}
        {editing !== undefined && (
          <SubscriptionModal
            editData={editing ?? undefined}
            onClose={() => setEditing(undefined)}
            onSaved={() => setEditing(undefined)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
