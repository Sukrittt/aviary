import { createHash, randomUUID } from 'node:crypto'
import { after } from 'next/server'
import type { Db } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import type { UserDoc } from '@/lib/users'
import { BILLING_EVENTS, BILLING_SUBSCRIPTIONS, type BillingEventDoc, type BillingSubscriptionDoc } from '@/lib/billing/records'
import { deliverClaimedEmail } from './delivery'
import type { WelcomeDelivery } from './welcome'
import { SUPPORT_EMAIL } from './transactionalTemplate'
import { subscriptionTemplate } from './subscriptionTemplate'

export const EMAIL_OUTBOX = 'email_outbox'
interface SubscriptionEmail { _id: string; user_id: string; delivery: WelcomeDelivery }

export function scheduleSubscriptionEmails(): void {
  try {
    after(async () => {
      try { await retrySubscriptionEmails(1) } catch { console.error('[subscription-email] worker failed; cron will retry') }
    })
  } catch { console.error('[subscription-email] scheduling failed; cron will retry') }
}

/** Queue only new, authenticated events after provider reconciliation succeeds. */
export async function prepareSubscriptionEmails(db: Db): Promise<void> {
  const subscriptions = db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS)
  const events = db.collection<BillingEventDoc>(BILLING_EVENTS)
  // A durable marker makes successful web cancellation recoverable even if the response worker fails.
  const cancelled = await subscriptions.find({ cancellationEmailPending: true, environment: 'production' }).limit(20).toArray()
  for (const row of cancelled) {
    const eventId = `cancel-request/${row.storeTransactionId}`
    await events.updateOne({ provider: row.provider, environment: row.environment, eventId }, { $setOnInsert: {
      provider: row.provider, environment: row.environment, eventId, type: 'subscription.cancelled', userId: row.userId,
      receivedAt: new Date(), processedAt: new Date(), state: 'processed', attempts: 0, emailKind: 'cancelled',
      summary: { subscriptionId: row.storeTransactionId, currentEnd: row.expiresAt ? row.expiresAt.getTime() / 1000 : null },
    } }, { upsert: true })
    await subscriptions.updateOne({ _id: row._id }, { $unset: { cancellationEmailPending: '' } })
  }
  const pending = await events.find({ state: 'processed', environment: 'production', emailKind: { $in: ['paid', 'failed', 'cancelled'] }, emailHandledAt: { $exists: false } }).sort({ receivedAt: 1 }).limit(20).toArray()
  for (const event of pending) {
    if (!event.userId || !event.emailKind) continue
    const user = await db.collection<UserDoc>('users').findOne({ _id: event.userId, deleted_at: null, emailVerified: { $ne: false } })
    if (!user) {
      await events.updateOne({ _id: event._id }, { $set: { emailHandledAt: new Date() } })
      continue
    }
    const purchaseId = event.provider !== 'revenuecat' ? event.summary.subscriptionId : event.summary.productId
    if (typeof purchaseId !== 'string') continue
    const row = await subscriptions.findOne({ userId: event.userId, provider: event.provider, environment: 'production', ...(event.provider !== 'revenuecat' ? { storeTransactionId: purchaseId } : { productId: purchaseId }) })
    if (!row) continue // A verified owned subscription is required; retry after reconciliation.
    // Do not send a delayed failure notice after the subscription has recovered.
    if (event.emailKind === 'failed' && !['grace', 'on_hold', 'pending'].includes(row.status)) {
      await events.updateOne({ _id: event._id }, { $set: { emailHandledAt: new Date() } })
      continue
    }
    const identity = event.provider !== 'revenuecat' ? row.storeTransactionId : (event.summary.originalTransactionId ?? row.providerRefs.originalTransactionId ?? row.storeTransactionId)
    const cycle = event.summary.currentEnd ?? event.summary.expirationAtMs ?? row.expiresAt?.getTime() ?? event.eventId
    const occurrence = event.emailKind === 'paid' ? (event.summary.paymentId ?? event.summary.transactionId ?? event.eventId) : event.emailKind === 'failed' ? cycle : cycle
    const id = createHash('sha256').update(JSON.stringify([event.provider, event.userId, identity, event.emailKind, occurrence])).digest('hex')
    const now = new Date()
    const eventExpiry = event.provider !== 'revenuecat' ? typeof event.summary.currentEnd === 'number' ? event.summary.currentEnd * 1000 : null : typeof event.summary.expirationAtMs === 'number' ? event.summary.expirationAtMs : null
    const expiresAt = eventExpiry ? new Date(eventExpiry) : row.expiresAt
    await db.collection<SubscriptionEmail>(EMAIL_OUTBOX).updateOne({ _id: id }, { $setOnInsert: {
      user_id: event.userId,
      delivery: { state: 'pending', queuedAt: now, nextAttemptAt: now, attempts: 0, message: {
        from: process.env.RESEND_FROM_EMAIL?.trim() || 'Aviary <hello@useaviary.com>', to: [user.email],
        reply_to: process.env.RESEND_REPLY_TO?.trim() || SUPPORT_EMAIL,
        ...subscriptionTemplate(event.emailKind, user.name, row.store, expiresAt, row.provider),
      } },
    } }, { upsert: true })
    await events.updateOne({ _id: event._id }, { $set: { emailHandledAt: new Date() } })
  }
}

export async function retrySubscriptionEmails(limit = 4) {
  const result = { sent: 0, skipped: 0, failed: 0, needs_review: 0, configured: Boolean(process.env.RESEND_API_KEY) }
  if (!result.configured) return result
  const db = await getDb()
  await prepareSubscriptionEmails(db)
  const outbox = db.collection<SubscriptionEmail>(EMAIL_OUTBOX)
  const due = (now: Date) => ({ $or: [ { 'delivery.state': 'pending', 'delivery.nextAttemptAt': { $lte: now } }, { 'delivery.state': 'sending', 'delivery.leaseUntil': { $lte: now } } ] })
  const candidates = await outbox.find(due(new Date())).sort({ 'delivery.queuedAt': 1 }).limit(limit).toArray()
  for (const candidate of candidates) {
    const user = await db.collection<UserDoc>('users').findOne({ _id: candidate.user_id, deleted_at: null, emailVerified: { $ne: false } }, { projection: { _id: 1 } })
    if (!user) {
      await outbox.deleteOne({ _id: candidate._id })
      result.skipped++
      continue
    }
    const now = new Date(), claim = randomUUID()
    const email = await outbox.findOneAndUpdate({ _id: candidate._id, ...due(now) }, [{ $set: {
      'delivery.state': 'sending', 'delivery.claim': claim, 'delivery.leaseUntil': new Date(now.getTime() + 120_000),
      'delivery.firstAttemptAt': { $ifNull: ['$delivery.firstAttemptAt', now] }, 'delivery.attempts': { $add: ['$delivery.attempts', 1] },
    } }], { returnDocument: 'after' })
    if (!email) { result.skipped++; continue }
    const recipient = await db.collection<UserDoc>('users').findOne({ _id: email.user_id, deleted_at: null, emailVerified: { $ne: false } }, { projection: { email: 1 } })
    if (!recipient || email.delivery.message.to.length !== 1 || email.delivery.message.to[0] !== recipient.email) {
      await outbox.updateOne({ _id: email._id, 'delivery.claim': claim }, { $set: { 'delivery.state': 'needs_review', 'delivery.error': 'Account email changed before delivery' }, $unset: { 'delivery.claim': '', 'delivery.leaseUntil': '' } })
      result.needs_review++
      continue
    }
    result[await deliverClaimedEmail(email.delivery, `subscription/${email._id}`, now, change => outbox.updateOne({ _id: email._id, 'delivery.claim': claim }, {
      $set: Object.fromEntries(Object.entries(change.$set).map(([key, value]) => [`delivery.${key}`, value])),
      $unset: Object.fromEntries(Object.keys(change.$unset).map(key => [`delivery.${key}`, ''])),
    }))]++
    await new Promise(resolve => setTimeout(resolve, 600))
  }
  result.needs_review = await outbox.countDocuments({ 'delivery.state': 'needs_review' })
  return result
}
