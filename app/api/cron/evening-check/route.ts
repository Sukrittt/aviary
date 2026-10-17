import { timingSafeEqual, createHash } from 'node:crypto'
import { json } from '@/lib/http'
import { recordCronRun, triggerOf } from '@/lib/cronRuns'
import { runEveningCheck } from '@/lib/notifications/eveningCheck'
import { sweepImports } from '@/lib/import/backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Constant-time comparison, normalizing length via SHA-256. Copied from notifications/run/route.ts. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

/**
 * Hourly (24 daily Hobby crons): end-of-day push for users with nothing
 * logged today (lib/notifications/eveningCheck.ts), then a backfill pass for
 * any history import whose last pass let go (lib/import/backfill.ts). The
 * sweep is its own query, not part of the evening check: that only visits
 * users with a push token, and a web-only importer has none.
 */
export async function GET(req: Request) {
  const startedAt = Date.now()
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await recordCronRun('eveningCheck', triggerOf(req), () => runEveningCheck())
  const importPasses = await sweepImports(startedAt + (maxDuration - 10) * 1000).catch((err) => {
    console.error('cron/evening-check: import sweep failed', err)
    return 0
  })
  return json({ ok: true, ...result, importPasses })
}
