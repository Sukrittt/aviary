import { getDb } from './mongodb'
import type { UserDoc } from './users'
import { resolveCurrency } from '@/src/lib/currencies'
import { nowIn } from '@/lib/http'

/** Read once per server operation; never keep a process-global user preference. */
export async function getUserCurrency(userId: string): Promise<string> {
  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { currencyCode: 1 } })
  return resolveCurrency(user?.currencyCode)
}

/**
 * The currency a budget is kept in. The personal budget's is the user's own
 * setting, as it always was; any other budget carries its own, chosen when it
 * was made, so its members all see one currency.
 */
export async function getBudgetCurrency(auth: { userId: string; spaceId: string }): Promise<string> {
  if (auth.spaceId === auth.userId) return getUserCurrency(auth.userId)
  const db = await getDb()
  const space = await db.collection<{ _id: string; currencyCode?: string }>('spaces').findOne({ _id: auth.spaceId }, { projection: { currencyCode: 1 } })
  return resolveCurrency(space?.currencyCode)
}

/** The user's current local date/timestamp (their `timezone`, IST if never set). */
export async function nowForUser(userId: string): Promise<{ date: string; timestamp: string }> {
  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { timezone: 1 } })
  return nowIn(user?.timezone)
}
