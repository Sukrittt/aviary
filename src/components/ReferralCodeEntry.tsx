'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { APPLIED_COPY, APPLY_ERROR_COPY, applyReferralCode, type ReferralSummary } from '../api/referrals'

/** "Got a code from a friend?": a friend's or a creator's code, in the first 7 days. */
export function ReferralCodeEntry({ onApplied }: { onApplied?: () => void }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    const err = await applyReferralCode(code.trim())
    setBusy(false)
    setMessage(err ? { ok: false, text: APPLY_ERROR_COPY[err] } : { ok: true, text: APPLIED_COPY })
    if (!err) {
      // Patch, don't refetch: a fresh summary says canEnterCode false, and the
      // screen would drop this form along with its confirmation.
      queryClient.setQueryData<ReferralSummary>(['referrals'], (d) => d && { ...d, referredBy: code.trim() })
      onApplied?.()
    }
  }

  if (message?.ok) return <p className="referral-entry-msg is-ok" role="status">{message.text}</p>
  return (
    <form className="referral-entry" onSubmit={submit}>
      <label className="referral-entry-label" htmlFor="referral-code">Got a code from a friend?</label>
      <div className="referral-entry-row">
        <input
          id="referral-code"
          className="referral-entry-input"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)); setMessage(null) }}
          placeholder="Code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={message ? !message.ok : undefined}
          aria-describedby={message ? 'referral-code-msg' : undefined}
        />
        <button type="submit" className="account-pill-btn" disabled={busy || code.length < 3}>{busy ? 'Applying…' : 'Apply'}</button>
      </div>
      {message && <p id="referral-code-msg" className="referral-entry-msg is-error" role="alert">{message.text}</p>}
    </form>
  )
}
