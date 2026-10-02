import { EmailSendError, sendEmail } from './resend'
import type { WelcomeDelivery } from './welcome'

export async function deliverClaimedEmail(delivery: WelcomeDelivery, key: string, now: Date, update: (change: { $set: Record<string, unknown>; $unset: Record<string, string> }) => Promise<unknown>): Promise<'sent' | 'failed' | 'needs_review'> {
  // Leave an ambiguous old send for inspection rather than sending it again
  // after Resend forgets its idempotency key (24 hours). One hour of margin.
  if (now.getTime() - delivery.firstAttemptAt!.getTime() >= 23 * 60 * 60 * 1000) {
    await update({ $set: { 'state': 'needs_review', 'error': 'Check Resend before retrying: the idempotency window has expired' }, $unset: { 'claim': '', 'leaseUntil': '' } })
    console.error('[email] an uncertain delivery needs review in Resend')
    return 'needs_review'
  }
  try {
    const resendId = await sendEmail(delivery.message, key)
    await update({ $set: { 'state': 'sent', 'sentAt': new Date(), 'resendId': resendId }, $unset: { 'claim': '', 'leaseUntil': '', 'error': '' } })
    return 'sent'
  } catch (err) {
    const definiteRejection = err instanceof EmailSendError && !err.ambiguous && delivery.firstAttemptAt!.getTime() === now.getTime()
    await update({
      $set: { 'state': 'pending', 'nextAttemptAt': new Date(Date.now() + 15 * 60_000), 'error': err instanceof EmailSendError ? err.message : 'Could not record the delivery result' },
      $unset: { 'claim': '', 'leaseUntil': '', ...(definiteRejection ? { 'firstAttemptAt': '' } : {}) },
    })
    console.warn('[email] delivery deferred for retry')
    return 'failed'
  }
}
