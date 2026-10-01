import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import type { Filter } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import type { UserDoc } from '@/lib/users'
import { EmailSendError, sendEmail, type EmailMessage } from './resend'
import { SUPPORT_EMAIL, welcomeTemplate } from './welcomeTemplate'

export interface WelcomeDelivery {
  state: 'pending' | 'sending' | 'sent' | 'needs_review'
  queuedAt: Date
  nextAttemptAt: Date
  attempts: number
  message: EmailMessage
  firstAttemptAt?: Date
  leaseUntil?: Date
  claim?: string
  sentAt?: Date
  resendId?: string
  error?: string
}

/** Persisted atomically with the new user. Freeze content so retries use identical idempotency payloads. */
export function queueWelcomeEmail(user: { email: string; name: string | null }): WelcomeDelivery {
  const now = new Date()
  return {
    state: 'pending', queuedAt: now, nextAttemptAt: now, attempts: 0,
    message: {
      from: process.env.RESEND_FROM_EMAIL?.trim() || 'Aviary <hello@useaviary.com>',
      to: [user.email],
      reply_to: process.env.RESEND_REPLY_TO?.trim() || SUPPORT_EMAIL,
      ...welcomeTemplate(user.name),
    },
  }
}

function dueFilter(now: Date): Filter<UserDoc> {
  return {
    deleted_at: null,
    emailVerified: { $ne: false },
    $or: [
      { 'welcomeEmail.state': 'pending', 'welcomeEmail.nextAttemptAt': { $lte: now } },
      { 'welcomeEmail.state': 'sending', 'welcomeEmail.leaseUntil': { $lte: now } },
    ],
  }
}

/** Runs after a successful authentication response, including Mobile's JIT user creation. */
export function scheduleWelcomeEmail(userId: string): void {
  try {
    after(async () => {
      try { await deliverWelcomeEmail(userId) } catch {
        console.error('[welcome-email] delivery worker failed; the persisted email will be retried')
      }
    })
  } catch {
    console.error('[welcome-email] could not schedule delivery; the persisted email will be retried')
  }
}

export async function deliverWelcomeEmail(userId: string): Promise<'sent' | 'skipped' | 'failed' | 'needs_review'> {
  if (!process.env.RESEND_API_KEY) return 'skipped'
  const db = await getDb()
  const users = db.collection<UserDoc>('users')
  const now = new Date()
  const claim = randomUUID()
  const user = await users.findOneAndUpdate(
    { _id: userId, ...dueFilter(now) },
    [{ $set: {
      'welcomeEmail.state': 'sending',
      'welcomeEmail.claim': claim,
      'welcomeEmail.leaseUntil': new Date(now.getTime() + 120_000),
      'welcomeEmail.firstAttemptAt': { $ifNull: ['$welcomeEmail.firstAttemptAt', now] },
      'welcomeEmail.attempts': { $add: ['$welcomeEmail.attempts', 1] },
    } }],
    { returnDocument: 'after' },
  )
  if (!user?.welcomeEmail) return 'skipped'
  const delivery = user.welcomeEmail
  const owned = { _id: userId, 'welcomeEmail.claim': claim }
  // Leave an ambiguous old send for inspection rather than sending it again
  // after Resend forgets its idempotency key (24 hours). One hour of margin.
  if (now.getTime() - delivery.firstAttemptAt!.getTime() >= 23 * 60 * 60 * 1000) {
    await users.updateOne(owned, { $set: { 'welcomeEmail.state': 'needs_review', 'welcomeEmail.error': 'Check Resend before retrying: the idempotency window has expired' }, $unset: { 'welcomeEmail.claim': '', 'welcomeEmail.leaseUntil': '' } })
    console.error('[welcome-email] an uncertain delivery needs review in Resend')
    return 'needs_review'
  }
  try {
    const resendId = await sendEmail(delivery.message, `welcome/${userId}`)
    await users.updateOne(owned, { $set: { 'welcomeEmail.state': 'sent', 'welcomeEmail.sentAt': new Date(), 'welcomeEmail.resendId': resendId }, $unset: { 'welcomeEmail.claim': '', 'welcomeEmail.leaseUntil': '', 'welcomeEmail.error': '' } })
    return 'sent'
  } catch (err) {
    const definiteRejection = err instanceof EmailSendError && !err.ambiguous && delivery.firstAttemptAt!.getTime() === now.getTime()
    await users.updateOne(owned, {
      $set: { 'welcomeEmail.state': 'pending', 'welcomeEmail.nextAttemptAt': new Date(Date.now() + 15 * 60_000), 'welcomeEmail.error': err instanceof EmailSendError ? err.message : 'Could not record the delivery result' },
      $unset: { 'welcomeEmail.claim': '', 'welcomeEmail.leaseUntil': '', ...(definiteRejection ? { 'welcomeEmail.firstAttemptAt': '' } : {}) },
    })
    console.warn('[welcome-email] delivery deferred for retry')
    return 'failed'
  }
}

/** Daily repair plus retries on sign-in; bounded to fit the serverless execution window. */
export async function retryWelcomeEmails() {
  const result = { sent: 0, skipped: 0, failed: 0, needs_review: 0 }
  if (!process.env.RESEND_API_KEY) return { ...result, configured: false }
  const db = await getDb()
  const users = await db.collection<UserDoc>('users').find(dueFilter(new Date()), { projection: { _id: 1 } }).sort({ 'welcomeEmail.queuedAt': 1 }).limit(8).toArray()
  for (const user of users) {
    result[await deliverWelcomeEmail(user._id)]++
    // Resend's default rate limit is shared by this app's send requests.
    await new Promise(resolve => setTimeout(resolve, 600))
  }
  // Keep unresolved deliveries visible in subsequent admin job runs as well.
  result.needs_review = await db.collection<UserDoc>('users').countDocuments({ deleted_at: null, 'welcomeEmail.state': 'needs_review' })
  return { ...result, configured: true }
}
