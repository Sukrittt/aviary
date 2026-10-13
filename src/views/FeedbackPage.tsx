'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SuccessButton, useButtonPhase } from '../components/SuccessButton'
import { submitFeedback } from '../api/feedback'
import { track } from '../lib/analytics'

/**
 * `/account/feedback`. Twin of Mobile's account/feedback.tsx: a private bug
 * report, posted to app/api/feedback and read at /admin/feedback. Ideas go on
 * the public board at /account/ideas instead.
 */
export function FeedbackPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const canSubmit = title.trim() !== '' && description.trim() !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || saving || success) return
    setError('')
    start()
    try {
      await submitFeedback('bug', title, description)
      track('feedback_sent', { type: 'bug' })
      succeed(() => router.push('/account/help'))
    } catch (err) {
      fail()
      setError(
        err instanceof Error && err.message === 'rate_limited'
          ? "You've sent a few already. Try again later."
          : "Couldn't send that. Check your connection and try again.",
      )
    }
  }

  return (
    <form className="account-card feedback-form" onSubmit={handleSubmit}>
      <label className="erd-log-label" htmlFor="feedback-title">
        Title
      </label>
      <input
        id="feedback-title"
        className="erd-log-input"
        placeholder="What's broken?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <label className="erd-log-label" htmlFor="feedback-description">
        Details
      </label>
      <textarea
        id="feedback-description"
        className="erd-log-input feedback-textarea"
        placeholder="What happened, and what did you expect instead?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={6}
      />
      <p className="recurring-hint">Only our team sees this. Leave out passwords or personal details.</p>

      {error && <p className="erd-log-error">{error}</p>}

      <SuccessButton
        type="submit"
        baseClass="erd-log-submit"
        saving={saving}
        success={success}
        savingLabel="Sending…"
        successLabel="Sent"
        disabled={!canSubmit || saving || success}
      >
        Send report
      </SuccessButton>
    </form>
  )
}
