'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ClockIcon, XIcon } from '@/src/components/icons'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { shouldWarnAboutTrial, trialRemainingLabel } from './copy'

/**
 * Trial countdown, shown only once the trial is nearly over.
 *
 * Silent for the first five and a half weeks by design — a banner that is
 * always present is one nobody reads on the day it matters. Dismissal is
 * per-day, not permanent: being quietly forgotten is the failure mode that
 * ends with a user surprised by a lockout they were never warned about.
 */
export function TrialBanner() {
  const { data } = useBillingStatus()
  const days = data?.trialDaysRemaining ?? 0
  const [dismissed, setDismissed] = useState<number | null>(null)

  if (!shouldWarnAboutTrial(data) || dismissed === days) return null

  const urgent = days <= 1
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '0 0 14px',
        padding: '10px 10px 10px 14px',
        borderRadius: 14,
        border: `1px solid ${urgent ? 'var(--tk-warn)' : 'var(--tk-border-strong)'}`,
        background: urgent ? 'var(--tk-warn-soft)' : 'var(--tk-card-solid)',
        color: 'var(--tk-text)',
        fontSize: 14,
      }}
    >
      <ClockIcon size={16} aria-hidden style={{ flexShrink: 0, color: urgent ? 'var(--tk-warn)' : 'var(--tk-text2)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>30 days on us: {trialRemainingLabel(days)}.</strong>{' '}
        <span style={{ color: 'var(--tk-text2)' }}>Pick a plan to keep budgeting.</span>
      </span>
      <Link href="/account" style={{ color: 'var(--tk-accent-ink)', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
        Details
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(days)}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 26,
          height: 26,
          flexShrink: 0,
          borderRadius: 999,
          border: 'none',
          background: 'transparent',
          color: 'var(--tk-text3)',
          cursor: 'pointer',
        }}
      >
        <XIcon size={14} aria-hidden />
      </button>
    </div>
  )
}
