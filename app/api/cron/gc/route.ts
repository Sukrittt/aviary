import { timingSafeEqual, createHash } from 'node:crypto'
import { json } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { purgeAccountNow } from '@/lib/accountLifecycle'
import { purgeDeletedSpaces } from '@/lib/spaceMembers'
import { ARCHIVABLE_COLLECTIONS, GRACE_DAYS } from '@/lib/archive'
import type { UserDoc } from '@/lib/users'
import { recordCronRun, triggerOf } from '@/lib/cronRuns'

export const dynamic = 'force-dynamic'

/** Constant-time comparison, normalizing length via SHA-256. Copied from notifications/run/route.ts. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

/**
 * Rows/accounts archived before this UTC instant are past their grace window.
 * `deleted_at` is compared as a string, so legacy values (IST digits labelled Z,
 * or `+05:30` account stamps) sort 5.5h late: they purge late, never early.
 */
function cutoffIso(): string {
  return new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Daily cron: drops abandoned import previews older than a day, and permanently purges soft-deleted rows (lib/scoped.ts's
 * `deleted_at`) once their `GRACE_DAYS` recovery window has passed, and
 * finishes account deletions the same way — deleting the WorkOS user only
 * here, never synchronously in DELETE /api/user, so the account stays
 * recoverable via POST /api/user/restore until this runs.
 *
 * Bypasses `scoped()` on purpose, like notifications/run's user loop: this is
 * cross-tenant admin work, not a request scoped to one user. No cache
 * invalidation is needed — purging rows already excluded from every live
 * query (`deleted_at != null`) can't change any live query's result.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await recordCronRun('gc', triggerOf(req), purgeExpired)
  return json({ ok: true, ...result })
}

/** A previewed import nobody committed: its rows are a copy of a file, so it goes after a day. */
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

async function purgeExpired(): Promise<{ purged: number; accountsPurged: number; previewsPurged: number; budgetsPurged: number }> {
  const db = await getDb()
  const cutoff = cutoffIso()
  // Never one a commit is setting up right now (lib/import/commit.ts's claim).
  const previews = await db.collection('imports').deleteMany({
    status: 'previewed',
    created_at: { $lt: new Date(Date.now() - PREVIEW_TTL_MS) },
    $or: [{ claimedUntil: { $exists: false } }, { claimedUntil: { $lte: Date.now() } }],
  })

  let purged = 0
  for (const name of ARCHIVABLE_COLLECTIONS) {
    const result = await db.collection(name).deleteMany({ deleted_at: { $ne: null, $lt: cutoff } })
    purged += result.deletedCount
  }

  const usersToPurge = await db
    .collection<UserDoc>('users')
    .find({ deleted_at: { $ne: null, $lt: cutoff } })
    .toArray()

  let accountsPurged = 0
  for (const user of usersToPurge) {
    try {
      // WorkOS first: if it fails, the local row stays intact and this user
      // is retried on the next run instead of being orphaned in WorkOS.
      await purgeAccountNow(db, user._id)
      accountsPurged++
    } catch (err) {
      console.error('cron/gc: account purge failed for', user._id, err)
    }
  }

  // Budgets an owner deleted more than 30 days ago (lib/spaceMembers.ts).
  let budgetsPurged = 0
  try {
    budgetsPurged = await purgeDeletedSpaces(db)
  } catch (err) {
    console.error('cron/gc: budget purge failed', err)
  }

  return { purged, accountsPurged, previewsPurged: previews.deletedCount, budgetsPurged }
}
