'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'motion/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDotsIcon, CaretDownIcon, CaretUpIcon, HourglassIcon, LightbulbIcon, SealCheckIcon, SquaresFourIcon, XCircleIcon } from '@/src/components/icons'
import { Select } from '../components/Select'
import { BirdEmptyState } from '../components/BirdEmptyState'
import { LoadingCaption } from '../components/LoadingCaption'
import { FeedbackDialog } from '../components/FeedbackDialog'
import { listIdeas, voteIdea, type Idea, type IdeaSort, type IdeaStatus } from '../api/ideas'
import { applyVote, toggleVote, type VoteValue } from '../lib/ideaVotes'
import { track } from '../lib/analytics'

const STATUS_LABEL: Record<IdeaStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
}

const STATUS_ICON: Record<IdeaStatus, ReactNode> = {
  open: <LightbulbIcon size={16} />,
  planned: <CalendarDotsIcon size={16} />,
  in_progress: <HourglassIcon size={16} />,
  shipped: <SealCheckIcon size={16} />,
  declined: <XCircleIcon size={16} />,
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
  const [pitching, setPitching] = useState(false)
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
          options={[{ value: 'all', label: 'All statuses', icon: <SquaresFourIcon size={16} /> }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], icon: STATUS_ICON[s] }))]}
        />
        <button type="button" className="action-button is-active erd-accent-action ideas-pitch" onClick={() => setPitching(true)}>Pitch an idea</button>
      </div>
      <AnimatePresence>{pitching && <FeedbackDialog kind="idea" onClose={() => setPitching(false)} />}</AnimatePresence>

      {ideas.isError ? (
        <div className="account-card ideas-empty"><p className="account-help-copy">Couldn&apos;t load the board. Check your connection and try again.</p></div>
      ) : ideas.isPending ? (
        <div className="account-card ideas-empty"><LoadingCaption feature="ideas" /></div>
      ) : ideas.data.length === 0 ? (
        <div className="account-card ideas-empty">
          {status ? (
            <BirdEmptyState compact subject="chat" mood="searching" title="Nothing here yet" description={`No ideas are ${STATUS_LABEL[status].toLowerCase()} right now. Try another status.`} />
          ) : (
            <BirdEmptyState compact subject="chat" title="The board's quiet" description="Nobody's pitched an idea yet. Yours could be the first one the flock votes on."
              action={{ label: 'Pitch an idea', onClick: () => setPitching(true) }} />
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
