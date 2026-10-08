'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { SuccessButton, useButtonPhase } from '../SuccessButton'
import { track } from '../../lib/analytics'

type Status = 'idle' | 'sending' | 'joined' | 'failed'

// Set once this browser has joined. The API answers repeat signups the same as
// new ones (so the list can't be probed), which left a reload free to join and
// report `waitlist_joined` again. Remembering it here shows the joined state instead.
export const JOINED_KEY = 'aviary:ios-waitlist-joined'

export function IosWaitlist({ placement = 'footer_cta', className = '' }: { placement?: string; className?: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const button = useButtonPhase()

  useEffect(() => {
    try { if (localStorage.getItem(JOINED_KEY)) setStatus('joined') } catch { /* storage blocked: the form just works as new */ }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (status === 'sending' || status === 'joined') return
    button.start()
    setStatus('sending')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, platform: 'ios' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('joined')
      button.succeed()
      track('waitlist_joined', { waitlist_platform: 'ios', placement })
      try { localStorage.setItem(JOINED_KEY, '1') } catch { /* storage blocked */ }
    } catch {
      setStatus('failed')
      button.fail()
    }
  }

  const joined = status === 'joined'
  return (
    <form className={`lp-waitlist ${className}`.trim()} onSubmit={submit}>
      <p className="lp-waitlist-title">On iPhone? The app’s on its way.</p>
      <div className="lp-waitlist-row">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          aria-label="Email for the iPhone waitlist"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === 'failed') setStatus('idle') }}
          disabled={joined || status === 'sending'}
        />
        <SuccessButton type="submit" baseClass="lp-button lp-button--dark" className={joined ? 'is-joined' : ''}
          saving={button.saving} success={button.success} savingLabel="Joining…" successLabel="You’re on the list"
          aria-label={joined ? 'You’re on the list' : undefined} disabled={status === 'sending' || joined}>
          {joined ? 'You’re on the list' : 'Join the iPhone waitlist'}
        </SuccessButton>
      </div>
      <p className="lp-waitlist-note" role="status">
        {status === 'failed' ? 'Check your connection and try again.' : 'We’ll email you once when it’s out. No spam.'}
      </p>
    </form>
  )
}
