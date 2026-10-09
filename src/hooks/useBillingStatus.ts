'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlreadySubscribedError,
  cancelWebSubscription,
  getBillingStatus,
  getWebPlans,
  startPayPalCheckout,
  startWebCheckout,
  syncBilling,
  verifyPayPalCheckout,
  verifyWebCheckout,
  type BillingStatus,
  type PlanPeriod,
  type WebCheckoutProvider,
} from '@/src/api/billing'
import { openCheckout } from '@/src/lib/razorpayCheckout'
import { setEventContext, track } from '@/src/lib/analytics'

export const billingKey = ['billing-status'] as const

/**
 * The account's subscription state. Twin of Mobile/src/hooks/useBillingStatus.
 *
 * Recognizes an entitlement bought on Android as well as one bought here, and
 * shows the trial countdown. `refetchOnWindowFocus` covers the realistic case:
 * the user buys on their phone, comes back to this tab, and expects the app
 * to have caught up.
 */
export function useBillingStatus(enabled = true) {
  const query = useQuery({
    queryKey: billingKey,
    queryFn: getBillingStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Off by default on anything but a signed-in app route. This provider
    // tree wraps the public landing page too, and /api/billing/status answers
    // 401 with no session — so leaving it always-on would fire a failing
    // request, plus React Query's retry, for every anonymous visitor.
    enabled,
  })
  // Every event carries the plan it happened on, so a chart can split trial
  // users from paying ones without a join. Same as mobile.
  const mode = query.data?.mode
  useEffect(() => {
    if (mode) setEventContext({ plan_status: mode })
  }, [mode])
  return query
}

/**
 * "Refresh subscription status" — for someone who just paid in the Android
 * app and does not want to wait for the webhook to land.
 */
export function useSyncBilling() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: syncBilling,
    onSuccess: (status: BillingStatus) => seedBillingStatus(qc, status),
  })
}

/** Put a fresh server answer (sync, checkout, cancel) straight into the cache. */
function seedBillingStatus(qc: ReturnType<typeof useQueryClient>, status: BillingStatus): void {
  qc.setQueryData(billingKey, status)
  // Access just changed — every screen that was showing restricted or
  // stale content needs to refetch what it could not load before.
  if (status.allowed) void qc.invalidateQueries()
}

/** The web plans, their live prices, and who sells them to this visitor. */
export function useWebPlans(enabled = true) {
  return useQuery({ queryKey: ['billing-web-plans'], queryFn: getWebPlans, staleTime: 10 * 60_000, enabled })
}

export type WebCheckoutOutcome =
  /** Paid and confirmed with Razorpay. */
  | { status: 'paid'; access: BillingStatus }
  /** Paid, but the server couldn't confirm it yet. The webhook will; don't let them pay twice. */
  | { status: 'pending'; access: BillingStatus }
  | { status: 'dismissed' }
  | { status: 'already_subscribed'; store: 'play' | 'web' | null }
  /** On the way to PayPal. The account page picks it up when they come back. */
  | { status: 'redirecting' }

/**
 * Web checkout, end to end: the server creates the subscription, Razorpay's
 * sheet takes the payment, and the server re-checks it before anything
 * unlocks. The access that comes back is the server's, never the sheet's.
 */
export function useWebCheckout(prefill?: { email?: string; name?: string }, provider: WebCheckoutProvider = 'razorpay') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (period: PlanPeriod): Promise<WebCheckoutOutcome> => {
      let session: { subscriptionId: string; keyId: string }
      try {
        if (provider === 'paypal') {
          const { approveUrl } = await startPayPalCheckout(period)
          window.location.assign(approveUrl)
          return { status: 'redirecting' }
        }
        session = await startWebCheckout(period)
      } catch (err) {
        if (err instanceof AlreadySubscribedError) return { status: 'already_subscribed', store: err.store }
        throw err
      }
      const result = await openCheckout({
        keyId: session.keyId,
        subscriptionId: session.subscriptionId,
        description: period === 'yearly' ? 'Yearly plan' : 'Monthly plan',
        prefill,
      })
      if (result.status === 'dismissed') return result
      const access = await verifyWebCheckout(result)
      return { status: access.mode === 'paid' ? 'paid' : 'pending', access }
    },
    // Same funnel events as mobile's Play checkout. `package` is the period.
    onMutate: (period) => track('purchase_started', { package: period }),
    onError: (_, period) => track('purchase_failed', { package: period, error_code: 'error' }),
    onSuccess: (outcome, period) => {
      if (outcome.status === 'paid' || outcome.status === 'pending') {
        track('purchase_completed', { package: period, verified: outcome.status === 'paid', pending: outcome.status === 'pending' })
      } else if (outcome.status === 'dismissed') track('purchase_cancelled', { package: period })
      else if (outcome.status === 'redirecting') return
      else track('purchase_failed', { package: period, error_code: 'already_subscribed' })
      if (outcome.status === 'paid' || outcome.status === 'pending') seedBillingStatus(qc, outcome.access)
      if (outcome.status === 'already_subscribed') void qc.invalidateQueries({ queryKey: billingKey })
    },
  })
}

export type PayPalReturn = 'confirming' | 'paid' | 'pending' | 'cancelled' | 'failed' | null

/**
 * The second half of PayPal checkout. PayPal sends the buyer back to
 * `/account?checkout=paypal&subscription_id=…`; this confirms that
 * subscription with the server once, then tidies the URL so a reload doesn't
 * confirm it again.
 */
export function usePayPalReturn(): PayPalReturn {
  const qc = useQueryClient()
  // Read once, on the client's first render: the URL is tidied straight after.
  const [arrival] = useState(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const subscriptionId = params.get('subscription_id')
    if (!checkout?.startsWith('paypal')) return null
    return checkout === 'paypal' && subscriptionId ? { subscriptionId } : { subscriptionId: null }
  })
  const confirm = useMutation({
    mutationFn: verifyPayPalCheckout,
    onSuccess: (access) => {
      track('purchase_completed', { package: access.basePlanId ?? 'unknown', verified: access.mode === 'paid', pending: access.mode !== 'paid' })
      seedBillingStatus(qc, access)
    },
    onError: () => track('purchase_failed', { package: 'unknown', error_code: 'error' }),
  })
  const { mutate } = confirm

  useEffect(() => {
    if (!arrival) return
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    if (arrival.subscriptionId) mutate(arrival.subscriptionId)
    else track('purchase_cancelled', { package: 'unknown' })
  }, [arrival, mutate])

  if (confirm.isPending) return 'confirming'
  if (confirm.isError) return 'failed'
  if (confirm.isSuccess) return confirm.data.mode === 'paid' ? 'paid' : 'pending'
  // Before the confirm starts, or back without a subscription (cancelled at PayPal).
  return arrival ? (arrival.subscriptionId ? 'confirming' : 'cancelled') : null
}

/** Stop renewing a web subscription. */
export function useCancelWebSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cancelWebSubscription,
    onSuccess: (status: BillingStatus) => seedBillingStatus(qc, status),
  })
}

/**
 * Whether normal app features should be usable right now.
 *
 * Unknown (still loading, or the request failed) is treated as allowed. The
 * server enforces this independently on every route, so being wrong here
 * costs a 402 on the next request — whereas failing closed would lock out a
 * paying user over one flaky fetch.
 */
export function useAccessAllowed(): boolean {
  const { data } = useBillingStatus()
  return data?.allowed ?? true
}
