'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, CaretRightIcon, XCircleIcon, XIcon } from '@/src/components/icons'
import { ConfirmDialog } from '@/src/components/ConfirmDialog'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { useBillingStatus, useCancelWebSubscription, usePayPalReturn, useSyncBilling, type PayPalReturn } from '@/src/hooks/useBillingStatus'
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
  const [plansOpen, setPlansOpen] = useState(false)
  const plansRow = useRef<HTMLButtonElement>(null)
  const paypalReturn = usePayPalReturn()
  const reduceMotion = useReducedMotion()

  function closePlans() {
    setPlansOpen(false)
    plansRow.current?.focus()
  }

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
            {data.mode === 'paid' ? (
              <span style={{ fontWeight: 700, color: 'var(--tk-accent-ink)' }}>Aviary Pro</span>
            ) : (
              'Plan'
            )}
            <span className="account-row-hint">{describePlan(data)}</span>
          </span>
          {data.mode === 'paid' ? (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', ...CHIP_TONE[chipTone(data)] }}>{statusChip(data)}</span>
          ) : (
            <span style={{ color: 'var(--tk-text2)', fontSize: 14 }}>{statusChip(data)}</span>
          )}
        </div>

        {paypalReturn && (
          <div className="account-row" role="status" style={{ cursor: 'default' }}>
            <span className="account-row-label" style={paypalReturn === 'failed' ? { color: 'var(--tk-warn)' } : undefined}>
              {PAYPAL_RETURN[paypalReturn].title}
              <span className="account-row-hint">{PAYPAL_RETURN[paypalReturn].hint}</span>
            </span>
          </div>
        )}

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
            <ArrowSquareOutIcon size={16} className="account-row-arrow" aria-hidden />
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
            <XCircleIcon size={16} className="account-row-arrow" aria-hidden />
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

        {canBuy && (
          <button ref={plansRow} type="button" className="account-row" onClick={() => setPlansOpen(true)} style={{ width: '100%', textAlign: 'left' }}>
            <span className="account-row-label">
              <span style={{ fontWeight: 700, color: 'var(--tk-accent-ink)' }}>See plans</span>
              <span className="account-row-hint">Yearly or monthly. Everything&apos;s included, here and on Android.</span>
            </span>
            <CaretRightIcon size={16} className="account-row-arrow" aria-hidden />
          </button>
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
          <motion.span
            aria-hidden
            className="account-row-arrow"
            style={{ display: 'inline-flex' }}
            animate={{ rotate: sync.isPending && !reduceMotion ? 360 : 0 }}
            transition={sync.isPending ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0 }}
          >
            <ArrowsClockwiseIcon size={16} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence>
        {canBuy && plansOpen && (
          <Scrim className="erd-modal-overlay" onClick={closePlans}>
            <Sheet
              className="erd-modal-card"
              role="dialog"
              aria-modal="true"
              aria-label="Aviary Pro plans"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => trapKeys(e, closePlans)}
              style={{ position: 'relative', width: 640, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)', padding: '56px 24px 24px' }}
            >
              <button type="button" className="account-pill-btn" autoFocus onClick={closePlans} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, padding: 0, display: 'grid', placeItems: 'center' }}>
                <XIcon size={16} />
              </button>
              <WebPlanPicker trialEndsAt={data.mode === 'trial' ? data.trialEndsAt : null} />
            </Sheet>
          </Scrim>
        )}
      </AnimatePresence>

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

/** Escape closes; Tab and Shift+Tab wrap inside the dialog instead of walking out behind the backdrop. */
function trapKeys(e: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (e.key === 'Escape') return close()
  if (e.key !== 'Tab') return
  const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last?.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first?.focus()
  }
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

function statusChip(data: { mode: string; trialDaysRemaining: number; renewalState: string | null; autoRenew: boolean; paidExpiresAt: string | null; gifted?: boolean }): string {
  if (data.mode === 'trial') return trialRemainingLabel(data.trialDaysRemaining)
  // Bought mid-trial: they're subscribed, the plan line says when the first charge is.
  if (data.renewalState === 'scheduled') return 'Subscribed'
  if (data.renewalState === 'grace') return 'Payment failed'
  if (data.renewalState === 'on_hold') return 'On hold'
  if (data.renewalState === 'paused') return 'Paused'
  if (data.renewalState === 'pending') return 'Pending'
  // Renewal switched off: say when it stops, not "Active" like nothing changed.
  if (data.mode === 'paid' && !data.autoRenew && !data.gifted && data.paidExpiresAt) {
    return `Ends ${new Date(data.paidExpiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
  }
  if (data.mode === 'paid') return 'Active'
  return 'Expired'
}

/** Colour of the paid-plan status pill: green when all's well, amber when it needs attention. */
function chipTone(data: { renewalState: string | null; autoRenew: boolean; gifted?: boolean }): keyof typeof CHIP_TONE {
  if (data.renewalState && ['grace', 'on_hold', 'paused', 'pending'].includes(data.renewalState)) return 'warn'
  if (!data.autoRenew && !data.gifted) return 'warn'
  return 'good'
}

const CHIP_TONE = {
  good: { background: 'var(--tk-mint-soft)', color: 'var(--tk-mint)' },
  warn: { background: 'var(--tk-warn-soft)', color: 'var(--tk-warn-ink)' },
}

/** What to say once PayPal sends the buyer back here. */
const PAYPAL_RETURN: Record<Exclude<PayPalReturn, null>, { title: string; hint: string }> = {
  confirming: { title: 'Confirming your payment…', hint: 'This takes a few seconds.' },
  paid: { title: "You're all set", hint: 'Thanks for subscribing. Everything is unlocked.' },
  pending: { title: 'Almost there', hint: "PayPal is still confirming your payment. Give it a minute. No need to pay again." },
  cancelled: { title: 'Checkout cancelled', hint: "Nothing was charged. Pick a plan whenever you're ready." },
  failed: { title: "We couldn't confirm that yet", hint: "If PayPal took the payment, it'll show up here shortly. Reload this page to try again." },
}
