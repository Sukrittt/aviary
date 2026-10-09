'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { PlanPeriod } from '@/src/api/billing'
import { useWebCheckout, useWebPlans } from '@/src/hooks/useBillingStatus'
import { useUser } from '@/src/hooks/useUser'
import { track } from '@/src/lib/analytics'
import { defersFirstCharge, formatDate, formatPrice, yearlySavingsPercent } from './copy'

/**
 * What a subscription gets you. Mirrors Mobile's PlanPicker BENEFITS; there's
 * no free tier, so this is the whole app. Nothing here promises unlimited AI.
 */
export const BENEFITS = [
  'As many envelopes and expenses as you like',
  'Snap a bill instead of typing it in',
  'Ask Aviary where your money went',
  'Monthly Wrapped and spending insights',
  'Track bills, subscriptions and investments',
  'The web app, plus Android with home screen widgets',
  'No ads. Ever.',
]

/**
 * Monthly or yearly, paid on the web: Razorpay in India, PayPal elsewhere
 * (the server picks). Twin of Mobile's PlanPicker, which does the same
 * through Google Play.
 *
 * Shown only when the server says purchases are open; the server re-checks
 * that (and refuses anyone already paying) on its own anyway.
 *
 * Mid-trial (`trialEndsAt` set), the server defers the first charge to the
 * trial's end, and the copy says so.
 */
export function WebPlanPicker({ trialEndsAt = null, trigger = 'plan_screen' }: { trialEndsAt?: string | null; trigger?: 'plan_screen' | 'access_expired' }) {
  const plans = useWebPlans()
  // Once per visit, the first moment plans are actually on screen. `trigger`
  // separates someone browsing plans mid-trial from someone locked out.
  const paywallSeen = useRef(false)
  // The same condition the picker renders plans under, so an error state or an
  // empty list isn't counted as a view.
  const shown = !plans.isError && !!plans.data?.plans.length
  useEffect(() => {
    if (!shown || paywallSeen.current) return
    paywallSeen.current = true
    track('paywall_viewed', { trigger })
  }, [shown, trigger])
  const { data: user } = useUser()
  const provider = plans.data?.provider ?? 'razorpay'
  const checkout = useWebCheckout(user ? { email: user.email, name: user.name ?? undefined } : undefined, provider)
  const [period, setPeriod] = useState<PlanPeriod>('yearly')

  if (plans.isLoading) return <p style={note}>Loading plans…</p>
  if (plans.isError || !plans.data) return <p style={note}>Plans aren&apos;t loading right now. Check your connection and try again.</p>

  const monthly = plans.data.plans.find((p) => p.period === 'monthly')
  const yearly = plans.data.plans.find((p) => p.period === 'yearly')
  const saving = monthly && yearly ? yearlySavingsPercent(monthly.amount, yearly.amount) : null
  const selected = plans.data.plans.find((p) => p.period === period)
  const outcome = checkout.data
  // Leaving for PayPal: keep everything locked until the page goes.
  const busy = checkout.isPending || outcome?.status === 'redirecting'
  const isYearly = period === 'yearly'

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 800, color: 'var(--tk-accent-ink)' }}>AVIARY PRO</span>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-fredoka)', fontWeight: 600, fontSize: 22, color: 'var(--tk-text)' }}>
          Keep your budget going
        </h3>
        <p style={{ ...note, fontWeight: 500 }}>One plan. Everything&apos;s included, here and in the Android app.</p>
      </div>

      <div role="radiogroup" aria-label="Plan" style={{ display: 'grid', gap: 8 }}>
        {[yearly, monthly].map((plan) => {
          if (!plan) return null
          const on = period === plan.period
          const y = plan.period === 'yearly'
          return (
            <button
              key={plan.period}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPeriod(plan.period)}
              disabled={busy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                font: 'inherit',
                textAlign: 'left',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy && !on ? 0.55 : 1,
                color: 'var(--tk-text)',
                border: `1.5px solid ${on ? 'var(--tk-accent)' : 'var(--tk-border)'}`,
                background: on ? 'var(--tk-accent-soft)' : 'var(--tk-input-bg)',
                transition: 'background 150ms, border-color 150ms',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: 10,
                  border: `2px solid ${on ? 'var(--tk-accent)' : 'var(--tk-border-strong)'}`,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {on ? <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--tk-accent)' }} /> : null}
              </span>
              <span style={{ flex: 1, display: 'grid', gap: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 15, fontWeight: 800 }}>{y ? 'Yearly' : 'Monthly'}</strong>
                  {y && saving ? (
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, padding: '2px 8px', borderRadius: 999, background: 'var(--tk-mint-soft)', color: 'var(--tk-mint)' }}>
                      Save {saving}%
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: 12, color: 'var(--tk-text2)', fontWeight: 500 }}>
                  {y ? `${formatPrice(Math.round(plan.amount / 12), plan.currency)}/month, billed yearly` : 'Billed monthly'}
                </span>
              </span>
              <strong style={{ fontSize: 15, fontWeight: 800 }}>
                {formatPrice(plan.amount, plan.currency)}/{y ? 'year' : 'month'}
              </strong>
            </button>
          )
        })}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {BENEFITS.map((b) => (
          <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: '19px', fontWeight: 600, color: 'var(--tk-text)' }}>
            <span aria-hidden style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--tk-mint-soft)', color: 'var(--tk-mint)' }}>
              <Check size={12} strokeWidth={3} />
            </span>
            {b}
          </li>
        ))}
      </ul>

      <div style={{ display: 'grid', gap: 8 }}>
        <button
          type="button"
          onClick={() => checkout.mutate(period)}
          disabled={busy || !selected}
          style={{
            font: 'inherit',
            padding: '13px 18px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--tk-accent)',
            color: 'var(--tk-on-accent)',
            fontWeight: 800,
            fontSize: 15,
            opacity: busy || !selected ? 0.55 : 1,
            cursor: busy || !selected ? 'not-allowed' : 'pointer',
            transition: 'opacity 150ms',
          }}
        >
          {busy
            ? provider === 'paypal'
              ? 'Taking you to PayPal…'
              : 'Opening checkout…'
            : selected
              ? `Subscribe ${isYearly ? 'yearly' : 'monthly'} · ${formatPrice(selected.amount, selected.currency)}`
              : 'Subscribe'}
        </button>
        <p style={{ ...note, fontSize: 11, lineHeight: '16px', textAlign: 'center', color: 'var(--tk-text3)' }}>
          {trialEndsAt && defersFirstCharge(trialEndsAt) ? `Nothing's charged until your trial ends on ${formatDate(trialEndsAt)}. ` : ''}
          Renews every {isYearly ? 'year' : 'month'} until you cancel. {provider === 'paypal' ? 'Pay with PayPal or a card.' : 'Pay with UPI or card.'} Cancel anytime from your account page.
        </p>
      </div>

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
