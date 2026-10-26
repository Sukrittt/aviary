'use client'

import { useState, type FormEvent } from 'react'
import { SuccessButton, useButtonPhase } from '../SuccessButton'
import { track } from '../../lib/analytics'

type Status = 'idle' | 'sending' | 'sent' | 'failed'

/** The salary planner's lead capture: emails the current plan, nothing more unless they ask for tips inside it. */
export function EmailPlan({ salary, rent, intl = false }: { salary: number; rent: number | null; intl?: boolean }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const button = useButtonPhase()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (status === 'sending' || !salary) return
    button.start()
    setStatus('sending')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, salary, rent, ...(intl && { intl }) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('sent')
      button.succeed()
      track('plan_emailed', { placement: intl ? 'tool_paycheck_planner' : 'tool_salary_planner' })
    } catch {
      setStatus('failed')
      button.fail()
    }
  }

  const sent = status === 'sent'
  return (
    <form className="lp-waitlist" onSubmit={submit}>
      <p className="lp-waitlist-title">Want this plan in your inbox?</p>
      <div className="lp-waitlist-row">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          aria-label="Email for your plan"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status !== 'sending') setStatus('idle') }}
          disabled={status === 'sending'}
        />
        <SuccessButton type="submit" baseClass="lp-button lp-button--dark"
          saving={button.saving} success={button.success} savingLabel="Sending…" successLabel="Sent"
          disabled={status === 'sending' || !salary}>
          {sent ? 'Sent' : 'Email me this plan'}
        </SuccessButton>
      </div>
      <p className="lp-waitlist-note" role="status">
        {status === 'failed' ? 'Check your connection and try again.' : sent ? 'Check your inbox. Tips only follow if you ask for them in that email.' : 'One email with your plan. No spam.'}
      </p>
    </form>
  )
}
