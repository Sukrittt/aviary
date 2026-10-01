import { json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { restoreAccount, LegacyAccountRecoveryError } from '@/lib/accountLifecycle'
import type { UserDoc } from '@/lib/users'

export const dynamic = 'force-dynamic'

/**
 * Undo a soft-deleted account within its grace window (see DELETE /api/user
 * and app/api/cron/gc/route.ts). Restores every collection's rows an
 * unfiltered `deleteMany({})` archived, then clears the account itself.
 * A 404 (rather than a silent no-op) means either the account was never
 * deleted or the GC cron already purged it — the grace window is over.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const db = await getDb()
  const account = await db.collection<UserDoc>('users').findOne({ _id: auth.userId })
  if (!account?.deleted_at) return error('account is not scheduled for deletion', 404)

  try {
    await restoreAccount(db, auth.userId)
  } catch (err) {
    if (err instanceof LegacyAccountRecoveryError) return error(err.message, 409)
    throw err
  }

  return json({ ok: true })
}
