import { describe, it, expect } from 'vitest'
import { applyVote, toggleVote, voteDelta, type VoteValue } from './ideaVotes'

const VALUES: VoteValue[] = [-1, 0, 1]

describe('toggleVote', () => {
  it('casts the tapped arrow when there is no vote yet', () => {
    expect(toggleVote(0, 1)).toBe(1)
    expect(toggleVote(0, -1)).toBe(-1)
  })

  it('removes the vote when the same arrow is tapped again', () => {
    expect(toggleVote(1, 1)).toBe(0)
    expect(toggleVote(-1, -1)).toBe(0)
  })

  it('switches the vote when the other arrow is tapped', () => {
    expect(toggleVote(1, -1)).toBe(-1)
    expect(toggleVote(-1, 1)).toBe(1)
  })
})

describe('voteDelta', () => {
  it('is zero when the vote does not change', () => {
    for (const v of VALUES) expect(voteDelta(v, v)).toEqual({ up: 0, down: 0, score: 0 })
  })

  it('adds and removes an upvote', () => {
    expect(voteDelta(0, 1)).toEqual({ up: 1, down: 0, score: 1 })
    expect(voteDelta(1, 0)).toEqual({ up: -1, down: 0, score: -1 })
  })

  it('adds and removes a downvote', () => {
    expect(voteDelta(0, -1)).toEqual({ up: 0, down: 1, score: -1 })
    expect(voteDelta(-1, 0)).toEqual({ up: 0, down: -1, score: 1 })
  })

  it('switches sides in one step, moving the score by two', () => {
    expect(voteDelta(1, -1)).toEqual({ up: -1, down: 1, score: -2 })
    expect(voteDelta(-1, 1)).toEqual({ up: 1, down: -1, score: 2 })
  })

  it('keeps score equal to up minus down for every transition', () => {
    for (const a of VALUES)
      for (const b of VALUES) {
        const d = voteDelta(a, b)
        expect(d.score).toBe(d.up - d.down)
      }
  })

  it('telescopes: any chain of votes nets out to the last one', () => {
    const chain: VoteValue[] = [0, 1, -1, -1, 0, 1, 1, -1, 0, 1]
    const total = { up: 0, down: 0, score: 0 }
    for (let i = 1; i < chain.length; i++) {
      const d = voteDelta(chain[i - 1], chain[i])
      total.up += d.up
      total.down += d.down
      total.score += d.score
    }
    expect(total).toEqual(voteDelta(0, 1))
  })
})

describe('applyVote', () => {
  it('updates the counts for an optimistic tap', () => {
    expect(applyVote({ up: 3, down: 1, score: 2 }, 0, 1)).toEqual({ up: 4, down: 1, score: 3 })
    expect(applyVote({ up: 3, down: 1, score: 2 }, 1, -1)).toEqual({ up: 2, down: 2, score: 0 })
    expect(applyVote({ up: 3, down: 1, score: 2 }, -1, 0)).toEqual({ up: 3, down: 0, score: 3 })
  })
})
