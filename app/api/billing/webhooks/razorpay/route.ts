import { subscriptionEmailKind } from '@/lib/email/subscriptionTemplate'
import { scheduleSubscriptionEmails } from '@/lib/email/subscription'
import { createHash } from 'node:crypto'
import { json } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { BILLING_EVENTS, type BillingEventDoc } from '@/lib/billing/records'
import { recordRazorpaySubscription } from '@/lib/billing/service'
import { BillingProviderError } from '@/lib/billing/providerError'
import { razorpayConfig, razorpayEnvironment, subscriptionUserId, verifyWebhookSignature, type RzpSubscription } from '@/lib/billing/razorpay'

export const dynamic = 'force-dynamic'

interface RzpWebhookBody {
  event?: string
  payload?: {
    subscription?: { entity?: RzpSubscription }
    payment?: { entity?: { id?: string } }
  }
}

/**
 * Razorpay webhook ingest. The same three rules as the RevenueCat one:
 *
 * 1. **Authenticate.** `X-Razorpay-Signature` is an HMAC of the raw body under
 *    the webhook secret. Anyone can POST here otherwise.
 * 2. **Persist durably, exactly once.** Keyed on Razorpay's event id, so a
 *    redelivery is a no-op insert rather than a second state change.
 * 3. **Re-fetch, never trust.** The payload says *something changed*. The
 *    subscription is fetched from Razorpay again before access moves.
 *
 * A failed verification stays durable and returns 503 for provider retry.
 * Redeliveries retry unfinished events using their persisted owner and purchase;
 * processed events are no-ops. The billing cron remains a repair fallback.
 *
 * Exempt from middleware's Bearer gate by its path (/api/billing/webhooks/).
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  const signature = req.headers.get('x-razorpay-signature')
  // The signature covers the exact bytes Razorpay sent, so read the body raw.
  const raw = await req.text()
  if (!secret || !signature || !verifyWebhookSignature(raw, signature, secret)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: RzpWebhookBody
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.event) return json({ error: 'missing event' }, { status: 400 })

  const config = razorpayConfig()
  const subscription = body.payload?.subscription?.entity ?? null
  const userId = subscription ? subscriptionUserId(subscription) : null
  const eventId = req.headers.get('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex')
  const environment: BillingEventDoc['environment'] = config ? razorpayEnvironment(config.keyId) : 'production'
  const db = await getDb()

  const events = db.collection<BillingEventDoc>(BILLING_EVENTS)
  const filter = { provider: 'razorpay' as const, environment, eventId }
  let retryUserId = userId
  let retrySubscriptionId = subscription?.id
  try {
    await db.collection<Omit<BillingEventDoc, '_id'>>(BILLING_EVENTS).insertOne({
      provider: 'razorpay',
      environment,
      eventId,
      type: body.event,
      emailKind: environment === 'production' ? subscriptionEmailKind('razorpay', body.event) : null,
      userId,
      receivedAt: new Date(),
      processedAt: null,
      state: 'received',
      attempts: 0,
      // Identifiers and lifecycle fields only. No payment instrument details.
      summary: {
        subscriptionId: subscription?.id ?? null,
        status: subscription?.status ?? null,
        planId: subscription?.plan_id ?? null,
        paymentId: body.payload?.payment?.entity?.id ?? null,
        currentEnd: subscription?.current_end ?? null,
      },
    })
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err
    const stored = await events.findOne(filter)
    if (!stored || stored.state === 'processed') return json({ ok: true, duplicate: true })
    retryUserId = stored.userId
    retrySubscriptionId = typeof stored.summary.subscriptionId === 'string' ? stored.summary.subscriptionId : undefined
  }

  // Payment-only events and subscriptions we didn't create (no userId note)
  // carry nothing we act on.
  if (!retrySubscriptionId || !retryUserId) return json({ ok: true, ignored: 'no subscription for a known user' })

  try {
    await recordRazorpaySubscription(retryUserId, retrySubscriptionId)
    await events.updateOne(filter, { $set: { state: 'processed', processedAt: new Date() }, $inc: { attempts: 1 } })
    scheduleSubscriptionEmails()
    return json({ ok: true })
  } catch (err) {
    const message = err instanceof BillingProviderError ? `${err.message} (status ${err.status})` : (err as Error).message
    console.error('razorpay webhook: re-verification failed for', userId, message)
    await events.updateOne(filter, { $set: { state: 'failed', error: message }, $inc: { attempts: 1 } })
    return json({ ok: false, deferred: true }, { status: 503 })
  }
}
