'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BellIcon, ChatCircleIcon, CheckIcon, GiftIcon, ScanIcon, SquaresFourIcon, type PhosphorIcon } from '@/src/components/icons'
import type { PlanPeriod } from '@/src/api/billing'
import { useWebCheckout, useWebPlans } from '@/src/hooks/useBillingStatus'
import { useUser } from '@/src/hooks/useUser'
import { track } from '@/src/lib/analytics'
import { defersFirstCharge, formatDate, formatPrice, REMINDER_DAYS, yearlySavingsPercent } from './copy'

/**
 * What a subscription gets you. Mirrors Mobile's PlanPicker BENEFITS; there's
 * no free tier, so this is the whole app. Nothing here promises unlimited AI.
 */
export const BENEFITS = [
  'As many categories and expenses as you like',
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
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const reduce = useReducedMotion() ?? false

  if (plans.isLoading) return <PlanPickerSkeleton timeline={!!trialEndsAt && defersFirstCharge(trialEndsAt)} />
  if (plans.isError || !plans.data) return <p style={note}>Plans aren&apos;t loading right now. Check your connection and try again.</p>

  const monthly = plans.data.plans.find((p) => p.period === 'monthly')
  const yearly = plans.data.plans.find((p) => p.period === 'yearly')
  const saving = monthly && yearly ? yearlySavingsPercent(monthly.amount, yearly.amount) : null
  const selected = plans.data.plans.find((p) => p.period === period)
  const outcome = checkout.data
  // Leaving for PayPal: keep everything locked until the page goes.
  const busy = checkout.isPending || outcome?.status === 'redirecting'
  const isYearly = period === 'yearly'
  const paypal = provider === 'paypal'
  // Mid-trial with the charge deferred: tell the story in dates. Otherwise
  // (expired, or the trial's last minutes when the server charges now) show
  // what the plan keeps switched on.
  const timeline = !!trialEndsAt && defersFirstCharge(trialEndsAt)

  return (
    <div style={{ display: 'grid', gap: 22, gridTemplateColumns: timeline ? 'repeat(auto-fit, minmax(250px, 1fr))' : undefined, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: 1.2, fontWeight: 700, color: 'var(--tk-accent-ink)' }}>AVIARY PRO</span>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'var(--tk-text)' }}>
            {timeline ? 'Try everything. Pay only if it sticks.' : 'Keep your budget going'}
          </h3>
          <p style={{ ...note, fontWeight: 500 }}>
            {timeline
              ? `Your trial runs to ${formatDate(trialEndsAt)}. Subscribe now and the first charge waits for that date.`
              : "One plan. No ads, ever. Here's what it keeps switched on."}
          </p>
        </div>

        {timeline ? (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
            {trialSteps(trialEndsAt, paypal).map((step, i, all) => (
              <li key={step.title} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', columnGap: 12 }}>
                <span style={{ display: 'grid', gridTemplateRows: 'auto 1fr', justifyItems: 'center' }}>
                  <motion.span
                    aria-hidden
                    className={step.tone === 'now' && !reduce ? 'plan-step-now' : undefined}
                    initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18, delay: i * STEP_DELAY }}
                    style={{ width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center', ...STEP_TONE[step.tone] }}
                  >
                    {step.icon ? <step.icon size={12} weight="bold" /> : <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--tk-accent)' }} />}
                  </motion.span>
                  {i < all.length - 1 ? (
                    // The line draws down to the next date, so the eye follows today, reminder, charge.
                    <motion.span
                      aria-hidden
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: STEP_DELAY, ease: 'easeInOut', delay: i * STEP_DELAY + 0.12 }}
                      style={{ width: 2, margin: '4px 0', borderRadius: 1, transformOrigin: 'top', background: i === 0 ? 'linear-gradient(var(--tk-accent), var(--tk-border-strong))' : 'var(--tk-border-strong)' }}
                    />
                  ) : null}
                </span>
                <motion.span
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay: i * STEP_DELAY + 0.05 }}
                  style={{ display: 'grid', gap: 2, paddingBottom: i < all.length - 1 ? 16 : 0 }}
                >
                  <strong style={{ fontSize: 14, lineHeight: '24px', fontWeight: 700, color: 'var(--tk-text)' }}>{step.title}</strong>
                  <span style={{ ...note, fontSize: 13 }}>{step.body}</span>
                </motion.span>
              </li>
            ))}
          </ol>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {FEATURES.map(({ icon: Icon, title, blurb, tone }) => (
              <li key={title} style={{ display: 'grid', gap: 8, alignContent: 'start', padding: 14, borderRadius: 16, border: '1px solid var(--tk-border)', background: 'var(--tk-card-solid)' }}>
                <span aria-hidden style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: `var(--tk-${tone}-soft)`, color: `var(--tk-${tone === 'accent' || tone === 'warn' ? `${tone}-ink` : tone})` }}>
                  <Icon size={18} weight="bold" />
                </span>
                <strong style={{ fontSize: 14, fontWeight: 700, color: 'var(--tk-text)' }}>{title}</strong>
                <span style={{ ...note, fontSize: 12.5, lineHeight: 1.4 }}>{blurb}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div role="radiogroup" aria-label="Plan" style={{ display: 'grid', gap: 8 }}>
          {[yearly, monthly].map((plan) => {
            if (!plan) return null
            const on = period === plan.period
            const y = plan.period === 'yearly'
            // Rounded to whole rupees, the way people say it: ₹167 a month, not ₹166.58.
            const perMonth = plan.currency === 'INR' ? Math.round(plan.amount / 1200) * 100 : Math.round(plan.amount / 12)
            return (
              <motion.button
                key={plan.period}
                whileTap={busy || reduce ? undefined : { scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
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
                  {on ? (
                    <motion.span
                      initial={reduce ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 14 }}
                      style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--tk-accent)' }}
                    />
                  ) : null}
                </span>
                <span style={{ flex: 1, display: 'grid', gap: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 15, fontWeight: 700 }}>{y ? 'Yearly' : 'Monthly'}</strong>
                    {y && saving ? (
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', background: 'var(--tk-mint)', color: 'var(--tk-bg)', boxShadow: '0 2px 8px var(--tk-mint-soft)' }}>
                        Save {saving}%
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--tk-text2)', fontWeight: 500 }}>
                    {y ? `${formatPrice(perMonth, plan.currency)}/month · billed once a year` : 'Flexible, cancel any month'}
                  </span>
                </span>
                <strong style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {formatPrice(plan.amount, plan.currency)}/{y ? 'year' : 'month'}
                </strong>
              </motion.button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            // Left open past the cutoff, the header still promises a deferred
            // charge the server won't honour. Redraw with the true copy first.
            if (timeline && !defersFirstCharge(trialEndsAt)) return rerender()
            checkout.mutate(period)
          }}
          disabled={busy || !selected}
          style={{
            font: 'inherit',
            marginTop: 4,
            padding: '14px 18px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--tk-accent)',
            color: 'var(--tk-on-accent)',
            fontWeight: 700,
            fontSize: 15,
            opacity: busy || !selected ? 0.55 : 1,
            cursor: busy || !selected ? 'not-allowed' : 'pointer',
            transition: 'opacity 150ms',
          }}
        >
          {busy
            ? paypal
              ? 'Taking you to PayPal…'
              : 'Opening checkout…'
            : selected
              ? `Keep Aviary · ${formatPrice(selected.amount, selected.currency)}/${isYearly ? 'year' : 'month'}`
              : 'Keep Aviary'}
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 16px' }}>
          {['Cancel anytime', timeline ? (paypal ? 'PayPal or card' : 'UPI or card') : 'Export free, always'].map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--tk-text2)' }}>
              <CheckIcon size={12} weight="bold" color="var(--tk-mint)" aria-hidden />
              {t}
            </span>
          ))}
        </div>

        <p style={{ ...note, fontSize: 12.5, padding: '10px 12px', borderRadius: 12, background: 'var(--tk-input-bg)' }}>Also works in the Android app. One plan, both places.</p>
        <p style={{ ...note, fontSize: 12, lineHeight: '16px', textAlign: 'center', color: 'var(--tk-text3)' }}>
          Renews {isYearly ? 'yearly' : 'monthly'} until you cancel from your account page.
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

/** The "what's switched on" cards for the no-trial header. Tone picks a token pair from the theme. */
const FEATURES: { icon: PhosphorIcon; title: string; blurb: string; tone: 'accent' | 'violet' | 'warn' | 'mint' }[] = [
  { icon: ScanIcon, title: 'Snap a bill', blurb: 'Split a receipt without typing it in.', tone: 'accent' },
  { icon: ChatCircleIcon, title: 'Ask Aviary', blurb: '"Where did my money go?" Answered.', tone: 'violet' },
  { icon: GiftIcon, title: 'Monthly Wrapped', blurb: 'Your month as a story, not a spreadsheet.', tone: 'warn' },
  { icon: SquaresFourIcon, title: 'Widgets + web', blurb: 'Home screen on Android, full app on the web.', tone: 'mint' },
]

/** Seconds between timeline steps as they pop in. */
const STEP_DELAY = 0.35

/** The picker's shape while plans load: header, timeline or feature cards, two plan cards and the button. */
function PlanPickerSkeleton({ timeline }: { timeline: boolean }) {
  const bone = (w: React.CSSProperties['width'], h: number, r = 8) => <span className="sk-bone" style={{ width: w, height: h, borderRadius: r }} />
  return (
    <div className="sk-pulse" role="status" aria-label="Loading plans" style={{ display: 'grid', gap: 22, gridTemplateColumns: timeline ? 'repeat(auto-fit, minmax(250px, 1fr))' : undefined, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {bone(84, 12)}
          {bone('90%', 24)}
          {bone('60%', 24)}
          {bone('100%', 13)}
          {bone('75%', 13)}
        </div>
        {timeline ? (
          <div style={{ display: 'grid', gap: 18 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', columnGap: 12, alignItems: 'start' }}>
                {bone(24, 24, 12)}
                <span style={{ display: 'grid', gap: 6 }}>
                  {bone(90, 14)}
                  {bone('95%', 12)}
                  {bone('70%', 12)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i}>{bone('100%', 110, 16)}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {bone('100%', 76, 16)}
          {bone('100%', 64, 16)}
        </div>
        <span style={{ marginTop: 4 }}>{bone('100%', 48, 999)}</span>
        <span style={{ justifySelf: 'center' }}>{bone(180, 14)}</span>
        {bone('100%', 40, 12)}
      </div>
    </div>
  )
}

const STEP_TONE = {
  now: { background: 'var(--tk-accent-soft)', color: 'var(--tk-accent-ink)', border: '2px solid var(--tk-accent)' },
  later: { background: 'var(--tk-card-solid)', color: 'var(--tk-text3)', border: '2px solid var(--tk-border-strong)' },
  end: { background: 'var(--tk-mint-soft)', color: 'var(--tk-mint)', border: '2px solid var(--tk-mint)' },
}

/**
 * Today, the reminder a week out, and the first charge. The reminder step
 * goes once its date has passed, so the timeline never promises a heads up
 * that already happened (or didn't).
 */
function trialSteps(trialEndsAt: string, paypal: boolean, now = Date.now()) {
  const end = new Date(trialEndsAt).getTime()
  const reminder = end - REMINDER_DAYS[0] * 86_400_000
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  return [
    { title: 'Today', tone: 'now' as const, icon: null, body: paypal ? 'Pick a plan. We set up autopay and nothing else moves.' : 'Pick a plan. We set up autopay with a refundable ₹5 and nothing else moves.' },
    ...(reminder > now ? [{ title: day(reminder), tone: 'later' as const, icon: BellIcon, body: "A heads up, one week out. Cancel in two clicks if you've changed your mind." }] : []),
    { title: day(end), tone: 'end' as const, icon: CheckIcon, body: 'First charge. You keep budgeting without a gap.' },
  ]
}

const note: React.CSSProperties = { margin: 0, color: 'var(--tk-text2)', fontSize: 13, lineHeight: 1.5 }
