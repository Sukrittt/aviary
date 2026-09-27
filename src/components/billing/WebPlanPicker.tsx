'use client'

import { useState } from 'react'
import type { PlanPeriod } from '@/src/api/billing'
import { useWebCheckout, useWebPlans } from '@/src/hooks/useBillingStatus'
import { useUser } from '@/src/hooks/useUser'
import { formatPrice, yearlySavingsPercent } from './copy'

/**
 * Monthly or yearly, paid on the web through Razorpay. Twin of Mobile's
 * PlanPicker, which does the same through Google Play.
 *
 * Shown only when the server says purchases are open; the server re-checks
 * that (and refuses anyone already paying) on its own anyway.
 */
export function WebPlanPicker() {
  const plans = useWebPlans()
  const { data: user } = useUser()
  const checkout = useWebCheckout(user ? { email: user.email, name: user.name ?? undefined } : undefined)
  const [period, setPeriod] = useState<PlanPeriod>('yearly')

  if (plans.isLoading) return <p style={note}>Loading plans…</p>
  if (plans.isError || !plans.data) return <p style={note}>Plans aren&apos;t loading right now. Check your connection and try again.</p>

  const monthly = plans.data.find((p) => p.period === 'monthly')
  const yearly = plans.data.find((p) => p.period === 'yearly')
  const saving = monthly && yearly ? yearlySavingsPercent(monthly.amount, yearly.amount) : null
  const selected = plans.data.find((p) => p.period === period)
  const outcome = checkout.data

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="radiogroup" aria-label="Plan" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {[yearly, monthly].map((plan) =>
          plan ? (
            <button
              key={plan.period}
              type="button"
              role="radio"
              aria-checked={period === plan.period}
              onClick={() => setPeriod(plan.period)}
              disabled={checkout.isPending}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 14,
                cursor: 'pointer',
                background: 'var(--tk-card-solid)',
                border: `2px solid ${period === plan.period ? 'var(--tk-accent)' : 'var(--tk-border)'}`,
                color: 'var(--tk-text)',
                display: 'grid',
                gap: 4,
              }}
            >
              <strong>{plan.period === 'yearly' ? 'Yearly' : 'Monthly'}</strong>
              <span style={{ fontSize: 20, fontWeight: 700 }}>
                {formatPrice(plan.amount, plan.currency)}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tk-text2)' }}> / {plan.period === 'yearly' ? 'year' : 'month'}</span>
              </span>
              {plan.period === 'yearly' && saving ? (
                <span style={{ fontSize: 13, color: 'var(--tk-accent-ink)', fontWeight: 700 }}>Save {saving}%</span>
              ) : null}
            </button>
          ) : null,
        )}
      </div>

      <button
        type="button"
        onClick={() => checkout.mutate(period)}
        disabled={checkout.isPending || !selected}
        style={{
          padding: '12px 18px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--tk-accent)',
          color: 'var(--tk-on-accent)',
          fontWeight: 700,
          fontSize: 15,
          cursor: checkout.isPending ? 'default' : 'pointer',
        }}
      >
        {checkout.isPending ? 'Opening checkout…' : selected ? `Subscribe for ${formatPrice(selected.amount, selected.currency)}` : 'Subscribe'}
      </button>

      <p style={note}>
        Renews every {period === 'yearly' ? 'year' : 'month'} until you cancel. Pay with UPI or card. Cancel anytime from your account page.
      </p>

      {checkout.isError ? <p style={{ ...note, color: 'var(--tk-warn)' }}>Checkout didn&apos;t open. Check your connection and try again.</p> : null}
      {outcome?.status === 'pending' ? (
        <p style={note}>Your payment went through. We&apos;re still confirming it, so give it a minute. No need to pay again.</p>
      ) : null}
      {outcome?.status === 'already_subscribed' ? (
        <p style={note}>
          You&apos;ve already got a plan{outcome.store === 'play' ? ' through Google Play' : ''}, so there&apos;s nothing to buy.
        </p>
      ) : null}
    </div>
  )
}

const note: React.CSSProperties = { margin: 0, color: 'var(--tk-text2)', fontSize: 13, lineHeight: 1.5 }
