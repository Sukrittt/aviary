'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SuccessButton, useButtonPhase } from '../components/SuccessButton'
import { CountedTextarea } from '../components/CountedTextarea'
import { submitFeedback } from '../api/feedback'
import { track } from '../lib/analytics'
import { base64Of, dataUrlFromFile } from '../features/scan-bill/image'
import { ImageSquareIcon, XIcon } from '../components/icons'

/**
 * `/account/feedback`. Twin of Mobile's account/feedback.tsx: a private bug
 * report, posted to app/api/feedback and read at /admin/feedback. Ideas go on
 * the public board at /account/ideas instead.
 */
export function FeedbackPage() {
  const router = useRouter()
  return <BugReportForm onDone={() => router.push('/account/help')} />
}

/** The bug form itself, shared with the feedback button's dialog. `dialog` drops the card chrome. */
export function BugReportForm({ onDone, dialog = false }: { onDone: () => void; dialog?: boolean }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  // A JPEG data URL, downscaled like a bill scan so small text stays legible.
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const canSubmit = title.trim() !== '' && description.trim() !== '' && !reading

  async function handlePick(file: File) {
    setError('')
    setReading(true)
    try {
      setScreenshot(await dataUrlFromFile(file))
    } catch {
      setError("Couldn't read that image. Try another one.")
    } finally {
      setReading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || saving || success) return
    setError('')
    start()
    try {
      await submitFeedback('bug', title, description, screenshot ? { image: base64Of(screenshot), mimeType: 'image/jpeg' } : undefined)
      track('feedback_sent', { type: 'bug', screenshot: !!screenshot })
      succeed(onDone)
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
    <form className={dialog ? 'feedback-form is-dialog' : 'account-card feedback-form'} onSubmit={handleSubmit}>
      <label className="erd-log-label" htmlFor="feedback-title">
        Title
      </label>
      <input
        id="feedback-title"
        className="erd-log-input"
        placeholder="What's broken?"
        maxLength={150}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <label className="erd-log-label" htmlFor="feedback-description">
        Details
      </label>
      <CountedTextarea
        id="feedback-description"
        className="erd-log-input"
        placeholder="What happened, and what did you expect instead?"
        maxLength={2000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={7}
      />
      <p className="recurring-hint">Only our team sees this. Leave out passwords or personal details.</p>

      <div className="erd-log-label">Screenshot (optional)</div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose a screenshot"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handlePick(file)
        }}
      />
      {screenshot ? (
        <div className="erd-photo">
          <div className="erd-photo-frame">
            <a href={screenshot} target="_blank" rel="noreferrer" className="erd-photo-thumb" aria-label="View screenshot">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimize */}
              <img src={screenshot} alt="Your screenshot" />
            </a>
            <button type="button" className="erd-photo-remove" aria-label="Remove screenshot" disabled={saving || success} onClick={() => setScreenshot(null)}>
              <XIcon size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="erd-date-chip" disabled={reading} onClick={() => fileRef.current?.click()}>
          <ImageSquareIcon size={15} aria-hidden="true" />
          {reading ? 'Loading…' : 'Add a screenshot'}
        </button>
      )}
      <p className="recurring-hint">
        Screenshots can show your balances and expenses. Want them hidden? Turn on Hide amounts in your account settings before you take one.
      </p>

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
