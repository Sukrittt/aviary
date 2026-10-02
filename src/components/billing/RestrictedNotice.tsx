'use client'

import Link from 'next/link'
import { ChevronRight, Compass, Database, ExternalLink, Lock, MessageCircle, RefreshCw, type LucideIcon } from 'lucide-react'
import '@/src/expense-redesign.css'
import { useBillingStatus, useSyncBilling } from '@/src/hooks/useBillingStatus'
import { lockedReason, PLAY_STORE_URL } from './copy'
import { WebPlanPicker } from './WebPlanPicker'

/**
 * Shown in place of the budgeting app when the account has no valid trial or
 * subscription.
 *
 * Every route out of here is deliberate. An expired user must be able to get
 * their data (pricing.md promises export without a subscription), manage or
 * delete their account, and pay — and nothing else. A dead end with only a
 * "Subscribe" button would be holding their own records hostage.
 *
 * Checkout happens right here through Razorpay once purchases are open. The
 * Android app keeps its own Google Play checkout (Play requires it there), and
 * either purchase unlocks both, so this also points people who'd rather pay
 * on their phone at the app.
 */
export function RestrictedNotice() {
  const { data: status } = useBillingStatus()
  const sync = useSyncBilling()

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px', display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
        <div
          aria-hidden
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'var(--tk-warn-soft)',
          }}
        >
          <Lock size={20} color="var(--tk-warn)" />
        </div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-fredoka), system-ui', fontSize: 26, color: 'var(--tk-text)' }}>
          Subscription needed
        </h1>
        <p style={{ margin: 0, color: 'var(--tk-text2)', lineHeight: 1.55 }}>{lockedReason(status)}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 14,
          padding: 18,
          borderRadius: 16,
          border: '1px solid var(--tk-border)',
          background: 'var(--tk-card-solid)',
        }}
      >
        {status?.purchaseEnabled ? (
          <WebPlanPicker />
        ) : (
          <div>
            <strong style={{ color: 'var(--tk-text)' }}>Subscribe in the Android app</strong>
            <p style={{ margin: '6px 0 0', color: 'var(--tk-text2)', fontSize: 14, lineHeight: 1.5 }}>
              Payment goes through Google Play, so it happens on your phone. Sign in to the Android app with this same
              Aviary account and your subscription unlocks here too.
            </p>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 999,
              // Secondary once web checkout is on the page, so there's one obvious way to pay.
              ...(status?.purchaseEnabled
                ? { border: '1px solid var(--tk-border-strong)', background: 'transparent', color: 'var(--tk-text)', fontWeight: 600 }
                : { background: 'var(--tk-accent)', color: 'var(--tk-on-accent)', fontWeight: 700 }),
              textDecoration: 'none',
            }}
          >
            {status?.purchaseEnabled ? 'Get the Android app' : 'Open Google Play'} <ExternalLink size={15} aria-hidden />
          </a>
          {/* For someone who already paid on their phone and is waiting for
              this tab to catch up, rather than a second way to buy. */}
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid var(--tk-border-strong)',
              background: 'transparent',
              color: 'var(--tk-text)',
              fontWeight: 600,
              cursor: sync.isPending ? 'progress' : 'pointer',
            }}
          >
            <RefreshCw size={15} aria-hidden />
            {sync.isPending ? 'Checking…' : 'Already subscribed? Refresh'}
          </button>
        </div>
        {sync.isSuccess && !sync.data.allowed && (
          <p role="status" style={{ margin: 0, color: 'var(--tk-text3)', fontSize: 13 }}>
            {sync.data.refreshed === false
              ? "Couldn't reach the store just now. Your access hasn't changed, so try again shortly."
              : 'No active subscription found on this account yet.'}
          </p>
        )}
      </div>

      {/* The account page's own rows, minus anything that needs access
          (bill scans) or has nothing to say here (plan, legal). Each one
          opens the real page, so nothing is duplicated on this screen. */}
      <div className="account-card">
        <ExitRow icon={Lock} label="Account & security" href="/account/security" />
        <ExitRow icon={Database} label="Your data" href="/account/data" />
        <ExitRow icon={Compass} label="How this works" href="/account/guided-tour" />
        <ExitRow icon={MessageCircle} label="Help & feedback" href="/account/help" />
      </div>
    </div>
  )
}

function ExitRow({ icon: Icon, label, href }: { icon: LucideIcon; label: string; href: string }) {
  return (
    <Link href={href} className="account-row">
      <Icon size={16} aria-hidden="true" />
      <span className="account-row-label">{label}</span>
      <ChevronRight size={16} className="account-row-arrow" aria-hidden="true" />
    </Link>
  )
}
