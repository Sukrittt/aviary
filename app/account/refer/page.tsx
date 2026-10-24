'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckIcon, CopyIcon, ShareNetworkIcon } from '@/src/components/icons'
import { getReferrals, shareMessage } from '@/src/api/referrals'
import { ReferralCodeEntry } from '@/src/components/ReferralCodeEntry'
import { Toast } from '@/src/components/Toast'
import { track } from '@/src/lib/analytics'

// Twin of Mobile's app/account/refer.tsx.
export default function ReferPage() {
  const q = useQuery({ queryKey: ['referrals'], queryFn: getReferrals })
  const [copied, setCopied] = useState(0)
  const data = q.data

  async function share() {
    if (!data) return
    const text = shareMessage(data.link)
    if (navigator.share) {
      try {
        await navigator.share({ text })
        track('referral_link_shared', { method: 'share' })
      } catch {
        // Dismissed the share sheet.
      }
      return
    }
    await copy(text, 'link')
  }

  async function copy(text: string, what: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    track('referral_link_shared', { method: what === 'code' ? 'copy_code' : 'copy' })
    setCopied((n) => n + 1)
  }

  return (
    <div className="referral-page">
      <div className="account-card referral-hero">
        <h1 className="referral-title">Give a month, get a month</h1>
        <p className="account-help-copy">
          Share your link. When a friend sets up Aviary and logs expenses on three different days, you both get a month of Pro.
        </p>
        {q.isError && <p className="referral-entry-msg is-error">Couldn&apos;t load your code. Check your connection and try again.</p>}
        <div className="referral-code" aria-busy={!data}>
          <span className="adm-muted referral-code-label">Your code</span>
          <strong className="referral-code-value">{data?.code ?? '······'}</strong>
        </div>
        <div className="referral-actions">
          <button type="button" className="auth-btn auth-btn--primary" onClick={share} disabled={!data}>
            <ShareNetworkIcon size={18} aria-hidden="true" /> Share link
          </button>
          <button type="button" className="auth-btn auth-btn--outline" onClick={() => data && copy(data.code, 'code')} disabled={!data}>
            <CopyIcon size={18} aria-hidden="true" /> Copy code
          </button>
        </div>
        {data && (
          <p className="referral-stats">
            {data.joined} {data.joined === 1 ? 'friend' : 'friends'} joined · {data.monthsEarned} {data.monthsEarned === 1 ? 'month' : 'months'} earned
          </p>
        )}
        <p className="referral-fine">You can earn up to 3 months each calendar month. On a paid web plan, the free month is added after your current paid period.</p>
      </div>
      {data?.canEnterCode && (
        <div className="account-card referral-hero">
          <ReferralCodeEntry />
        </div>
      )}
      {data?.referredBy && <p className="referral-fine">You joined with code {data.referredBy}.</p>}
      <Toast trigger={copied} message="Copied" icon={CheckIcon} />
    </div>
  )
}
