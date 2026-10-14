'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretDownIcon, CaretUpIcon } from '@/src/components/icons'
import { SuccessButton, useButtonPhase } from '../components/SuccessButton'
import { CountedTextarea } from '../components/CountedTextarea'
import { Select } from '../components/Select'
import { BirdEmptyState } from '../components/BirdEmptyState'
import { listIdeas, postIdea, voteIdea, type Idea, type IdeaSort, type IdeaStatus } from '../api/ideas'
import { applyVote, toggleVote, type VoteValue } from '../lib/ideaVotes'
import { track } from '../lib/analytics'

const STATUS_LABEL: Record<IdeaStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}
const STATUSES = Object.keys(STATUS_LABEL) as IdeaStatus[]

/**
 * `/account/ideas`. Twin of Mobile's account/ideas.tsx: the public feedback
 * board, behind the same sign-in as the rest of the app. Bug reports stay
 * private on /account/feedback.
 */
export function IdeasBoardPage() {
  const [sort, setSort] = useState<IdeaSort>('top')
  const [status, setStatus] = useState<IdeaStatus | null>(null)
  const queryClient = useQueryClient()
  const key = ['ideas', sort, status] as const
  const ideas = useQuery({ queryKey: key, queryFn: () => listIdeas(sort, status) })

  const vote = useMutation({
    mutationFn: ({ id, value }: { id: string; value: VoteValue }) => voteIdea(id, value),
    // One at a time, in tap order: parallel requests could land out of order
    // and save an earlier tap over the last one.
    mutationKey: ['idea-vote'],
    scope: { id: 'idea-vote' },
    onSuccess: (_result, { value }) => track('idea_voted', { value }),
    // Refetch once the last queued vote lands. Sooner would overwrite the
    // optimistic state of taps still waiting their turn. (The settling vote
    // still counts here.)
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['idea-vote'] }) <= 1) queryClient.invalidateQueries({ queryKey: ['ideas'] })
    },
  })

  function tap(idea: Idea, arrow: 1 | -1) {
    const next = toggleVote(idea.myVote, arrow)
    // A refetch already in flight would land on top of this tap.
    queryClient.cancelQueries({ queryKey: ['ideas'] })
    queryClient.setQueryData<Idea[]>(key, (rows) =>
      rows?.map((r) => (r.id === idea.id ? { ...r, ...applyVote(r, r.myVote, next), myVote: next } : r)),
    )
    vote.mutate({ id: idea.id, value: next })
  }

  return (
    <div className="ideas-board">
      <div>
        <h1 className="account-row-label">Feedback board</h1>
        <p className="account-help-copy">Post an idea or vote on what we build next. Found a bug? <Link href="/account/feedback">Report it privately</Link>.</p>
      </div>

      <IdeaForm onPosted={() => queryClient.invalidateQueries({ queryKey: ['ideas'] })} />

      <div className="ideas-toolbar">
        <div className="account-segmented" role="group" aria-label="Sort">
          <button type="button" className={sort === 'top' ? 'is-active' : ''} onClick={() => setSort('top')}>Top</button>
          <button type="button" className={sort === 'new' ? 'is-active' : ''} onClick={() => setSort('new')}>New</button>
        </div>
        <Select
          className="ideas-status-select"
          aria-label="Status"
          value={status ?? 'all'}
          onChange={(v) => setStatus(v === 'all' ? null : (v as IdeaStatus))}
          options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
        />
      </div>

      {ideas.isError ? (
        <div className="account-card ideas-empty"><p className="account-help-copy">Couldn&apos;t load the board. Check your connection and try again.</p></div>
      ) : ideas.isPending ? (
        <div className="account-card ideas-empty"><p className="account-help-copy">Loading ideas…</p></div>
      ) : ideas.data.length === 0 ? (
        <div className="account-card ideas-empty">
          {status ? (
            <BirdEmptyState compact subject="chat" mood="searching" title="Nothing here yet" description={`No ideas are ${STATUS_LABEL[status].toLowerCase()} right now. Try another status.`} />
          ) : (
            <BirdEmptyState compact subject="chat" title="The board's quiet" description="Nobody's pitched an idea yet. Yours could be the first one the flock votes on."
              action={{ label: 'Pitch an idea', onClick: () => document.getElementById('idea-title')?.focus() }} />
          )}
        </div>
      ) : (
        <ul className="ideas-list">
          {ideas.data.map((idea) => (
            <li key={idea.id} className="account-card ideas-row">
              <div className="ideas-vote" role="group" aria-label={`Votes, score ${idea.score}`}>
                <button type="button" className={idea.myVote === 1 ? 'is-on' : ''} aria-pressed={idea.myVote === 1} aria-label="Upvote" onClick={() => tap(idea, 1)}>
                  <CaretUpIcon size={18} aria-hidden="true" />
                </button>
                <span className="ideas-score">{idea.score}</span>
                <button type="button" className={idea.myVote === -1 ? 'is-on is-down' : ''} aria-pressed={idea.myVote === -1} aria-label="Downvote" onClick={() => tap(idea, -1)}>
                  <CaretDownIcon size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="ideas-body">
                <div className="ideas-title">{idea.title}</div>
                {idea.description && <p className="ideas-description">{idea.description}</p>}
                <div className="ideas-meta">
                  <span className={`ideas-status is-${idea.status}`}>{STATUS_LABEL[idea.status]}</span>
                  <span>{idea.mine ? 'You' : idea.authorFirstName ?? 'Someone'}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The post-an-idea form, shared with the feedback button's dialog. `dialog` drops the card chrome. */
export function IdeaForm({ onPosted, onDone, dialog = false }: { onPosted: () => void; onDone?: () => void; dialog?: boolean }) {
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
      succeed(() => {
        setTitle('')
        setDescription('')
        onDone?.()
      })
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
    <form className={dialog ? 'feedback-form is-dialog' : 'account-card feedback-form'} onSubmit={handleSubmit}>
      <label className="erd-log-label" htmlFor="idea-title">Your idea</label>
      <input id="idea-title" className="erd-log-input" placeholder="What would make Aviary better?" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={dialog} />
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
