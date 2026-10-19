import { randomUUID } from 'node:crypto'
import type { Db, Filter } from 'mongodb'
import type { UserDoc } from '@/lib/users'
import { deliverClaimedEmail } from './delivery'
import type { WelcomeDelivery } from './welcome'

export const EMAIL_OUTBOX = 'email_outbox'
export const LEADS = 'leads'

/**
 * A frozen message waiting in `email_outbox`. Subscription rows carry no
 * `kind`; lifecycle rows (trial, lead and evergreen emails) carry
 * `kind: 'lifecycle'` and the step that produced them, which doubles as the
 * record of what each person has already been sent.
 */
export interface OutboxEmail {
  _id: string
  user_id?: string
  lead_id?: string
  kind?: 'lifecycle'
  step?: string
  delivery: WelcomeDelivery
}

export interface LeadDoc {
  /** sha256 of the email, so outbox ids and Resend keys never carry the address. */
  _id: string
  email: string
  source: 'salary-planner'
  plan: { salary: number; rows: [string, number][] }
  createdAt: Date
  confirmedAt: Date | null
  optedOutAt: Date | null
}

export interface SendResult { sent: number; skipped: number; failed: number; needs_review: number }

/** Where a row may still go: null when the account is gone, unverified, or the reader opted out of this kind of email. */
async function recipient(db: Db, row: OutboxEmail): Promise<string | null> {
  if (row.lead_id) {
    const lead = await db.collection<LeadDoc>(LEADS).findOne({ _id: row.lead_id }, { projection: { email: 1, optedOutAt: 1 } })
    // A plan someone just asked for again is sent even after they turned the tips off.
    return lead && (!lead.optedOutAt || row.step === 'plan') ? lead.email : null
  }
  const user = await db.collection<UserDoc>('users').findOne({ _id: row.user_id, deleted_at: null, emailVerified: { $ne: false } }, { projection: { email: 1, emailOptOutAt: 1 } })
  if (!user) return null
  // The trial-end notice is about the account itself, so an opt-out from tips doesn't stop it.
  if (row.kind === 'lifecycle' && row.step !== 'trial-end' && user.emailOptOutAt) return null
  return user.email
}

/** Send due outbox rows matching `filter`, oldest first. Shares the welcome worker's leases, retries and 23-hour safeguard. */
export async function sendOutbox(db: Db, filter: Filter<OutboxEmail>, limit: number): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0, needs_review: 0 }
  const outbox = db.collection<OutboxEmail>(EMAIL_OUTBOX)
  const due = (now: Date): Filter<OutboxEmail> => ({ ...filter, $or: [ { 'delivery.state': 'pending', 'delivery.nextAttemptAt': { $lte: now } }, { 'delivery.state': 'sending', 'delivery.leaseUntil': { $lte: now } } ] })
  // Mongo reads limit(0) as "no limit"; a spent budget still reports what needs review.
  const candidates = limit > 0 ? await outbox.find(due(new Date())).sort({ 'delivery.queuedAt': 1 }).limit(limit).toArray() : []
  for (const candidate of candidates) {
    if (!(await recipient(db, candidate))) {
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
    const to = await recipient(db, email)
    if (!to || email.delivery.message.to.length !== 1 || email.delivery.message.to[0] !== to) {
      await outbox.updateOne({ _id: email._id, 'delivery.claim': claim }, { $set: { 'delivery.state': 'needs_review', 'delivery.error': 'Account email changed before delivery' }, $unset: { 'delivery.claim': '', 'delivery.leaseUntil': '' } })
      result.needs_review++
      continue
    }
    // Subscription keys predate lifecycle rows and must not change for rows already in flight.
    const key = email.kind ? email._id : `subscription/${email._id}`
    result[await deliverClaimedEmail(email.delivery, key, now, change => outbox.updateOne({ _id: email._id, 'delivery.claim': claim }, {
      $set: Object.fromEntries(Object.entries(change.$set).map(([k, value]) => [`delivery.${k}`, value])),
      $unset: Object.fromEntries(Object.keys(change.$unset).map(k => [`delivery.${k}`, ''])),
    }))]++
    // Resend's default rate limit is shared by this app's send requests.
    await new Promise(resolve => setTimeout(resolve, 600))
  }
  result.needs_review = await outbox.countDocuments({ ...filter, 'delivery.state': 'needs_review' })
  return result
}
