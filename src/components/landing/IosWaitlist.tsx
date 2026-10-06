'use client'

import { useState, type FormEvent } from 'react'
import { SuccessButton, useButtonPhase } from '../SuccessButton'
import { track } from '../../lib/analytics'

type Status = 'idle' | 'sending' | 'joined' | 'failed'

export function IosWaitlist() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const button = useButtonPhase()

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
      track('waitlist_joined', { platform: 'ios' })
    } catch {
      setStatus('failed')
      button.fail()
    }
  }

  const joined = status === 'joined'
  return (
    <form className="lp-waitlist" onSubmit={submit}>
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
