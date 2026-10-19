import { json, error, getCollection } from '@/lib/http'
import { getAuth, spaceGuard } from '@/lib/access'
import { exportAllowance } from '@/lib/exports'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const denied = spaceGuard(auth)
  if (denied) return denied
  if (auth.readOnly) return error('unauthorized', 401)

  const exports = await getCollection('exports', auth)
  const docs = await exports.find({}).sort({ created_at: -1 }).limit(20).toArray()
  const allowance = await exportAllowance(auth)

  return json({
    exports: docs.map((d) => ({
      id: d._id.toString(),
      status: d.status,
      created_at: d.created_at,
      error: d.error ?? null,
    })),
    usedThisMonth: allowance.usedThisMonth,
    limit: allowance.limit,
    // Clients gate the button on this, not on used >= limit: the cap can be
    // spent and an export still be allowed (the post-expiry exit export).
    canExport: allowance.allowed,
    exitExport: allowance.exitExport,
    accessExpired: allowance.accessExpired,
  })
}
