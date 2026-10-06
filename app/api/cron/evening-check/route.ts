import { timingSafeEqual, createHash } from 'node:crypto'
import { json } from '@/lib/http'
import { recordCronRun, triggerOf } from '@/lib/cronRuns'
import { runEveningCheck } from '@/lib/notifications/eveningCheck'

export const dynamic = 'force-dynamic'

/** Constant-time comparison, normalizing length via SHA-256. Copied from notifications/run/route.ts. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

/** Hourly (24 daily Hobby crons): end-of-day push for users with nothing logged today. See lib/notifications/eveningCheck.ts. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await recordCronRun('eveningCheck', triggerOf(req), () => runEveningCheck())
  return json({ ok: true, ...result })
}
