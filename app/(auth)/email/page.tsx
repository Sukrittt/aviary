'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@/src/lib/analytics'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmailPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setPending(true)
    setError('')
    track('sign_in_started', { method: 'email' })
    const res = await fetch('/api/auth/magic-auth/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setPending(false)
    if (!res.ok) {
      track('sign_in_failed', { method: 'email', reason: 'code_send_failed' })
      setError('Could not send code. Check the address and try again.')
      return
    }
    track('sign_in_code_sent')
    router.push(`/code?email=${encodeURIComponent(email)}`)
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <button type="button" className="auth-back" aria-label="Back" onClick={() => router.push('/sign-in')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="auth-headline">What&apos;s your email?</h1>
      </div>
      <p className="auth-subhead">We&apos;ll send a 6-digit code. If you&apos;re new, this creates your account.</p>

      <form className="auth-actions" onSubmit={sendCode}>
        <input
          className="auth-field"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {error ? <div className="auth-field-error">{error}</div> : null}
        <button type="submit" className="auth-btn auth-btn--primary" disabled={pending}>
          {pending ? 'Sending…' : 'Send code'}
        </button>
      </form>
    </div>
  )
}
