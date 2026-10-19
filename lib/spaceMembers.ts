/**
 * Sharing a budget: invites, joining, leaving, removing, and deleting a
 * shared budget with a 30-day restore. See lib/spaces.ts for what a budget
 * ("space") is.
 */
import { randomInt } from 'node:crypto'
import type { Db } from 'mongodb'
import { del, list } from '@vercel/blob'
import { getDb, withTx } from './mongodb'
import { COLLECTIONS } from './models'
import { PERSON_COLLECTIONS } from './http'
import { SITE_URL } from './seo'
import { sendPushNotification } from './push'
import { formatMoney, resolveCurrency } from '@/src/lib/currencies'
import type { Auth } from './access'
import {
  SPACES, SPACE_MEMBERS, SPACE_INVITES, MAX_MEMBERS, BudgetError, ensurePersonalSpace, forgetMembership, listBudgets, personName,
  type SpaceDoc, type SpaceInviteDoc, type SpaceMemberDoc, type PersonDoc,
} from './spaces'

const INVITE_DAYS = 7
/** A deleted budget can be restored for this long, then the GC cron purges it. */
export const RESTORE_DAYS = 30
const DAY_MS = 86_400_000

// No 0/O or 1/I/L: the code gets read out loud and typed on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const INVITE_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/

export const normalizeCode = (code: string) => code.trim().toUpperCase()
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
export const inviteUrl = (code: string) => new URL(`/join/${code}`, process.env.APP_URL || SITE_URL).href

async function ownedSpace(auth: Auth, spaceId: string): Promise<SpaceDoc> {
  const db = await getDb()
  if (spaceId === auth.userId) await ensurePersonalSpace(auth.userId)
  const space = await db.collection<SpaceDoc>(SPACES).findOne({ _id: spaceId, deleted_at: null })
  if (!space) throw new BudgetError('NOT_FOUND', 'budget not found')
  if (space.owner_id !== auth.userId) throw new BudgetError('NOT_OWNER', 'only the owner can do that')
  return space
}

export interface InviteSummary { code: string; url: string; expiresAt: string }

/** A 6-character code (and its link) that lets one person in for 7 days. Owner only. */
export async function createInvite(auth: Auth, spaceId: string): Promise<InviteSummary> {
  const space = await ownedSpace(auth, spaceId)
  const db = await getDb()
  if ((await db.collection(SPACE_MEMBERS).countDocuments({ space_id: space._id })) >= MAX_MEMBERS) throw new BudgetError('FULL', 'budget is full')
  const expiresAt = new Date(Date.now() + INVITE_DAYS * DAY_MS).toISOString()
  // ~887M codes, so a clash is rare; the unique index catches the one that happens.
  for (let attempt = 0; ; attempt++) {
    const code = newCode()
    try {
      await db.collection<SpaceInviteDoc>(SPACE_INVITES).insertOne({ space_id: space._id, code, created_by: auth.userId, expires_at: expiresAt, status: 'pending' })
      return { code, url: inviteUrl(code), expiresAt }
    } catch (err) {
      if ((err as { code?: number }).code !== 11000 || attempt >= 4) throw err
    }
  }
}

/** Pending, unexpired invites for the owner's "Copy again" and "Cancel". */
export async function listInvites(spaceId: string): Promise<InviteSummary[]> {
  const db = await getDb()
  const rows = await db.collection<SpaceInviteDoc>(SPACE_INVITES)
    .find({ space_id: spaceId, status: 'pending', expires_at: { $gt: new Date().toISOString() } })
    .sort({ expires_at: -1 })
    .toArray()
  return rows.map((r) => ({ code: r.code, url: inviteUrl(r.code), expiresAt: r.expires_at }))
}

export async function cancelInvite(auth: Auth, spaceId: string, code: string): Promise<void> {
  await ownedSpace(auth, spaceId)
  const db = await getDb()
  await db.collection<SpaceInviteDoc>(SPACE_INVITES).updateOne({ space_id: spaceId, code: normalizeCode(code), status: 'pending' }, { $set: { status: 'cancelled' } })
}

export type InvitePreview =
  | { status: 'ok' | 'expired' | 'cancelled' | 'accepted'; budget: { id: string; name: string; emoji: string }; inviter: string | null; members: number }
  | { status: 'not_found' }

/** What the join page and the app show before someone joins. Public: the code is the secret. */
export async function invitePreview(rawCode: string): Promise<InvitePreview> {
  const code = normalizeCode(rawCode)
  if (!INVITE_CODE_RE.test(code)) return { status: 'not_found' }
  const db = await getDb()
  const invite = await db.collection<SpaceInviteDoc>(SPACE_INVITES).findOne({ code })
  const space = invite && (await db.collection<SpaceDoc>(SPACES).findOne({ _id: invite.space_id }))
  if (!invite || !space) return { status: 'not_found' }
  const inviter = await db.collection<PersonDoc>('users').findOne({ _id: invite.created_by }, { projection: { name: 1, firstName: 1, lastName: 1 } })
  const status = space.deleted_at || invite.status === 'cancelled' ? 'cancelled'
    : invite.status === 'accepted' ? 'accepted'
      : invite.expires_at <= new Date().toISOString() ? 'expired' : 'ok'
  const members = await db.collection(SPACE_MEMBERS).countDocuments({ space_id: space._id })
  return { status, budget: { id: space._id, name: space.name, emoji: space.emoji }, inviter: firstName(personName(inviter ?? undefined)), members }
}

const firstName = (name: string | null) => name?.split(/\s+/)[0] || null

/**
 * Join the budget an invite is for. Already a member: just opens it. Never
 * touches the joiner's own budget. Someone joining before they've set up
 * anything of their own gets no personal budget (`noPersonalBudget`) until
 * they make one.
 */
export async function joinBudget(userId: string, rawCode: string): Promise<{ spaceId: string; already: boolean }> {
  const code = normalizeCode(rawCode)
  const db = await getDb()
  const now = new Date().toISOString()
  const invite = INVITE_CODE_RE.test(code) ? await db.collection<SpaceInviteDoc>(SPACE_INVITES).findOne({ code }) : null
  if (!invite) throw new BudgetError('NOT_FOUND', 'invite not found')
  const space = await db.collection<SpaceDoc>(SPACES).findOne({ _id: invite.space_id })
  if (!space || space.deleted_at) throw new BudgetError('EXPIRED', 'budget is gone')
  if (await db.collection(SPACE_MEMBERS).findOne({ space_id: space._id, user_id: userId })) return { spaceId: space._id, already: true }
  if (invite.status !== 'pending' || invite.expires_at <= now) throw new BudgetError('EXPIRED', 'invite expired')

  const { count, limit } = await listBudgets(userId)
  const user = await db.collection<PersonDoc & { onboardedAt?: string | null }>('users').findOne({ _id: userId })
  // Nothing of their own yet: the shared budget is their only one, and it doesn't count a personal one.
  const fresh = !user?.onboardedAt && !user?.noPersonalBudget
  if ((fresh ? count - 1 : count) >= limit) throw new BudgetError('LIMIT_REACHED', 'budget limit reached')

  await withTx(async (session) => {
    // Touching the space doc makes two joins for the last seat conflict, so
    // the retry of the loser sees the budget full.
    await db.collection<SpaceDoc>(SPACES).updateOne({ _id: space._id }, { $set: { members_changed_at: now } as never }, { session })
    if ((await db.collection(SPACE_MEMBERS).countDocuments({ space_id: space._id }, { session })) >= MAX_MEMBERS) throw new BudgetError('FULL', 'budget is full')
    const claimed = await db.collection<SpaceInviteDoc>(SPACE_INVITES).updateOne(
      { code, status: 'pending', expires_at: { $gt: now } },
      { $set: { status: 'accepted', accepted_by: userId, accepted_at: now } as never },
      { session },
    )
    if (claimed.modifiedCount !== 1) throw new BudgetError('EXPIRED', 'invite expired')
    await db.collection<SpaceMemberDoc>(SPACE_MEMBERS).insertOne({ space_id: space._id, user_id: userId, role: 'member', joined_at: now, notify_others: false }, { session })
    if (fresh) await db.collection('users').updateOne({ _id: userId as never }, { $set: { noPersonalBudget: true } }, { session })
  })
  forgetMembership(space._id, userId)

  const joiner = firstName(personName(user ?? undefined)) ?? 'Someone'
  try {
    await sendPushNotification({ userId: space.owner_id, title: `${joiner} joined ${space.name} budget`, body: 'You can see who logged what from now on.', data: { route: '/budget-members', spaceId: space._id } })
  } catch (err) {
    console.error('join: owner push failed for', space._id, err)
  }
  return { spaceId: space._id, already: false }
}

/**
 * Leave a budget (`memberId` is the caller) or, for the owner, remove someone.
 * What they logged stays. The owner can't leave: they transfer or delete.
 */
export async function removeMember(auth: Auth, spaceId: string, memberId: string): Promise<void> {
  const db = await getDb()
  const space = await db.collection<SpaceDoc>(SPACES).findOne({ _id: spaceId, deleted_at: null })
  if (!space) throw new BudgetError('NOT_FOUND', 'budget not found')
  if (memberId === space.owner_id) throw new BudgetError('INVALID', "the owner can't leave")
  if (memberId !== auth.userId && space.owner_id !== auth.userId) throw new BudgetError('NOT_OWNER', 'only the owner can remove people')
  await db.collection(SPACE_MEMBERS).deleteOne({ space_id: spaceId, user_id: memberId })
  forgetMembership(spaceId, memberId)
  await givePersonalBackIfAlone(db, memberId)
}

/** Someone who only ever joined and now has no budget left gets their own, fresh one. */
async function givePersonalBackIfAlone(db: Db, userId: string): Promise<void> {
  if ((await listBudgets(userId)).budgets.length === 0) {
    await db.collection('users').updateOne({ _id: userId as never }, { $unset: { noPersonalBudget: '' } })
  }
}

/** Delete a budget: the owner types its name to confirm. Restorable for 30 days. Never the personal one. */
export async function deleteBudget(auth: Auth, spaceId: string, confirmName: string): Promise<void> {
  if (spaceId === auth.userId) throw new BudgetError('INVALID', "the personal budget can't be deleted")
  const space = await ownedSpace(auth, spaceId)
  if (confirmName.trim().toLowerCase() !== space.name.trim().toLowerCase()) throw new BudgetError('INVALID', "the name doesn't match")
  const db = await getDb()
  await db.collection<SpaceDoc>(SPACES).updateOne({ _id: spaceId }, { $set: { deleted_at: new Date().toISOString(), deleted_by: auth.userId } as never })
  await db.collection(SPACE_INVITES).updateMany({ space_id: spaceId, status: 'pending' }, { $set: { status: 'cancelled' } })
  forgetMembership(spaceId)
}

export async function restoreBudget(auth: Auth, spaceId: string): Promise<void> {
  const db = await getDb()
  const space = await db.collection<SpaceDoc>(SPACES).findOne({ _id: spaceId })
  if (!space?.deleted_at || Date.parse(space.deleted_at) < Date.now() - RESTORE_DAYS * DAY_MS) throw new BudgetError('NOT_FOUND', 'nothing to restore')
  if (space.owner_id !== auth.userId) throw new BudgetError('NOT_OWNER', 'only the owner can restore it')
  // ponytail: not checked against the owner's budget limit, so a restore can land them one over. Fine at 5.
  await db.collection<SpaceDoc>(SPACES).updateOne({ _id: spaceId }, { $set: { deleted_at: null }, $unset: { deleted_by: '' } as never })
  forgetMembership(spaceId)
}

/** Budget data collections: everything keyed by budget rather than by person. */
const BUDGET_COLLECTIONS = [...Object.values(COLLECTIONS).filter((c) => !PERSON_COLLECTIONS.has(c)), 'ai_brief', 'notification_threshold_state']

/** GC cron: purges budgets deleted more than 30 days ago, data and all. Returns how many. */
export async function purgeDeletedSpaces(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RESTORE_DAYS * DAY_MS).toISOString()
  const due = await db.collection<SpaceDoc>(SPACES).find({ deleted_at: { $ne: null, $lt: cutoff } }).toArray()
  for (const space of due) {
    // A personal budget is never deleted this way; guard anyway, since its id is a person's.
    if (space._id === space.owner_id) continue
    for (const name of BUDGET_COLLECTIONS) await db.collection(name).deleteMany({ user_id: space._id })
    await purgeBlobs([`bills/${space._id}/`, `exports/${space._id}/`, `expense-photos/${space._id}/`])
    await db.collection(SPACE_MEMBERS).deleteMany({ space_id: space._id })
    await db.collection(SPACE_INVITES).deleteMany({ space_id: space._id })
    await db.collection(SPACES).deleteOne({ _id: space._id as never })
  }
  return due.filter((s) => s._id !== s.owner_id).length
}

export async function purgeBlobs(prefixes: string[]): Promise<number> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return 0
  let blobs = 0
  for (const prefix of prefixes) {
    let cursor: string | undefined
    do {
      const page = await list({ prefix, cursor })
      if (page.blobs.length) await del(page.blobs.map((b) => b.url))
      blobs += page.blobs.length
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  }
  return blobs
}

/**
 * "Tell me when others log": one push to each member of a shared budget who
 * turned it on, never to the person who logged. Off by default, so a busy
 * partner's logging isn't spam.
 */
export async function notifyOthersOfLog(auth: Auth, entry: { item: string; amount: number; category: string }): Promise<void> {
  const db = await getDb()
  const others = await db.collection<SpaceMemberDoc>(SPACE_MEMBERS).find({ space_id: auth.spaceId, notify_others: true, user_id: { $ne: auth.userId } }).toArray()
  if (others.length === 0) return
  const [space, actor, owner] = await Promise.all([
    db.collection<SpaceDoc>(SPACES).findOne({ _id: auth.spaceId }),
    db.collection<PersonDoc>('users').findOne({ _id: auth.userId }),
    db.collection<PersonDoc>('users').findOne({ _id: auth.spaceOwnerId }, { projection: { currencyCode: 1 } }),
  ])
  if (!space) return
  const currency = resolveCurrency(space._id === space.owner_id ? owner?.currencyCode : space.currencyCode)
  const who = firstName(personName(actor ?? undefined)) ?? 'Someone'
  const body = [entry.item, formatMoney(entry.amount, currency), entry.category].filter(Boolean).join(' · ')
  for (const member of others) {
    try {
      await sendPushNotification({ userId: member.user_id, title: `${who} logged in ${space.name}`, body, data: { route: '/(tabs)/activity', spaceId: space._id } })
    } catch (err) {
      console.error('notify others: push failed for', member.user_id, err)
    }
  }
}
