// Feedback board. Twin of Mobile/src/api/ideas.ts; the server is app/api/ideas.
import { apiFetch } from './client'
import type { VoteValue } from '../lib/ideaVotes'

export type IdeaStatus = 'open' | 'planned' | 'in_progress' | 'shipped' | 'declined'
export type IdeaSort = 'top' | 'new'

export interface Idea {
  id: string
  title: string
  description: string
  authorFirstName: string | null
  status: IdeaStatus
  up: number
  down: number
  score: number
  createdAt: string
  myVote: VoteValue
  mine: boolean
}

// Bare messages on purpose, like src/api/feedback.ts: callers show their own copy.
export async function listIdeas(sort: IdeaSort, status: IdeaStatus | null): Promise<Idea[]> {
  const params = new URLSearchParams({ sort, ...(status ? { status } : {}) })
  const resp = await apiFetch(`/api/ideas?${params}`)
  if (!resp.ok) throw new Error('failed')
  return (await resp.json()).ideas
}

export async function postIdea(title: string, description: string): Promise<void> {
  const resp = await apiFetch('/api/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim(), description: description.trim() }),
  })
  if (resp.status === 429) throw new Error('rate_limited')
  if (!resp.ok) throw new Error('failed')
}

export async function voteIdea(id: string, value: VoteValue): Promise<{ up: number; down: number; score: number; myVote: VoteValue }> {
  const resp = await apiFetch(`/api/ideas/${encodeURIComponent(id)}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!resp.ok) throw new Error('failed')
  return resp.json()
}
