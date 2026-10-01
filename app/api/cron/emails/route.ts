import { createHash, timingSafeEqual } from 'node:crypto'
import { json } from '@/lib/http'
import { retryWelcomeEmails } from '@/lib/email/welcome'
import { recordCronRun, triggerOf } from '@/lib/cronRuns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !timingSafeEqual(createHash('sha256').update(header).digest(), createHash('sha256').update(`Bearer ${secret}`).digest())) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await recordCronRun('emails', triggerOf(req), retryWelcomeEmails)
  return json({ ok: true, ...result })
}
