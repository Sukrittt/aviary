'use client'

import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { track } from '../../lib/analytics'

type Status = 'idle' | 'sending' | 'joined' | 'failed'

export function IosWaitlist() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, platform: 'ios' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('joined')
      track('waitlist_joined', { platform: 'ios' })
    } catch {
      setStatus('failed')
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
          disabled={joined}
        />
        <button type="submit" className={`lp-button lp-button--dark${joined ? ' is-joined' : ''}`} disabled={status === 'sending' || joined}>
          {joined ? <><Check size={18} aria-hidden="true" />You’re on the list</> : status === 'sending' ? 'Joining…' : 'Join the iPhone waitlist'}
        </button>
      </div>
      <p className="lp-waitlist-note" role="status">
        {status === 'failed' ? 'Check your connection and try again.' : 'We’ll email you once when it’s out. No spam.'}
      </p>
    </form>
  )
}
