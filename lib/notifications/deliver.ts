import type { Db } from 'mongodb'
import { Type } from '@google/genai'
import { generateJSON } from '@/lib/ai/gemini'
import { sendPushNotification } from '@/lib/push'
import { COLLECTIONS } from '@/lib/models'
import type { Notification } from './rules'
import { syncLevel } from './thresholdState'

/**
 * Claim-then-send plumbing shared by the daily cron
 * (`app/api/notifications/run`) and the instant threshold check fired
 * right after an expense is logged (`lib/notifications/instant.ts`). Both
 * call sites produce `Notification`s from the same pure `buildNotifications`
 * — this is just the I/O (dedupe log + Gemini enrichment + push) that turns
 * one into an actual send.
 */

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
}

/** Claims `key` in the send log; returns true if this call won the claim (i.e. it hasn't been sent yet). */
export async function claim(db: Db, userId: string, key: string): Promise<boolean> {
  try {
    await db.collection(COLLECTIONS.notificationLog).insertOne({ user_id: userId, key, sentAt: new Date() })
    return true
  } catch (err) {
    if (isDuplicateKeyError(err)) return false
    throw err
  }
}

/**
 * Releases a claim so a later run can retry it. Call after a claimed `key`'s
 * push send throws — without this, a transient Expo/network failure burns
 * the key permanently: the log already says "sent", so every future run
 * skips it and the user never gets that notification, silently.
 */
export async function unclaim(db: Db, userId: string, key: string): Promise<void> {
  await db.collection(COLLECTIONS.notificationLog).deleteOne({ user_id: userId, key })
}

/**
 * Upgrade a 'coach' notification's body with a Gemini-written suggestion,
 * grounded in the same FACTS text used for the money-brain chat/brief. Falls
 * back to the plain arithmetic body from `rules.ts` on any failure — the
 * notification still sends either way.
 */
async function enrichCoachNotification(userId: string, notification: Notification, facts: string): Promise<Notification> {
  try {
    const prompt = [
      'You are writing a single push-notification nudge for a personal expense tracker, grounded strictly in the FACTS below.',
      'The user is at risk of overspending this month. Write one concrete, specific suggestion — e.g. moving slack from an',
      'under-spent category to cover the shortfall guilt-free, or naming the one to cut back on.',
      'Keep the body to one sentence, at most 140 characters. Never invent a number not present in FACTS.',
      '',
      'FACTS:',
      facts,
    ].join('\n')

    const result = await generateJSON<{ title: string; body: string }>(prompt, {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        body: { type: Type.STRING },
      },
      required: ['title', 'body'],
    }, { userId, feature: 'coach' })
    return { ...notification, title: result.title, body: result.body }
  } catch (err) {
    console.error('notifications: coach enrichment failed, using fallback body', err)
    return notification
  }
}

/**
 * Claims `notification.key`; if this call wins the claim, sends it (enriching
 * a 'coach' notification with Gemini first). Returns whether it was actually
 * sent — false for an already-claimed key or a push failure, never throws.
 *
 * 'threshold' and 'overspent' don't use the permanent key claim — spending
 * can drop below a threshold and rise past it again in the same month, and a
 * one-time claim would block that re-fire forever. Instead they gate on
 * `syncLevel`: did the category's level just rise above where it was last
 * recorded (see thresholdState.ts).
 */
export async function claimAndSend(db: Db, userId: string, notification: Notification, facts: string, spaceId = userId): Promise<boolean> {
  if (notification.kind === 'threshold' || notification.kind === 'overspent') {
    const { month, category, level } = notification.data as { month: string; category: string; level: number }
    if (!(await syncLevel(db, userId, month, category, level, spaceId))) return false
  } else if (!(await claim(db, userId, notification.key))) return false

  const toSend = notification.kind === 'coach' ? await enrichCoachNotification(userId, notification, facts) : notification

  try {
    await sendPushNotification({
      userId,
      title: toSend.title,
      body: toSend.body,
      data: toSend.data,
    })
    return true
  } catch (err) {
    console.error('notifications: send failed for', userId, notification.key, err)
    if (notification.kind !== 'threshold' && notification.kind !== 'overspent') {
      await unclaim(db, userId, notification.key)
    }
    return false
  }
}
