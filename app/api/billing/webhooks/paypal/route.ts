import { subscriptionEmailKind } from '@/lib/email/subscriptionTemplate'
import { scheduleSubscriptionEmails } from '@/lib/email/subscription'
import { json } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { BILLING_EVENTS, BILLING_SUBSCRIPTIONS, type BillingEventDoc, type BillingSubscriptionDoc } from '@/lib/billing/records'
import { recordPayPalSubscription, SubscriptionOwnerError } from '@/lib/billing/service'
import { BillingProviderError } from '@/lib/billing/providerError'
import { paypalConfig, verifyPayPalWebhook } from '@/lib/billing/paypal'

export const dynamic = 'force-dynamic'

interface PpWebhookBody {
  id?: string
  event_type?: string
  resource?: {
    id?: string
    status?: string
    plan_id?: string
    custom_id?: string
    custom?: string
    /** On PAYMENT.SALE.* events: the subscription the sale belongs to. */
    billing_agreement_id?: string
  }
}

/**
 * PayPal webhook ingest. The same three rules as the Razorpay one:
 *
 * 1. **Authenticate.** PayPal's verify-webhook-signature endpoint confirms
 *    the delivery is genuine. Anyone can POST here otherwise.
 * 2. **Persist durably, exactly once.** Keyed on PayPal's event id.
 * 3. **Re-fetch, never trust.** The subscription is fetched from PayPal again
 *    before access moves, and its own `custom_id` says whose it is.
 *
 * Exempt from middleware's Bearer gate by its path (/api/billing/webhooks/).
 */
export async function POST(req: Request) {
  const config = paypalConfig()
  const raw = await req.text()
  if (!config) return json({ error: 'unauthorized' }, { status: 401 })

  let verified: boolean
  try {
    verified = await verifyPayPalWebhook(req.headers, raw)
  } catch (err) {
    // PayPal couldn't vouch for it this second. Say so, and it redelivers.
    console.error('paypal webhook: signature check unavailable', (err as Error).message)
    return json({ ok: false, deferred: true }, { status: 503 })
  }
  if (!verified) return json({ error: 'unauthorized' }, { status: 401 })

  let body: PpWebhookBody
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid body' }, { status: 400 })
  }
  if (!body.event_type || !body.id) return json({ error: 'missing event' }, { status: 400 })

  const resource = body.resource ?? {}
  const subscriptionId = body.event_type.startsWith('BILLING.SUBSCRIPTION.') ? resource.id : resource.billing_agreement_id
  // Payment-only events for things that aren't subscriptions carry nothing we act on.
  if (!subscriptionId) return json({ ok: true, ignored: 'no subscription' })

  const db = await getDb()
  const environment = config.environment
  // Sale events don't always carry `custom_id`; a row we already hold knows the owner.
  const userId =
    resource.custom_id ??
    resource.custom ??
    (await db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).findOne({ provider: 'paypal', environment, storeTransactionId: subscriptionId }, { projection: { userId: 1 } }))?.userId ??
    null

  const events = db.collection<BillingEventDoc>(BILLING_EVENTS)
  const filter = { provider: 'paypal' as const, environment, eventId: body.id }
  try {
    await db.collection<Omit<BillingEventDoc, '_id'>>(BILLING_EVENTS).insertOne({
      ...filter,
      type: body.event_type,
      emailKind: environment === 'production' ? subscriptionEmailKind('paypal', body.event_type) : null,
      userId,
      receivedAt: new Date(),
      processedAt: null,
      state: 'received',
      attempts: 0,
      // Identifiers and lifecycle fields only. No payment instrument details.
      summary: {
        subscriptionId,
        status: resource.status ?? null,
        planId: resource.plan_id ?? null,
        paymentId: body.event_type.startsWith('PAYMENT.') ? (resource.id ?? null) : null,
        currentEnd: null,
      },
    })
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err
    const stored = await events.findOne(filter)
    if (!stored || stored.state === 'processed') return json({ ok: true, duplicate: true })
  }

  try {
    // Null owner lets PayPal's record decide; a known one must match it.
    await recordPayPalSubscription(userId, subscriptionId)
    const row = await db
      .collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
      .findOne({ provider: 'paypal', environment, storeTransactionId: subscriptionId }, { projection: { userId: 1, expiresAt: 1 } })
    // The owner and paid-through date, now known, are what the email job reads.
    await events.updateOne(filter, {
      $set: {
        state: 'processed',
        processedAt: new Date(),
        userId: row?.userId ?? userId,
        'summary.currentEnd': row?.expiresAt ? Math.floor(row.expiresAt.getTime() / 1000) : null,
      },
      $inc: { attempts: 1 },
    })
    scheduleSubscriptionEmails()
    return json({ ok: true })
  } catch (err) {
    // Not one of ours (made outside our checkout, or its owner doesn't
    // match). Retrying won't change that, so don't ask PayPal to.
    if (err instanceof SubscriptionOwnerError) {
      await events.updateOne(filter, { $set: { state: 'processed', processedAt: new Date(), error: err.message }, $inc: { attempts: 1 } })
      return json({ ok: true, ignored: 'not our subscription' })
    }
    const message = err instanceof BillingProviderError ? `${err.message} (status ${err.status})` : (err as Error).message
    console.error('paypal webhook: re-verification failed for', subscriptionId, message)
    await events.updateOne({ ...filter, state: { $ne: 'processed' } }, { $set: { state: 'failed', error: message }, $inc: { attempts: 1 } })
    return json({ ok: false, deferred: true }, { status: 503 })
  }
}
