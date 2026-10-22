import type { Db } from 'mongodb'
import { del, list } from '@vercel/blob'
import { nowIST } from './http'
import { withTx } from './mongodb'
import { invalidate } from './cache'
import { invalidateCategoryMap } from './categoryMap'
import { BRIEF_CACHE_COLLECTION, invalidateBrief } from './ai/briefCache'
import { COLLECTIONS } from './models'
import { purgeUserIdeas } from './ideas'
import { FEEDBACK } from './feedback'
import type { UserDoc } from './users'
import { getWorkOSClient } from './workosClient'
import { PERSON_COLLECTIONS } from './http'
import { personalBudgetHandedOff, purgeSpace, restoreAccountSpaces } from './spaceMembers'

/**
 * The collections an account deletion sweeps. When the person's personal
 * budget went to another member (lib/spaceMembers.ts handOffSharedBudgets),
 * its data isn't theirs to take: only their own person-level rows go.
 */
async function accountCollections(db: Db, userId: string, all: string[]): Promise<string[]> {
  return (await personalBudgetHandedOff(db, userId)) ? all.filter((c) => PERSON_COLLECTIONS.has(c) || c === 'email_outbox') : all
}

/**
 * Soft-deletes an account: archives every row (lib/scoped.ts `deleted_at`)
 * and marks the user. The GC cron (app/api/cron/gc) purges both, and the
 * WorkOS user, once `GRACE_DAYS` pass. Returns the deletion timestamp.
 */
export async function softDeleteAccount(db: Db, userId: string): Promise<string> {
  const deletedAt = nowIST().timestamp
  const result = await withTx(async session => {
    const users = db.collection<UserDoc>('users')
    const user = await users.findOne({ _id: userId }, { session })
    if (user?.deleted_at) return user.deleted_at
    for (const name of await accountCollections(db, userId, Object.values(COLLECTIONS))) {
      await db.collection(name).updateMany(
        { user_id: userId, deleted_at: null },
        { $set: { deleted_at: deletedAt, account_deleted_at: deletedAt }, ...(name === 'expenses' ? { $inc: { version: 1 } } : {}) },
        { session },
      )
    }
    await users.updateOne({ _id: userId }, { $set: { deleted_at: deletedAt, account_deletion_version: 1 } }, { session })
    return deletedAt
  })
  await invalidateAccount(userId)
  return result
}

export class LegacyAccountRecoveryError extends Error {
  constructor() { super('This older account deletion needs support-assisted recovery. Your account has not been marked restored.') }
}

/**
 * Their personal budget went to another member when they deleted. Its id is
 * their user id, so every request without a budget header would open someone
 * else's budget and 403: a restored account would have nothing to use.
 */
export class PersonalBudgetHandedOffError extends Error {
  constructor() { super("Your personal budget belongs to someone else now, so this account can't come back. Sign up again to start fresh.") }
}

/** Restore only rows archived by this account deletion, never older archives. */
export async function restoreAccount(db: Db, userId: string): Promise<void> {
  // ponytail: refuses rather than giving them a new personal budget, which needs one whose id isn't their user id.
  if (await personalBudgetHandedOff(db, userId)) throw new PersonalBudgetHandedOffError()
  await withTx(async session => {
    const users = db.collection<UserDoc>('users')
    const user = await users.findOne({ _id: userId }, { session })
    if (!user?.deleted_at) return
    if (user.account_deletion_version !== 1) throw new LegacyAccountRecoveryError()
    for (const name of Object.values(COLLECTIONS)) {
      await db.collection(name).updateMany(
        { user_id: userId, account_deleted_at: user.deleted_at },
        { $set: { deleted_at: null }, $unset: { account_deleted_at: '' } },
        { session },
      )
    }
    await users.updateOne({ _id: userId }, { $set: { deleted_at: null } }, { session })
  })
  await restoreAccountSpaces(db, userId)
  await invalidateAccount(userId)
}

async function invalidateAccount(userId: string): Promise<void> {
  for (const name of ['expenses', 'budgets', 'wrapped']) invalidate(name, userId)
  invalidateCategoryMap(userId)
  await invalidateBrief(userId)
}

/** Per-user collections outside COLLECTIONS that still carry `user_id`. */
const EXTRA_USER_COLLECTIONS = ['notification_threshold_state', 'ai_usage', 'email_outbox', BRIEF_CACHE_COLLECTION]

/**
 * Irreversible, immediate account purge (admin only): WorkOS user, every
 * row with this `user_id` (live or archived), stored bill-scan images,
 * expense photos, bug report screenshots and exports in Vercel Blob, then the `users` doc. WorkOS goes first, like the
 * GC cron, so a failure there leaves everything intact to retry.
 */
export async function purgeAccountNow(db: Db, userId: string): Promise<{ rows: number; blobs: number }> {
  try {
    await getWorkOSClient().userManagement.deleteUser(userId)
  } catch (err) {
    // Already gone from WorkOS (e.g. a half-finished earlier purge) — carry on with local cleanup.
    if ((err as { status?: number }).status !== 404) throw err
  }

  const handedOff = await personalBudgetHandedOff(db, userId)
  let rows = 0
  for (const name of await accountCollections(db, userId, [...Object.values(COLLECTIONS), ...EXTRA_USER_COLLECTIONS])) {
    rows += (await db.collection(name).deleteMany({ user_id: userId })).deletedCount
  }
  // Budgets they own that nobody else is in go with them, closed or not.
  for (const space of await db.collection('spaces').find({ owner_id: userId, _id: { $ne: userId as never } }).toArray()) {
    if (!(await db.collection('space_members').findOne({ space_id: space._id, user_id: { $ne: userId } }))) await purgeSpace(db, String(space._id))
  }
  // Their seats in other people's budgets, and their personal budget's doc unless it changed hands.
  rows += (await db.collection('space_members').deleteMany({ user_id: userId })).deletedCount
  if (!handedOff) {
    rows += (await db.collection('space_members').deleteMany({ space_id: userId })).deletedCount
    await db.collection('space_invites').deleteMany({ space_id: userId })
    await db.collection('spaces').deleteOne({ _id: userId as never })
  }
  // Not a plain sweep: their votes have to come off other people's idea counts.
  rows += await purgeUserIdeas(db, userId)
  // Bug reports predate the user_id convention and key on `userId`.
  rows += (await db.collection(FEEDBACK).deleteMany({ userId })).deletedCount

  let blobs = 0
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const prefixes = handedOff ? [`feedback-screenshots/${userId}/`] : [`bills/${userId}/`, `exports/${userId}/`, `expense-photos/${userId}/`, `feedback-screenshots/${userId}/`]
    for (const prefix of prefixes) {
      let cursor: string | undefined
      do {
        const page = await list({ prefix, cursor })
        if (page.blobs.length) await del(page.blobs.map((b) => b.url))
        blobs += page.blobs.length
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
    }
  }

  // The trial record goes with the account. `billing_subscriptions` rows stay:
  // they hold store transaction ids and dates, no budgeting content, and are
  // what lets a late refund or renewal event be matched to a purchase.
  await db.collection('billing_accounts').deleteOne({ _id: userId as never })

  await db.collection<UserDoc>('users').deleteOne({ _id: userId })
  return { rows, blobs }
}
