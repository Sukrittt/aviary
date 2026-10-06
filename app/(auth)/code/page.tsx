'use client'

import { Suspense, useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { track } from '@/src/lib/analytics'

function CodeForm() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [resent, setResent] = useState(false)

  async function verifyCode(codeToVerify: string) {
    setPending(true)
    setError('')
    const res = await fetch('/api/auth/magic-auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: codeToVerify }),
    }).catch(() => null)
    setPending(false)
    if (!res?.ok) {
      track('sign_in_failed', { method: 'email', reason: res ? 'wrong_code' : 'network' })
      setError('Wrong or expired code.')
      setCode('')
      // New key on the boxes row replays the shake/drop on every failure.
      setAttempt((a) => a + 1)
      return
    }
    track('sign_in_completed', { method: 'email' })
    setDone(true)
    // Full navigation: AuthKitProvider and the rest of the app read the
    // session cookie fresh, same as the old AuthGate's post-verify reload.
    // Delay lets the success animation play, matching mobile's 1100ms.
    setTimeout(() => {
      window.location.href = '/expense'
    }, 1100)
  }

  async function resend() {
    setResent(false)
    setError('')
    const res = await fetch('/api/auth/magic-auth/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) setResent(true)
    else setError('Could not resend the code. Try again in a moment.')
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <button
          type="button"
          className="auth-back"
          aria-label="Back"
          onClick={() => router.push(`/email`)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="auth-headline">Check your inbox</h1>
      </div>
      <p className="auth-subhead">
        Code sent to <strong>{email || 'your email'}</strong>
      </p>

      <form
        className="auth-actions"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (code.length === 6 && !pending && !done) void verifyCode(code)
        }}
      >
        <div
          key={attempt}
          className={`auth-code-boxes${error ? ' is-bad' : ''}${done ? ' is-ok' : ''}`}
        >
          {/* One real input stretched over the boxes keeps paste, SMS/email
              autofill and screen readers working; the boxes are visual only. */}
          <input
            className="auth-code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            maxLength={6}
            value={code}
            disabled={pending || done}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(next)
              if (next) setError('')
              if (next.length === 6) void verifyCode(next)
            }}
            autoFocus
          />
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className={`auth-code-box${code[i] ? ' is-filled' : ''}${i === code.length && !error && !done ? ' is-active' : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              {code[i] ?? ''}
            </div>
          ))}
        </div>
        {done ? (
          <div className="auth-verified" role="status">
            <span className="auth-verified-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            Code verified. Signing you in…
          </div>
        ) : (
          <>
            {error ? <div className="auth-field-error" role="alert">{error}</div> : null}
            <button type="button" className="auth-resend" onClick={resend}>
              {resent ? 'Code resent.' : "Didn't get it? Resend code"}
            </button>
            <button type="submit" className="auth-btn auth-btn--primary" disabled={pending || code.length < 6}>
              {pending ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}

export default function CodePage() {
  return (
    <Suspense fallback={<div className="auth-card" />}>
      <CodeForm />
    </Suspense>
  )
}
