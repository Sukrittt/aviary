'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { SuccessButton, useButtonPhase } from '../SuccessButton'
import { track } from '../../lib/analytics'

type Status = 'idle' | 'sending' | 'joined' | 'failed'

// Set once this browser has joined. The API answers repeat signups the same as
// new ones (so the list can't be probed), which left a reload free to join and
// report `waitlist_joined` again. Remembering it here shows the joined state instead.
export const JOINED_KEY = 'aviary:ios-waitlist-joined'

/** `knownEmail` (signed-in web app) skips the email field and joins with that address. */
export function IosWaitlist({ placement = 'footer_cta', className = '', buttonClass = 'lp-button lp-button--dark', knownEmail }: { placement?: string; className?: string; buttonClass?: string; knownEmail?: string }) {
  const [typed, setEmail] = useState('')
  const email = knownEmail || typed
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
      <p className="lp-waitlist-title">Not on iPhone yet. We’ll tell you the day it lands.</p>
      <div className="lp-waitlist-row">
        {!knownEmail && <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          aria-label="Email for the iPhone waitlist"
          value={typed}
          onChange={(e) => { setEmail(e.target.value); if (status === 'failed') setStatus('idle') }}
          disabled={joined || status === 'sending'}
        />}
        <SuccessButton type="submit" baseClass={buttonClass} className={joined ? 'is-joined' : ''}
          saving={button.saving} success={button.success} savingLabel="Joining…" successLabel="You’re on the list"
          aria-label={joined ? 'You’re on the list' : undefined} disabled={status === 'sending' || joined}>
          {joined ? 'You’re on the list' : 'Join the iPhone waitlist'}
        </SuccessButton>
      </div>
      <p className="lp-waitlist-note" role="status">
        {status === 'failed' ? 'Check your connection and try again.' : knownEmail ? `We’ll email ${knownEmail} once when it’s out. No spam.` : 'We’ll email you once when it’s out. No spam.'}
      </p>
    </form>
  )
}
