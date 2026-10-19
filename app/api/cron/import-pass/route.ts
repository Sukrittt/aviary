import { timingSafeEqual, createHash } from 'node:crypto'
import { after } from 'next/server'
import { ObjectId } from 'mongodb'
import { json, readBody } from '@/lib/http'
import { passAndChain } from '@/lib/import/backfill'
import { jobAuth } from '@/lib/spaces'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const PASS_BUDGET_MS = (maxDuration - 10) * 1000

/** Constant-time comparison, normalizing length via SHA-256. Copied from notifications/run/route.ts. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

/**
 * `POST /api/cron/import-pass` `{ userId, importId }`: the next backfill pass
 * of a history import, after the response, queuing another while rows remain
 * (lib/import/backfill.ts's `chainPass`). Only this deployment calls it, at the
 * origin Vercel sets, with the cron secret; the import's lease makes a duplicate call a no-op.
 */
export async function POST(req: Request) {
  const startedAt = Date.now()
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = await readBody(req)
  if (typeof body.userId !== 'string' || !body.userId || typeof body.importId !== 'string' || !ObjectId.isValid(body.importId)) {
    return json({ error: 'invalid' }, { status: 400 })
  }
  // Passes queued before budgets carry no spaceId: those imports are personal.
  const auth = jobAuth(body.userId, typeof body.spaceId === 'string' && body.spaceId ? body.spaceId : body.userId)
  after(() => passAndChain(auth, body.importId as string, startedAt + PASS_BUDGET_MS))
  return json({ ok: true })
}
