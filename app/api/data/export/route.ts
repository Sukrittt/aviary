import { acquireLease } from '@/lib/resourceLease'
import { isRateLimited } from '@/lib/rateLimit'
import { after } from 'next/server'
import { json, error, getCollection, nowIST } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { EXPORT_LIMIT, exportAllowance, currentMonthKey, buildAndStoreExport } from '@/lib/exports'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Kicks off a background export instead of building it inline: workbook
 * generation is a fire-and-forget `after()` call (lib/exports.ts) so this
 * responds immediately, and the user is notified via push when it's ready.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const release = await acquireLease(`export:${auth.userId}`)
  if (!release) return error('An export is already being prepared.', 409)
  let queued = false
  try {
    if (await isRateLimited(`export:${auth.userId}`, { windowMs: 3600_000, limit: 10 })) return error('Please wait before retrying the export.', 429)
    const allowance = await exportAllowance(auth)
    if (!allowance.allowed) return error('monthly export limit reached', 429)
    const exports = await getCollection('exports', auth)
    const { insertedId } = await exports.insertOne({ status: 'pending', month: currentMonthKey(), created_at: nowIST().timestamp })
    after(async () => {
      try { await buildAndStoreExport(auth.userId, insertedId.toString()) }
      finally { await release() }
    })
    queued = true
    return json({ id: insertedId.toString(), status: 'pending', remaining: Math.max(0, EXPORT_LIMIT - allowance.usedThisMonth), exitExport: allowance.exitExport }, { status: 202 })
  } finally {
    if (!queued) await release()
  }
}
