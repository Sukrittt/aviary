/**
 * Budgets ("spaces" in code: the `budgets` collection already holds the
 * monthly assignment rows). A person can open several budgets, and a budget
 * can have several members.
 *
 * No data migration: everyone's first budget is the implicit one whose id is
 * their own user id. Every existing row's `user_id` already equals it, and so
 * does the encrypted-field AAD, so nothing is re-keyed or re-encrypted. A
 * `spaces` doc for it is only written once it needs one (a name, a member).
 * A new budget gets its own id, which `scoped()` writes into the same
 * `user_id` field. That field now means "budget key".
 */
import type { Db } from 'mongodb'
import { getDb } from './mongodb'
import type { Auth } from './access'

export const SPACES = 'spaces'
export const SPACE_MEMBERS = 'space_members'
export const SPACE_INVITES = 'space_invites'

/** Mobile sends the active budget in this header; web keeps it in the cookie below. */
export const BUDGET_HEADER = 'x-aviary-budget'
export const BUDGET_COOKIE = 'aviary-budget'

export type SpaceRole = 'owner' | 'member'

export interface SpaceDoc {
  /** The owner's user id for their first budget, otherwise a fresh ObjectId hex. */
  _id: string
  name: string
  emoji: string
  owner_id: string
  currencyCode?: string
  onboardedAt?: string | null
  deleted_at: string | null
  created_at: string
}

export interface SpaceMemberDoc {
  space_id: string
  user_id: string
  role: SpaceRole
  joined_at: string
  /** "Tell me when others log". Off by default. */
  notify_others: boolean
}

export interface SpaceInviteDoc {
  space_id: string
  code: string
  created_by: string
  expires_at: string
  status: 'pending' | 'accepted' | 'cancelled'
}

export type SpaceAccess =
  | { spaceId: string; ownerId: string; role: SpaceRole; denied?: undefined }
  | { spaceId: string; denied: true }

// Budget ids are user ids (`user_…`) or ObjectId hex. Anything else is junk
// and never reaches a query.
const SPACE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The budget a request asks for, or null when it names none (every app
 * version before budgets). Returned as sent: a malformed value must be
 * denied, never read as "no budget", or a write meant for a shared budget
 * would land in the caller's personal one.
 */
export function requestedSpaceId(req: Request): string | null {
  const header = req.headers.get(BUDGET_HEADER)?.trim()
  if (header) return header
  const cookie = /(?:^|;\s*)aviary-budget=([^;]*)/.exec(req.headers.get('cookie') ?? '')?.[1]
  if (!cookie) return null
  try {
    return decodeURIComponent(cookie) || null
  } catch {
    return cookie
  }
}

export type SpaceLookup = (userId: string, spaceId: string) => Promise<{ space: SpaceDoc | null; role: SpaceRole | null }>

/**
 * Which budget a request runs against, and who pays for it. No budget asked
 * for, or one's own id, is the personal budget, decided without a database
 * round trip so single-budget accounts pay nothing for this.
 */
export async function resolveSpaceAccess(userId: string, requested: string | null, lookup: SpaceLookup): Promise<SpaceAccess> {
  if (!requested || requested === userId) return { spaceId: userId, ownerId: userId, role: 'owner' }
  if (!SPACE_ID_RE.test(requested)) return { spaceId: 'invalid', denied: true }
  const { space, role } = await lookup(userId, requested)
  if (!space || space.deleted_at || !role) return { spaceId: requested, denied: true }
  return { spaceId: space._id, ownerId: space.owner_id, role }
}

const MEMBERSHIP_TTL_MS = 30_000
const MEMBERSHIP_CACHE_MAX = 10_000
const membershipCache = new Map<string, { at: number; value: Awaited<ReturnType<SpaceLookup>> }>()

/**
 * Membership is checked on every request that names a shared budget, so it's
 * cached in-process. ponytail: a removed member keeps access on a warm
 * instance for up to 30s; `forgetMembership` clears it on this one.
 */
export const lookupMembership: SpaceLookup = async (userId, spaceId) => {
  const key = `${userId}:${spaceId}`
  const hit = membershipCache.get(key)
  if (hit && Date.now() - hit.at < MEMBERSHIP_TTL_MS) return hit.value
  const db = await getDb()
  const [space, member] = await Promise.all([
    db.collection<SpaceDoc>(SPACES).findOne({ _id: spaceId }),
    db.collection<SpaceMemberDoc>(SPACE_MEMBERS).findOne({ space_id: spaceId, user_id: userId }),
  ])
  const value = { space, role: member?.role ?? null }
  // ponytail: the key is client-chosen, so bound it. Dropping everything at
  // the cap only costs a re-read; an LRU would keep the hot ones.
  if (membershipCache.size >= MEMBERSHIP_CACHE_MAX) membershipCache.clear()
  membershipCache.set(key, { at: Date.now(), value })
  return value
}

export function forgetMembership(spaceId: string, userId?: string): void {
  for (const key of membershipCache.keys()) {
    if (key.endsWith(`:${spaceId}`) && (!userId || key.startsWith(`${userId}:`))) membershipCache.delete(key)
  }
}

/**
 * The budgets a money cron (recurring auto-log, subscriptions, recurring
 * incomes, investments) runs for: every live user's personal budget, plus
 * every live shared budget run once for its owner. Looping members instead
 * would log a shared rent once per member.
 */
export function spacesToRun<U extends { _id: string }>(users: U[], spaces: SpaceDoc[]): { spaceId: string; owner: U }[] {
  const byId = new Map(users.map((u) => [u._id, u]))
  const runs = users.map((owner) => ({ spaceId: owner._id, owner }))
  for (const space of spaces) {
    if (space.deleted_at || byId.has(space._id)) continue
    const owner = byId.get(space.owner_id)
    if (owner) runs.push({ spaceId: space._id, owner })
  }
  return runs
}

/** Live shared budgets, for the money crons. Personal budgets come from `users`. */
export async function liveSpaces(db?: Db): Promise<SpaceDoc[]> {
  return (db ?? (await getDb())).collection<SpaceDoc>(SPACES).find({ deleted_at: null }).toArray()
}

/**
 * The Auth for a background job (a cron, an import pass) acting as `userId`
 * in `spaceId`, their personal budget by default. Jobs never pass through
 * requireAccess, so `spaceOwnerId` is only a best guess here.
 */
export function jobAuth(userId: string, spaceId: string = userId): Auth {
  return { userId, readOnly: false, sessionId: null, spaceId, spaceOwnerId: userId, spaceRole: spaceId === userId ? 'owner' : 'member' }
}
