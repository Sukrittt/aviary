// Vote math for the ideas board, shared by the server (lib/ideas.ts keeps the
// stored counts in step with idea_votes) and the client (optimistic taps).
// Twin of Mobile/src/lib/ideaVotes.ts.

/** A user's vote on one idea: up, down, or none. */
export type VoteValue = -1 | 0 | 1

export interface VoteCounts {
  up: number
  down: number
  /** Net score, always `up - down`. */
  score: number
}

/** Tapping the arrow you already chose clears your vote; any other tap casts that arrow. */
export function toggleVote(current: VoteValue, tapped: 1 | -1): VoteValue {
  return current === tapped ? 0 : tapped
}

/** How an idea's counts move when one user's vote goes from `prev` to `next`. */
export function voteDelta(prev: VoteValue, next: VoteValue): VoteCounts {
  const up = (next === 1 ? 1 : 0) - (prev === 1 ? 1 : 0)
  const down = (next === -1 ? 1 : 0) - (prev === -1 ? 1 : 0)
  return { up, down, score: up - down }
}

export function applyVote(counts: VoteCounts, prev: VoteValue, next: VoteValue): VoteCounts {
  const d = voteDelta(prev, next)
  return { up: counts.up + d.up, down: counts.down + d.down, score: counts.score + d.score }
}
