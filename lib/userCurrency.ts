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

type BudgetSettings = { _id: string; owner_id?: string; currencyCode?: string; onboardedAt?: string | null }

/**
 * Where a budget's currency and setup mark live, and what they are. The
 * personal budget's are its owner's own user settings (the user whose id it
 * is), for everyone in it; any other budget carries its own on its doc, so its
 * members all see one currency. A personal budget handed off at account
 * deletion is stamped with them then (`handOver`); one handed off before that
 * reads the old owner's doc while it lasts.
 */
export async function budgetSettings(auth: { userId: string; spaceId: string }): Promise<{ userDocId: string | null; currencyCode?: string; onboardedAt?: string | null; exists: boolean }> {
  const db = await getDb()
  const space = await db.collection<BudgetSettings>('spaces').findOne({ _id: auth.spaceId }, { projection: { owner_id: 1, currencyCode: 1, onboardedAt: 1 } })
  // No doc: the personal budget before it's renamed or shared.
  const userDocId = space ? (space._id === space.owner_id ? space._id : null) : auth.spaceId === auth.userId ? auth.userId : null
  const user = userDocId || (space && (!space.currencyCode || !space.onboardedAt))
    ? await db.collection<BudgetSettings>('users').findOne({ _id: auth.spaceId }, { projection: { currencyCode: 1, onboardedAt: 1 } })
    : null
  if (userDocId) return { userDocId, currencyCode: user?.currencyCode, onboardedAt: user?.onboardedAt, exists: true }
  return { userDocId, currencyCode: space?.currencyCode ?? user?.currencyCode, onboardedAt: space?.onboardedAt ?? user?.onboardedAt, exists: !!space }
}

/** The currency a budget is kept in (see `budgetSettings`). */
export async function getBudgetCurrency(auth: { userId: string; spaceId: string }): Promise<string> {
  return resolveCurrency((await budgetSettings(auth)).currencyCode)
}

/** The user's current local date/timestamp (their `timezone`, IST if never set). */
export async function nowForUser(userId: string): Promise<{ date: string; timestamp: string }> {
  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { timezone: 1 } })
  return nowIn(user?.timezone)
}
