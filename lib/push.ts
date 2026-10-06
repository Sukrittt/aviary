import { getDb } from './mongodb'
import { COLLECTIONS } from './models'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export type PushToken = {
  token: string
  platform: 'ios' | 'android'
  user_id: string
  createdAt: string
  updatedAt: string
}

const EXPO_PUSH_TOKEN_RE = /^Expo(?:nent)?PushToken\[[\w-]+\]$/

/** A registration belongs to its original account until that account unregisters it. */
export class PushTokenConflict extends Error {
  readonly status = 409
  constructor() { super('push token already registered') }
}

export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
  userId: string,
): Promise<void> {
  if (!EXPO_PUSH_TOKEN_RE.test(token)) throw new Error('invalid push token')

  const db = await getDb()
  const now = new Date().toISOString()
  const coll = db.collection<PushToken>(COLLECTIONS.pushTokens)

  const updated = await coll.updateOne(
    { token, user_id: userId },
    { $set: { platform, updatedAt: now } },
  )
  if (updated.matchedCount > 0) return

  const owner = await coll.findOne({ token })
  if (owner && owner.user_id !== userId) throw new PushTokenConflict()
  if (owner) return
  try {
    await coll.insertOne({ token, platform, user_id: userId, createdAt: now, updatedAt: now })
  } catch (err) {
    // The unique token index also closes the concurrent registration race.
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      const winner = await coll.findOne({ token })
      if (winner?.user_id === userId) return
      throw new PushTokenConflict()
    }
    throw err
  }
}

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound: 'default'
}

type ExpoPushTicket = {
  status: 'ok' | 'error'
  details?: { error?: string }
}

/**
 * Push a notification to one user's registered devices via Expo's push API.
 * Sends that user's tokens in one batched request; tokens Expo reports as
 * DeviceNotRegistered are pruned from `push_tokens`. Individual per-device
 * send failures are logged, not thrown — only a failure of the HTTP call
 * itself propagates. Returns how many devices Expo accepted.
 *
 * `userId` is required rather than optional on purpose: this used to send to
 * every registered device on the platform, and an accidental omission would
 * silently restore that.
 */
export async function sendPushNotification({
  userId,
  title,
  body,
  data,
}: {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
}): Promise<number> {
  const db = await getDb()
  const coll = db.collection<PushToken>(COLLECTIONS.pushTokens)
  const tokens = await coll.find({ user_id: userId }).toArray()
  if (tokens.length === 0) return 0

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    data,
    sound: 'default',
  }))

  const resp = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })

  if (!resp.ok) {
    throw new Error(`Expo push send failed: ${resp.status}`)
  }

  const result = (await resp.json()) as { data?: ExpoPushTicket[] }
  const tickets = result.data ?? []

  const staleTokens: string[] = []
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error') {
      console.error('Expo push error for token', tokens[i]?.token, ticket.details?.error)
      if (ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(tokens[i].token)
      }
    }
  })

  if (staleTokens.length > 0) {
    await coll.deleteMany({ token: { $in: staleTokens } })
  }
  return tickets.filter((t) => t.status === 'ok').length
}
