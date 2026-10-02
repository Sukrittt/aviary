import { subscriptionEmailKind } from '@/lib/email/subscriptionTemplate'
import { scheduleSubscriptionEmails } from '@/lib/email/subscription'
import { timingSafeEqual, createHash } from 'node:crypto'
import { json } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { BILLING_EVENTS, type BillingEventDoc } from '@/lib/billing/records'
import { refreshFromProvider } from '@/lib/billing/service'
import { BillingProviderError } from '@/lib/billing/providerError'

export const dynamic = 'force-dynamic'

/** Constant-time comparison, normalizing length via SHA-256. Same shape as the cron routes'. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

interface RcWebhookEvent {
  id?: string
  type?: string
  app_user_id?: string
  original_app_user_id?: string
  environment?: string
  product_id?: string
  store?: string
  expiration_at_ms?: number
  event_timestamp_ms?: number
  period_type?: string
  cancel_reason?: string
  price?: number
  transaction_id?: string
  original_transaction_id?: string
}

/**
 * RevenueCat webhook ingest.
 *
 * Three rules, in order:
 *
 * 1. **Authenticate.** RevenueCat sends the value configured in its dashboard
 *    verbatim as `Authorization`. Anyone can POST here otherwise.
 * 2. **Persist durably, exactly once.** The unique index on
 *    provider+environment+eventId turns a duplicate delivery into a no-op
 *    insert, which is what makes retries, replays and out-of-order delivery
 *    safe.
 * 3. **Re-fetch, never trust.** The payload says *something changed*; it is
 *    not itself proof of state. The account is re-verified against the
 *    provider before anything about its access moves.
 *
 * A failure to re-verify still returns 200: the event is already stored, so
 * the reconciliation job will finish the work. Answering 5xx would make
 * RevenueCat redeliver an event we have durably accepted.
 *
 * Note this route is exempt from middleware's Bearer gate (see
 * middleware.ts) — the Authorization header here is a shared secret, not a
 * WorkOS token, and verifying it as a JWT would 401 every delivery.
 */
export async function POST(req: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, secret)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { event?: RcWebhookEvent }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, { status: 400 })
  }

  const event = body.event
  if (!event?.id || !event.type) return json({ error: 'missing event id or type' }, { status: 400 })

  // RevenueCat's `app_user_id` is the identity the app logged in with — our
  // WorkOS user id. `original_app_user_id` can still be an anonymous
  // pre-login id, so it is never used to decide whose access changes.
  const userId = event.app_user_id ?? null
  const environment: BillingEventDoc['environment'] = event.environment === 'SANDBOX' ? 'sandbox' : 'production'
  const db = await getDb()

  try {
    await db.collection<Omit<BillingEventDoc, '_id'>>(BILLING_EVENTS).insertOne({
      provider: 'revenuecat',
      environment,
      eventId: event.id,
      type: event.type,
      emailKind: event.environment === 'PRODUCTION' && event.store !== 'PROMOTIONAL' ? subscriptionEmailKind('revenuecat', event.type, event.period_type, event.cancel_reason, event.price) : null,
      userId,
      receivedAt: new Date(),
      processedAt: null,
      state: 'received',
      attempts: 0,
      // Identifiers and lifecycle fields only. A full receipt is payment data
      // we have no reason to keep, and every field kept is a field to protect.
      summary: {
        transactionId: event.transaction_id ?? null,
        originalTransactionId: event.original_transaction_id ?? null,
        productId: event.product_id ?? null,
        store: event.store ?? null,
        expirationAtMs: event.expiration_at_ms ?? null,
        eventTimestampMs: event.event_timestamp_ms ?? null,
      },
    })
  } catch (err) {
    // Already ingested. RevenueCat retries on anything but a 2xx, so this is
    // the expected path for a redelivery, not an error.
    if ((err as { code?: number }).code === 11000) return json({ ok: true, duplicate: true })
    throw err
  }

  if (!userId) return json({ ok: true, ignored: 'no app_user_id' })

  const events = db.collection<BillingEventDoc>(BILLING_EVENTS)
  const filter = { provider: 'revenuecat' as const, environment, eventId: event.id }
  try {
    await refreshFromProvider(userId)
    await events.updateOne(filter, { $set: { state: 'processed', processedAt: new Date() }, $inc: { attempts: 1 } })
    scheduleSubscriptionEmails()
    return json({ ok: true })
  } catch (err) {
    const message = err instanceof BillingProviderError ? `${err.message} (status ${err.status})` : (err as Error).message
    console.error('billing webhook: re-verification failed for', userId, message)
    await events.updateOne(filter, { $set: { state: 'failed', error: message }, $inc: { attempts: 1 } })
    return json({ ok: true, deferred: true })
  }
}
