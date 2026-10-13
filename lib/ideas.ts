import { ObjectId, type Db, type Filter, type Sort } from 'mongodb'
import { getDb, withTx } from './mongodb'
import { displayName, type UserDoc } from './users'
import { voteDelta, type VoteCounts, type VoteValue } from '@/src/lib/ideaVotes'

// The public ideas board. Unlike bug reports (lib/feedback.ts, private to
// /admin/feedback), ideas are visible to every signed-in user as soon as
// they're posted; the admin hides or deletes spam afterwards.

export const IDEAS = 'ideas'
export const IDEA_VOTES = 'idea_votes'

export const IDEA_STATUSES = ['open', 'planned', 'in_progress', 'shipped', 'declined'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]
export type IdeaSort = 'top' | 'new'

export interface IdeaDoc extends VoteCounts {
  _id: ObjectId
  title: string
  description: string
  user_id: string
  /** Snapshot at posting time. The board never shows more of the author than this. */
  authorFirstName: string | null
  status: IdeaStatus
  hidden: boolean
  createdAt: Date
}

/** One row per user per idea (unique on ideaId + user_id). No row means no vote. */
export interface IdeaVoteDoc {
  ideaId: ObjectId
  user_id: string
  value: 1 | -1
  at: Date
}

/** What the board API returns: no user ids, plus the caller's own vote. */
export interface PublicIdea extends VoteCounts {
  id: string
  title: string
  description: string
  authorFirstName: string | null
  status: IdeaStatus
  createdAt: string
  myVote: VoteValue
  mine: boolean
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return (IDEA_STATUSES as readonly unknown[]).includes(value)
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null
}

async function collections() {
  const db = await getDb()
  return { db, ideas: db.collection<IdeaDoc>(IDEAS), votes: db.collection<IdeaVoteDoc>(IDEA_VOTES) }
}

// ponytail: one capped page, no pagination. Add a cursor when the board outgrows it.
const LIST_LIMIT = 200

export async function listIdeas(userId: string, opts: { sort: IdeaSort; status?: IdeaStatus }): Promise<PublicIdea[]> {
  const { ideas, votes } = await collections()
  const filter: Filter<IdeaDoc> = { hidden: false, ...(opts.status ? { status: opts.status } : {}) }
  const sort: Sort = opts.sort === 'top' ? { score: -1, createdAt: -1 } : { createdAt: -1 }
  const rows = await ideas.find(filter).sort(sort).limit(LIST_LIMIT).toArray()
  const mine = await votes.find({ user_id: userId, ideaId: { $in: rows.map((r) => r._id) } }).toArray()
  const myVotes = new Map(mine.map((v) => [String(v.ideaId), v.value]))
  return rows.map((r) => ({
    id: String(r._id),
    title: r.title,
    description: r.description,
    authorFirstName: r.authorFirstName,
    status: r.status,
    up: r.up,
    down: r.down,
    score: r.score,
    createdAt: r.createdAt.toISOString(),
    myVote: myVotes.get(String(r._id)) ?? 0,
    mine: r.user_id === userId,
  }))
}

export async function createIdea(userId: string, title: string, description: string): Promise<{ id: string }> {
  const { db, ideas } = await collections()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { name: 1, firstName: 1, lastName: 1 } })
  const authorFirstName = (user && displayName(user)?.split(/\s+/)[0]) || null
  const { insertedId } = await ideas.insertOne({
    _id: new ObjectId(),
    title,
    description,
    user_id: userId,
    authorFirstName,
    status: 'open',
    up: 0,
    down: 0,
    score: 0,
    hidden: false,
    createdAt: new Date(),
  })
  return { id: String(insertedId) }
}

/**
 * Sets one user's vote on a visible idea (`value` 0 clears it) and moves the
 * idea's counters by exactly the difference from their previous vote. Both
 * writes share a transaction, so concurrent taps serialize on the vote row
 * (write conflicts retry) and the counters always equal a recount of the
 * vote rows. Null when the idea is missing or hidden (`includeHidden` is
 * for the account purge, which must clear votes on hidden ideas too).
 */
export async function castVote(
  ideaId: string,
  userId: string,
  value: VoteValue,
  { includeHidden = false } = {},
): Promise<(VoteCounts & { myVote: VoteValue }) | null> {
  const _id = toObjectId(ideaId)
  if (!_id) return null
  for (let attempt = 0; ; attempt++) {
    try {
      return await writeVote(_id, userId, value, includeHidden)
    } catch (err) {
      // Two first votes from one user racing (two devices) can both try to
      // insert the row; the loser gets E11000 rather than a retried write
      // conflict. Once more sees the winner's row and moves on from it.
      if ((err as { code?: number }).code !== 11000 || attempt > 0) throw err
    }
  }
}

async function writeVote(_id: ObjectId, userId: string, value: VoteValue, includeHidden: boolean) {
  const { ideas, votes } = await collections()
  return withTx(async (session) => {
    const idea = await ideas.findOne(includeHidden ? { _id } : { _id, hidden: false }, { session })
    if (!idea) return null
    const key = { ideaId: _id, user_id: userId }
    const prev =
      value === 0
        ? await votes.findOneAndDelete(key, { session })
        : await votes.findOneAndUpdate(key, { $set: { value, at: new Date() } }, { upsert: true, returnDocument: 'before', session })
    const d = voteDelta(prev?.value ?? 0, value)
    const after = await ideas.findOneAndUpdate({ _id }, { $inc: { up: d.up, down: d.down, score: d.score } }, { returnDocument: 'after', session })
    return { up: after!.up, down: after!.down, score: after!.score, myVote: value }
  })
}

export async function setIdeaStatus(ideaId: string, status: IdeaStatus): Promise<boolean> {
  const _id = toObjectId(ideaId)
  if (!_id) return false
  const { ideas } = await collections()
  return (await ideas.updateOne({ _id }, { $set: { status } })).matchedCount === 1
}

export async function setIdeaHidden(ideaId: string, hidden: boolean): Promise<boolean> {
  const _id = toObjectId(ideaId)
  if (!_id) return false
  const { ideas } = await collections()
  return (await ideas.updateOne({ _id }, { $set: { hidden } })).matchedCount === 1
}

export async function deleteIdea(ideaId: string): Promise<boolean> {
  const _id = toObjectId(ideaId)
  if (!_id) return false
  const { ideas, votes } = await collections()
  return withTx(async (session) => {
    await votes.deleteMany({ ideaId: _id }, { session })
    return (await ideas.deleteOne({ _id }, { session })).deletedCount === 1
  })
}

/**
 * Account purge: removes the user's ideas (and every vote on them) and takes
 * their votes back off everyone else's ideas, so the counters stay true.
 * Returns the rows removed.
 */
export async function purgeUserIdeas(db: Db, userId: string): Promise<number> {
  const ideas = db.collection<IdeaDoc>(IDEAS)
  const votes = db.collection<IdeaVoteDoc>(IDEA_VOTES)
  const own = await ideas.find({ user_id: userId }, { projection: { _id: 1 } }).toArray()
  const ownIds = own.map((i) => i._id)
  let rows = (await votes.deleteMany({ ideaId: { $in: ownIds } })).deletedCount
  rows += (await ideas.deleteMany({ _id: { $in: ownIds } })).deletedCount
  for (const v of await votes.find({ user_id: userId }).toArray()) {
    await castVote(String(v.ideaId), userId, 0, { includeHidden: true })
    rows++
  }
  return rows
}
