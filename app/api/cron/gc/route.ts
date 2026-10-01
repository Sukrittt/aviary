import { timingSafeEqual, createHash } from 'node:crypto'
import { json } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { purgeAccountNow } from '@/lib/accountLifecycle'
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

/** Rows/accounts archived before this instant (IST) are past their grace window. */
function cutoffIso(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000 - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Daily cron: permanently purges soft-deleted rows (lib/scoped.ts's
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

async function purgeExpired(): Promise<{ purged: number; accountsPurged: number }> {
  const db = await getDb()
  const cutoff = cutoffIso()

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

  return { purged, accountsPurged }
}
