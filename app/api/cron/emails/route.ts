import { createHash, timingSafeEqual } from 'node:crypto'
import { json } from '@/lib/http'
import { retrySubscriptionEmails } from '@/lib/email/subscription'
import { retryWelcomeEmails } from '@/lib/email/welcome'
import { retryLifecycleEmails } from '@/lib/email/lifecycle'
import { recordCronRun, triggerOf } from '@/lib/cronRuns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !timingSafeEqual(createHash('sha256').update(header).digest(), createHash('sha256').update(`Bearer ${secret}`).digest())) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await recordCronRun('emails', triggerOf(req), async () => {
    const welcome = await retryWelcomeEmails(4)
    const subscription = await retrySubscriptionEmails(4)
    // Last, and in its own bucket, so a backlog of tips never delays a receipt.
    const lifecycle = await retryLifecycleEmails(15)
    const all = [welcome, subscription, lifecycle]
    const total = (key: 'sent' | 'skipped' | 'failed' | 'needs_review') => all.reduce((n, r) => n + r[key], 0)
    return { sent: total('sent'), skipped: total('skipped'), failed: total('failed'), needs_review: total('needs_review'), configured: welcome.configured && subscription.configured, welcome, subscription, lifecycle }
  })
  return json({ ok: true, ...result })
}
