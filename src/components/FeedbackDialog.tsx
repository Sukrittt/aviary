'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Scrim, Sheet } from './MotionSheet'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { CountedTextarea } from './CountedTextarea'
import { BugReportForm } from '../views/FeedbackPage'
import { postIdea } from '../api/ideas'
import { track } from '../lib/analytics'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import './FeedbackDialog.css'

export type FeedbackKind = 'idea' | 'bug'

/** The idea or bug form in a dialog, from the feedback button and the board. Render inside <AnimatePresence>. */
export function FeedbackDialog({ kind, onClose }: { kind: FeedbackKind; onClose: () => void }) {
  const queryClient = useQueryClient()
  const onBoard = usePathname() === FEEDBACK_BOARD_PATH
  const title = kind === 'idea' ? 'Share an idea' : 'Report a bug'
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card feedback-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <h3 className="archive-confirm-title">{title}</h3>
        {kind === 'idea' ? (
          <>
            <p className="account-row-meta">
              Post it here and the flock votes on what we build next.
              {!onBoard && <> <Link href={FEEDBACK_BOARD_PATH} onClick={onClose}>Peek at the board</Link></>}
            </p>
            <IdeaForm onPosted={() => queryClient.invalidateQueries({ queryKey: ['ideas'] })} onDone={onClose} />
          </>
        ) : (
          <BugReportForm dialog onDone={onClose} />
        )}
      </Sheet>
    </Scrim>
  )
}

function IdeaForm({ onPosted, onDone }: { onPosted: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const canSubmit = title.trim() !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || saving || success) return
    setError('')
    start()
    try {
      await postIdea(title, description)
      track('idea_posted')
      onPosted()
      succeed(onDone)
    } catch (err) {
      fail()
      setError(
        err instanceof Error && err.message === 'rate_limited'
          ? "You've posted a few already. Try again later."
          : "Couldn't post that. Check your connection and try again.",
      )
    }
  }

  return (
    <form className="feedback-form is-dialog" onSubmit={handleSubmit}>
      <label className="erd-log-label" htmlFor="idea-title">Your idea</label>
      <input id="idea-title" className="erd-log-input" placeholder="What would make Aviary better?" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <label className="erd-log-label" htmlFor="idea-description">Details (optional)</label>
      <CountedTextarea id="idea-description" className="erd-log-input" placeholder="Why would it help you?" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
      <p className="recurring-hint">Everyone on the board sees your idea and your first name.</p>
      {error && <p className="erd-log-error">{error}</p>}
      <SuccessButton type="submit" baseClass="erd-log-submit" saving={saving} success={success} savingLabel="Posting…" successLabel="Posted" disabled={!canSubmit || saving || success}>
        Post idea
      </SuccessButton>
    </form>
  )
}
