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

/**
 * Register a device's push token for the account signed in on it. A token
 * belongs to one physical device, so it follows whoever is signed in there
 * now: a sign-out that never reached the server (offline, app killed,
 * uninstalled) used to leave the token owned by the old account, and every
 * later account on that phone silently got no pushes. Only that device can
 * produce the token, so taking it over hands nobody else's notifications to
 * a stranger. It also revives a token archived with a deleted account.
 */
export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
  userId: string,
): Promise<void> {
  if (!EXPO_PUSH_TOKEN_RE.test(token)) throw new Error('invalid push token')

  const db = await getDb()
  const now = new Date().toISOString()
  const coll = db.collection<PushToken>(COLLECTIONS.pushTokens)
  const write = () => coll.updateOne(
    { token },
    {
      $set: { platform, user_id: userId, updatedAt: now },
      $setOnInsert: { createdAt: now },
      $unset: { deleted_at: '', account_deleted_at: '' },
    },
    { upsert: true },
  )
  try {
    await write()
  } catch (err) {
    // Two first registrations racing: the unique token index rejects one
    // insert, and the row it lost to now exists, so retry as a plain update.
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) await write()
    else throw err
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
