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
import { budgetEmoji, budgetIconKey } from '@/src/lib/budgetIcons'
import { isCategoryIconKey, type CategoryIconKey } from '@/src/lib/categoryIcons'
import { ObjectId, type Db } from 'mongodb'
import { getDb } from './mongodb'
import { scoped } from './scoped'
import { resolveCurrency } from '@/src/lib/currencies'
import { budgetSettings } from './userCurrency'
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
  /** Kept for app builds from before icons. */
  emoji: string
  icon?: string
  owner_id: string
  currencyCode?: string
  onboardedAt?: string | null
  deleted_at: string | null
  /** Who deleted it, for the members' "deleted by Priya" note. */
  deleted_by?: string
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

export type SpaceAccess = (
  | { spaceId: string; ownerId: string; role: SpaceRole; denied?: undefined }
  | { spaceId: string; denied: true }
) & { accountDeleted?: boolean }

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

export type SpaceLookup = (userId: string, spaceId: string) => Promise<{ space: SpaceDoc | null; role: SpaceRole | null; accountDeleted?: boolean }>

/**
 * Which budget a request runs against, and who pays for it. No budget asked
 * for, or one's own id, is the personal budget, unless its owner's account
 * deletion handed it to someone else (`handOffSharedBudgets`): then it's
 * theirs only if they're still a member. That check rides the cached lookup,
 * as does whether the requester's own account is in its deletion window.
 */
export async function resolveSpaceAccess(userId: string, requested: string | null, lookup: SpaceLookup): Promise<SpaceAccess> {
  const spaceId = requested || userId
  const own = spaceId === userId
  if (!own && !SPACE_ID_RE.test(spaceId)) return { spaceId: 'invalid', denied: true }
  const { space, role, accountDeleted } = await lookup(userId, spaceId)
  if (own && (!space || space.owner_id === userId)) return { spaceId, ownerId: userId, role: 'owner', accountDeleted }
  if (!space || space.deleted_at || !role) return { spaceId, denied: true, accountDeleted }
  return { spaceId: space._id, ownerId: space.owner_id, role, accountDeleted }
}

const MEMBERSHIP_TTL_MS = 30_000
const MEMBERSHIP_CACHE_MAX = 10_000
const membershipCache = new Map<string, { at: number; value: Awaited<ReturnType<SpaceLookup>> }>()
// Bumped by every forget, so a lookup that was already reading can't cache what was just cleared.
let membershipGeneration = 0

/**
 * Membership is checked on every request that names a shared budget, so it's
 * cached in-process. ponytail: a removed member keeps access on a warm
 * instance for up to 30s; `forgetMembership` clears it on this one.
 */
export const lookupMembership: SpaceLookup = async (userId, spaceId) => {
  const key = `${userId}:${spaceId}`
  const hit = membershipCache.get(key)
  if (hit && Date.now() - hit.at < MEMBERSHIP_TTL_MS) return hit.value
  const generation = membershipGeneration
  const db = await getDb()
  const [space, member, user] = await Promise.all([
    db.collection<SpaceDoc>(SPACES).findOne({ _id: spaceId }),
    db.collection<SpaceMemberDoc>(SPACE_MEMBERS).findOne({ space_id: spaceId, user_id: userId }),
    db.collection<{ _id: string; deleted_at?: string | null }>('users').findOne({ _id: userId }, { projection: { deleted_at: 1 } }),
  ])
  const value = { space, role: member?.role ?? null, accountDeleted: !!user?.deleted_at }
  // ponytail: the key is client-chosen, so bound it. Dropping everything at
  // the cap only costs a re-read; an LRU would keep the hot ones.
  if (membershipCache.size >= MEMBERSHIP_CACHE_MAX) membershipCache.clear()
  if (generation === membershipGeneration) membershipCache.set(key, { at: Date.now(), value })
  return value
}

export function forgetMembership(spaceId: string, userId?: string): void {
  membershipGeneration++
  for (const key of membershipCache.keys()) {
    if (key.endsWith(`:${spaceId}`) && (!userId || key.startsWith(`${userId}:`))) membershipCache.delete(key)
  }
}

/** Every cached lookup for one person, for when their account is deleted or restored. */
export function forgetPerson(userId: string): void {
  membershipGeneration++
  for (const key of membershipCache.keys()) if (key.startsWith(`${userId}:`)) membershipCache.delete(key)
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

/** Budgets a person can open, owned and joined together. The same on trial and paid. */
export const DEFAULT_BUDGET_LIMIT = 5
/** People in one budget, the owner plus 5. */
export const MAX_MEMBERS = 6

/** An admin can raise one person's limit (`users.budgetLimit`); anything but a positive whole number is ignored. */
export function budgetLimitFor(user: { budgetLimit?: number | null }): number {
  const n = user.budgetLimit
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : DEFAULT_BUDGET_LIMIT
}

/**
 * How many budgets count toward the limit: the personal one, if this person
 * has one (someone who only ever joined doesn't), plus every budget they're a
 * member of. A shared personal budget is the same budget, counted once.
 */
export function budgetsOpen(userId: string, hasPersonal: boolean, memberSpaceIds: string[]): number {
  const ids = new Set(memberSpaceIds)
  if (hasPersonal) ids.add(userId)
  return ids.size
}

/** What the switcher shows for one budget. */
export interface BudgetSummary {
  id: string
  name: string
  emoji: string
  icon: CategoryIconKey
  role: SpaceRole
  ownerId: string
  currencyCode: string
  /** True for the budget whose id is the person's own: it can't be left, only renamed. */
  personal: boolean
  members: { userId: string; name: string | null; avatarUrl: string | null; role: SpaceRole; joinedAt: string | null }[]
}

export const PERSONAL_NAME = 'Personal'
export const PERSONAL_EMOJI = '🐦'

export type PersonDoc = { _id: string; name?: string | null; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null; currencyCode?: string; budgetLimit?: number | null; noPersonalBudget?: boolean }

export const personName = (u: PersonDoc | undefined) => u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || null

/**
 * Every budget this person can open, the personal one first, plus the limit
 * the switcher counts against. The personal budget needs no `spaces` doc:
 * until it's renamed or shared it's described from the user doc alone.
 */
/** A budget this person was in that its owner deleted lately: members see who, the owner can restore it. */
export interface DeletedBudget { id: string; name: string; emoji: string; icon: CategoryIconKey; deletedAt: string; deletedBy: string | null; canRestore: boolean }

const RESTORE_WINDOW_MS = 30 * 86_400_000

export async function listBudgets(userId: string): Promise<{ budgets: BudgetSummary[]; deleted: DeletedBudget[]; count: number; limit: number }> {
  const db = await getDb()
  const user = await db.collection<PersonDoc>('users').findOne({ _id: userId })
  const hasPersonal = !user?.noPersonalBudget
  const mine = await db.collection<SpaceMemberDoc>(SPACE_MEMBERS).find({ user_id: userId }).sort({ joined_at: 1 }).toArray()
  const ids = [...new Set([...(hasPersonal ? [userId] : []), ...mine.map((m) => m.space_id)])]
  const [allSpaces, members] = await Promise.all([
    db.collection<SpaceDoc>(SPACES).find({ _id: { $in: ids } }).toArray(),
    db.collection<SpaceMemberDoc>(SPACE_MEMBERS).find({ space_id: { $in: ids } }).sort({ joined_at: 1 }).toArray(),
  ])
  const spaces = allSpaces.filter((s) => !s.deleted_at)
  const gone = allSpaces.filter((s) => s.deleted_at && Date.parse(s.deleted_at) > Date.now() - RESTORE_WINDOW_MS)
  const people = await db.collection<PersonDoc>('users')
    .find({ _id: { $in: [...new Set([userId, ...ids, ...members.map((m) => m.user_id), ...gone.map((s) => s.deleted_by ?? s.owner_id)])] } }, { projection: { name: 1, firstName: 1, lastName: 1, avatarUrl: 1, currencyCode: 1 } })
    .toArray()
  const personById = new Map(people.map((p) => [p._id, p]))
  const spaceById = new Map(spaces.map((s) => [s._id, s]))

  const budgets: BudgetSummary[] = []
  for (const id of ids) {
    const space = spaceById.get(id)
    const personal = id === userId
    if (!space && !personal) continue // deleted
    const ownerId = space?.owner_id ?? userId
    const role: SpaceRole = ownerId === userId ? 'owner' : 'member'
    const rows = members.filter((m) => m.space_id === id)
    const list = rows.length ? rows : [{ space_id: id, user_id: userId, role: 'owner' as const, joined_at: '', notify_others: false }]
    budgets.push({
      id,
      name: space?.name ?? PERSONAL_NAME,
      emoji: space?.emoji ?? PERSONAL_EMOJI,
      icon: budgetIconKey({ icon: space?.icon, emoji: space?.emoji ?? PERSONAL_EMOJI }),
      role,
      ownerId,
      // A personal budget's currency is its owner's own setting, for members too
      // (see budgetSettings); one handed off carries its own.
      currencyCode: resolveCurrency(ownerId === id ? personById.get(id)?.currencyCode : space?.currencyCode ?? personById.get(id)?.currencyCode),
      personal,
      members: list.map((m) => ({
        userId: m.user_id,
        name: personName(personById.get(m.user_id)),
        avatarUrl: personById.get(m.user_id)?.avatarUrl ?? null,
        role: m.role,
        joinedAt: m.joined_at || null,
      })),
    })
  }
  const deleted = gone.map((s) => ({
    id: s._id, name: s.name, emoji: s.emoji, icon: budgetIconKey(s), deletedAt: s.deleted_at!,
    deletedBy: personName(personById.get(s.deleted_by ?? s.owner_id))?.split(/\s+/)[0] ?? null,
    canRestore: s.owner_id === userId,
  }))
  return { budgets, deleted, count: budgetsOpen(userId, hasPersonal, budgets.map((b) => b.id)), limit: budgetLimitFor(user ?? {}) }
}

/** Gives the personal budget a `spaces` doc and an owner membership, so it can be renamed or shared. Idempotent. */
export async function ensurePersonalSpace(userId: string): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.collection<SpaceDoc>(SPACES).updateOne(
    { _id: userId },
    { $setOnInsert: { name: PERSONAL_NAME, emoji: PERSONAL_EMOJI, owner_id: userId, deleted_at: null, created_at: now } },
    { upsert: true },
  )
  await db.collection<SpaceMemberDoc>(SPACE_MEMBERS).updateOne(
    { space_id: userId, user_id: userId },
    { $setOnInsert: { role: 'owner', joined_at: now, notify_others: false } },
    { upsert: true },
  )
}

export class BudgetError extends Error {
  constructor(public code: 'LIMIT_REACHED' | 'INVALID' | 'NOT_OWNER' | 'NOT_FOUND' | 'FULL' | 'EXPIRED', message: string) {
    super(message)
  }
}

const NAME_MAX = 40

export function budgetNameError(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'name required'
  if (name.trim().length > NAME_MAX) return 'name too long'
  return null
}

/** One emoji (a single grapheme, possibly several code points). */
export function isBudgetEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 16) return false
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
  return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
}

/** The icon a create or edit asks for: `icon` from the catalog, or an older app's emoji, matched. Null if neither. */
export function requestedBudgetIcon(body: { icon?: unknown; emoji?: unknown }): CategoryIconKey | null {
  if (isCategoryIconKey(body.icon)) return body.icon
  return isBudgetEmoji(body.emoji) ? budgetIconKey({ emoji: body.emoji }) : null
}

/**
 * A new budget, owned by `auth.userId`. Optionally starts with a copy of the
 * active budget's groups and categories (names, order, icons, colours, alert
 * thresholds), never its money.
 *
 * ponytail: the limit check and the insert aren't atomic, so two creates
 * racing from two devices could land one over the limit. A per-user lease
 * would close it if that ever matters.
 */
export async function createBudget(
  auth: Auth,
  input: { name: string; icon: CategoryIconKey; currencyCode: string; copyCategories: boolean; importing?: boolean },
): Promise<BudgetSummary> {
  const { count, limit } = await listBudgets(auth.userId)
  if (count >= limit) throw new BudgetError('LIMIT_REACHED', 'budget limit reached')
  const db = await getDb()
  const user = await db.collection<PersonDoc>('users').findOne({ _id: auth.userId }, { projection: { noPersonalBudget: 1 } })
  if (user?.noPersonalBudget) {
    // Someone who only ever joined: their first own budget is the personal
    // one (id = their user id), and it runs the full setup, which is what
    // starts their trial. So no categories are copied in.
    await db.collection('users').updateOne({ _id: auth.userId as never }, { $unset: { noPersonalBudget: '' }, $set: { currencyCode: input.currencyCode } })
    await ensurePersonalSpace(auth.userId)
    await db.collection<SpaceDoc>(SPACES).updateOne({ _id: auth.userId }, { $set: { name: input.name.trim(), icon: input.icon, emoji: budgetEmoji(input.icon) } })
    return (await listBudgets(auth.userId)).budgets.find((b) => b.id === auth.userId)!
  }
  const id = new ObjectId().toHexString()
  const now = new Date().toISOString()
  await db.collection<SpaceDoc>(SPACES).insertOne({
    _id: id, name: input.name.trim(), icon: input.icon, emoji: budgetEmoji(input.icon), owner_id: auth.userId,
    // One made to import into is set up by the import (lib/import/commit.ts).
    currencyCode: input.currencyCode, onboardedAt: input.importing ? null : now, deleted_at: null, created_at: now,
  })
  await db.collection<SpaceMemberDoc>(SPACE_MEMBERS).insertOne({ space_id: id, user_id: auth.userId, role: 'owner', joined_at: now, notify_others: false })
  if (input.copyCategories && !input.importing && !auth.spaceDenied) await copyCategories(auth.spaceId, id)
  forgetMembership(id, auth.userId)
  const { budgets } = await listBudgets(auth.userId)
  return budgets.find((b) => b.id === id)!
}

const CATEGORY_FIELDS = ['name', 'group', 'order', 'icon', 'color', 'alertPcts'] as const

async function copyCategories(fromSpaceId: string, toSpaceId: string): Promise<void> {
  const db = await getDb()
  for (const name of ['groups', 'categories'] as const) {
    const docs = await scoped(db.collection(name), fromSpaceId).find({}).toArray()
    if (docs.length === 0) continue
    const copies = docs.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => (CATEGORY_FIELDS as readonly string[]).includes(k))))
    await scoped(db.collection(name), toSpaceId).insertMany(copies)
  }
}

/** Rename, re-icon or re-currency a budget. Owner only. The personal budget's currency stays on the user doc. */
export async function updateBudget(auth: Auth, spaceId: string, patch: { name?: string; icon?: CategoryIconKey; currencyCode?: string }): Promise<BudgetSummary> {
  const { budgets } = await listBudgets(auth.userId)
  const budget = budgets.find((b) => b.id === spaceId)
  if (!budget) throw new BudgetError('NOT_FOUND', 'budget not found')
  if (budget.role !== 'owner') throw new BudgetError('NOT_OWNER', 'only the owner can change this budget')
  const db = await getDb()
  if (budget.personal) {
    if (patch.name !== undefined || patch.icon !== undefined) await ensurePersonalSpace(auth.userId)
    if (patch.currencyCode !== undefined) await db.collection('users').updateOne({ _id: auth.userId as never }, { $set: { currencyCode: patch.currencyCode } })
  }
  const set = {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon, emoji: budgetEmoji(patch.icon) } : {}),
    ...(patch.currencyCode !== undefined && !budget.personal ? { currencyCode: patch.currencyCode } : {}),
  }
  if (Object.keys(set).length) await db.collection<SpaceDoc>(SPACES).updateOne({ _id: spaceId }, { $set: set })
  return (await listBudgets(auth.userId)).budgets.find((b) => b.id === spaceId)!
}

/**
 * Whether the active budget is set up yet: the personal budget's mark is its
 * owner's own `onboardedAt`, for members too; any other budget's is on its doc
 * (one made to import into starts without one).
 */
export async function budgetSetUp(auth: Auth): Promise<boolean> {
  const { onboardedAt, exists } = await budgetSettings(auth)
  return !exists || !!onboardedAt
}

/** Sets the active budget's currency: its owner's own for the personal budget, else the budget doc's. */
export async function setBudgetCurrency(auth: Auth, currencyCode: string): Promise<void> {
  const db = await getDb()
  const { userDocId } = await budgetSettings(auth)
  if (userDocId) await db.collection('users').updateOne({ _id: userDocId as never }, { $set: { currencyCode } })
  else await db.collection<SpaceDoc>(SPACES).updateOne({ _id: auth.spaceId }, { $set: { currencyCode } })
}
