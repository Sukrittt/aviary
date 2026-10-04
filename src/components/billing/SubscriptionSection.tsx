'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { useBillingStatus, useCancelWebSubscription, useSyncBilling } from '@/src/hooks/useBillingStatus'
import { billingVisible, formatDate, PLAY_STORE_URL, trialRemainingLabel } from './copy'
import { WebPlanPicker } from './WebPlanPicker'

/**
 * Subscription status on the account page: what the plan is, when it renews
 * or ends, and how to change it.
 *
 * Where a plan is managed depends on where it was bought. A Google Play plan
 * can only be cancelled in Play, and pretending otherwise would leave someone
 * clicking a button here believing they had cancelled when they had not. A
 * web plan is ours, so it's cancelled right here.
 */
export function SubscriptionSection() {
  const { data, isLoading } = useBillingStatus()
  const sync = useSyncBilling()
  const cancel = useCancelWebSubscription()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // Hidden entirely until subscriptions are switched on, so nobody is shown a
  // plan they cannot buy and a countdown that does not apply to them yet.
  if (isLoading || !data || !billingVisible(data)) return null

  const paid = data.mode === 'paid' && !data.gifted
  const web = paid && data.store === 'web'
  const play = paid && data.store !== 'web'
  // Subscribed mid-trial: nothing charged until the trial ends on `paidExpiresAt`.
  const scheduled = data.renewalState === 'scheduled'
  const canBuy = data.purchaseEnabled && (data.mode === 'trial' || data.mode === 'expired')

  return (
    <div id="subscription">
      <div className="account-section-label" style={{ marginBottom: 10 }}>
        Subscription
      </div>
      <div className="account-card">
        <div className="account-row" style={{ cursor: 'default' }}>
          <span className="account-row-label">
            Plan
            <span className="account-row-hint">{describePlan(data)}</span>
          </span>
          <span style={{ color: 'var(--tk-text2)', fontSize: 14 }}>{statusChip(data)}</span>
        </div>

        {data.renewalState === 'grace' && (
          <div className="account-row" style={{ cursor: 'default' }}>
            <span className="account-row-label" style={{ color: 'var(--tk-warn)' }}>
              Payment problem
              <span className="account-row-hint">
                {web
                  ? "Your last renewal didn't go through. We're retrying it, and you keep everything meanwhile."
                  : 'Google Play could not take the last payment. Update your payment method to avoid losing access.'}
              </span>
            </span>
          </div>
        )}

        {play && (
          <a className="account-row" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
            <span className="account-row-label">
              Manage in Google Play
              <span className="account-row-hint">Change plan, update payment method, or cancel.</span>
            </span>
            <ExternalLink size={16} className="account-row-arrow" aria-hidden />
          </a>
        )}

        {web && data.autoRenew && (
          <button
            type="button"
            className="account-row"
            onClick={() => setConfirmingCancel(true)}
            disabled={cancel.isPending}
            style={{ width: '100%', textAlign: 'left' }}
          >
            <span className="account-row-label">
              {scheduled ? 'Cancel subscription' : 'Cancel renewal'}
              <span className="account-row-hint">
                {cancel.isError
                  ? "That didn't go through. Check your connection and try again."
                  : scheduled
                    ? `You won't be charged. Your free trial still runs until ${formatDate(data.paidExpiresAt)}.`
                    : `You keep everything until ${formatDate(data.paidExpiresAt)}.`}
              </span>
            </span>
            <XCircle size={16} className="account-row-arrow" aria-hidden />
          </button>
        )}

        {web && !data.autoRenew && (
          <div className="account-row" style={{ cursor: 'default' }}>
            <span className="account-row-label">
              Renewal is off
              <span className="account-row-hint">
                You keep everything until {formatDate(data.paidExpiresAt)}. Pick a plan again after that to carry on.
              </span>
            </span>
          </div>
        )}

        <button type="button" className="account-row" onClick={() => sync.mutate()} disabled={sync.isPending} style={{ width: '100%', textAlign: 'left' }}>
          <span className="account-row-label">
            Refresh subscription status
            <span className="account-row-hint">
              {sync.isSuccess && sync.data.refreshed === false
                ? 'Could not reach the store. Your access is unchanged.'
                : 'Use this if you just subscribed on your phone.'}
            </span>
          </span>
          <RefreshCw size={16} className="account-row-arrow" aria-hidden />
        </button>
      </div>

      {canBuy && (
        <div className="account-card" style={{ marginTop: 12, padding: 16 }}>
          <WebPlanPicker trialEndsAt={data.mode === 'trial' ? data.trialEndsAt : null} />
        </div>
      )}

      <AnimatePresence>
        {confirmingCancel && (
          <ConfirmDialog
            title={scheduled ? 'Cancel subscription?' : 'Cancel renewal?'}
            body={
              scheduled
                ? `You won't be charged. Your free trial still runs until ${formatDate(data.paidExpiresAt)}.`
                : `You won't be charged again, and you keep everything until ${formatDate(data.paidExpiresAt)}.`
            }
            cancelLabel="Keep my plan"
            onCancel={() => setConfirmingCancel(false)}
          >
            <button
              type="button"
              className="account-danger-btn"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirmingCancel(false) })}
            >
              {cancel.isPending ? 'Cancelling…' : scheduled ? 'Cancel subscription' : 'Cancel renewal'}
            </button>
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </div>
  )
}

function describePlan(data: { mode: string; trialEndsAt: string | null; paidExpiresAt: string | null; autoRenew: boolean; basePlanId: string | null; renewalState: string | null; gifted?: boolean }): string {
  if (data.mode === 'trial') return `Free trial ends ${formatDate(data.trialEndsAt)}`
  if (data.mode === 'paid') {
    const plan = data.basePlanId ? `${data.basePlanId[0].toUpperCase()}${data.basePlanId.slice(1)} · ` : ''
    if (data.renewalState === 'scheduled') return `${plan}Free trial until ${formatDate(data.paidExpiresAt)}, then your first charge`
    // "Renews" and "ends" are not interchangeable. Someone who cancelled needs
    // to see the date their access stops, not a renewal that is not coming.
    return `${plan}${data.autoRenew ? 'Renews' : 'Ends'} ${formatDate(data.paidExpiresAt)}`
  }
  return 'No active subscription'
}

function statusChip(data: { mode: string; trialDaysRemaining: number; renewalState: string | null }): string {
  if (data.mode === 'trial' || data.renewalState === 'scheduled') return trialRemainingLabel(data.trialDaysRemaining)
  if (data.renewalState === 'grace') return 'Payment failed'
  if (data.renewalState === 'on_hold') return 'On hold'
  if (data.renewalState === 'paused') return 'Paused'
  if (data.renewalState === 'pending') return 'Pending'
  if (data.mode === 'paid') return 'Active'
  return 'Expired'
}
