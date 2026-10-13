import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
vi.mock('server-only', () => ({}))

import { getClient, getDb } from './mongodb'
import { castVote, createIdea, deleteIdea, IDEA_VOTES, IDEAS, listIdeas, purgeUserIdeas, setIdeaHidden, type IdeaDoc } from './ideas'

let server: MongoMemoryReplSet

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  process.env.MONGODB_URI = server.getUri('ideas-test')
  const db = await getDb()
  await db.collection(IDEA_VOTES).createIndex({ ideaId: 1, user_id: 1 }, { unique: true })
  await db.collection('users').insertMany([
    { _id: 'user_a', email: 'a@example.com', name: 'Asha Rao' },
    { _id: 'user_b', email: 'b@example.com', name: null, firstName: 'Ben', lastName: 'Lee' },
  ] as never)
}, 120_000)

afterAll(async () => {
  if (server) {
    await (await getClient()).close()
    await server.stop()
  }
  delete process.env.MONGODB_URI
})

beforeEach(async () => {
  const db = await getDb()
  await db.collection(IDEAS).deleteMany({})
  await db.collection(IDEA_VOTES).deleteMany({})
})

/** The idea's stored counters next to a recount of its actual vote rows. */
async function countsVsVotes(ideaId: string) {
  const db = await getDb()
  const idea = (await db.collection<IdeaDoc>(IDEAS).findOne({}))!
  const votes = await db.collection(IDEA_VOTES).find({ ideaId: idea._id }).toArray()
  const up = votes.filter((v) => v.value === 1).length
  const down = votes.filter((v) => v.value === -1).length
  expect(String(idea._id)).toBe(ideaId)
  return { stored: { up: idea.up, down: idea.down, score: idea.score }, actual: { up, down, score: up - down } }
}

describe('ideas', () => {
  it('stores only the author first name, starting at a zero score', async () => {
    await createIdea('user_a', 'Split bills', 'With my flatmates')
    await createIdea('user_b', 'Dark charts', '')
    const ideas = await listIdeas('user_a', { sort: 'new' })
    expect(ideas.map((i) => i.authorFirstName)).toEqual(['Ben', 'Asha'])
    expect(ideas[1]).toMatchObject({ title: 'Split bills', status: 'open', up: 0, down: 0, score: 0, myVote: 0, mine: true })
    expect(ideas[0].mine).toBe(false)
    expect(ideas[0]).not.toHaveProperty('user_id')
  })

  it('upvotes, switches, and clears a vote, keeping counts in step', async () => {
    const { id } = await createIdea('user_a', 'Split bills', '')
    expect(await castVote(id, 'user_b', 1)).toEqual({ up: 1, down: 0, score: 1, myVote: 1 })
    expect(await castVote(id, 'user_b', -1)).toEqual({ up: 0, down: 1, score: -1, myVote: -1 })
    expect(await castVote(id, 'user_a', -1)).toEqual({ up: 0, down: 2, score: -2, myVote: -1 })
    expect(await castVote(id, 'user_b', 0)).toEqual({ up: 0, down: 1, score: -1, myVote: 0 })
    expect(await castVote(id, 'user_b', 0)).toEqual({ up: 0, down: 1, score: -1, myVote: 0 })
    const [idea] = await listIdeas('user_a', { sort: 'top' })
    expect(idea.myVote).toBe(-1)
  })

  it('keeps counts equal to the vote rows under concurrent taps from one user', async () => {
    const { id } = await createIdea('user_a', 'Split bills', '')
    const taps = [1, -1, 0, 1, 1, -1, 0, -1, 1, 0, 1, -1] as const
    await Promise.all(taps.map((v) => castVote(id, 'user_b', v)))
    const { stored, actual } = await countsVsVotes(id)
    expect(stored).toEqual(actual)
  })

  it('keeps counts equal to the vote rows under concurrent taps from many users', async () => {
    const { id } = await createIdea('user_a', 'Split bills', '')
    await Promise.all(Array.from({ length: 20 }, (_, i) => castVote(id, `user_${i % 5}`, i % 3 === 0 ? -1 : 1)))
    const { stored, actual } = await countsVsVotes(id)
    expect(stored).toEqual(actual)
  })

  it('sorts top by score, then newest', async () => {
    const a = await createIdea('user_a', 'A', '')
    const b = await createIdea('user_a', 'B', '')
    const c = await createIdea('user_a', 'C', '')
    await castVote(a.id, 'user_b', 1)
    await castVote(c.id, 'user_b', -1)
    expect((await listIdeas('user_a', { sort: 'top' })).map((i) => i.id)).toEqual([a.id, b.id, c.id])
    expect((await listIdeas('user_a', { sort: 'new' })).map((i) => i.id)).toEqual([c.id, b.id, a.id])
  })

  it('filters by status and leaves hidden ideas off the board and unvotable', async () => {
    const a = await createIdea('user_a', 'A', '')
    await createIdea('user_a', 'B', '')
    await setIdeaHidden(a.id, true)
    expect((await listIdeas('user_a', { sort: 'new' })).map((i) => i.title)).toEqual(['B'])
    expect(await listIdeas('user_a', { sort: 'new', status: 'shipped' })).toEqual([])
    expect(await castVote(a.id, 'user_b', 1)).toBeNull()
    expect(await castVote('not-an-id', 'user_b', 1)).toBeNull()
  })

  it('deletes an idea with its votes', async () => {
    const { id } = await createIdea('user_a', 'A', '')
    await castVote(id, 'user_b', 1)
    await deleteIdea(id)
    const db = await getDb()
    expect(await db.collection(IDEAS).countDocuments()).toBe(0)
    expect(await db.collection(IDEA_VOTES).countDocuments()).toBe(0)
  })

  it("purges a user's ideas and votes, taking their votes off other ideas", async () => {
    const mine = await createIdea('user_b', 'Mine', '')
    const theirs = await createIdea('user_a', 'Theirs', '')
    await castVote(mine.id, 'user_a', 1)
    await castVote(theirs.id, 'user_b', 1)
    await castVote(theirs.id, 'user_a', 1)
    await purgeUserIdeas(await getDb(), 'user_b')
    const ideas = await listIdeas('user_a', { sort: 'top' })
    expect(ideas).toEqual([expect.objectContaining({ id: theirs.id, up: 1, score: 1 })])
    expect(await (await getDb()).collection(IDEA_VOTES).countDocuments()).toBe(1)
  })
})
