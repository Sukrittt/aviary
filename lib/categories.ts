import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'
import type { CategoryColor } from '@/src/lib/categoryColors'
import { createBudgetRow } from '@/lib/budgets'
import { nowForUser } from '@/lib/userCurrency'
import { parseGoal } from '@/lib/inputValidation'
import type { CategoryGoal } from '@/src/types'

/** A goal is stored as one JSON string so lib/scoped.ts encrypts it: the target is money. */
export const storeGoal = (goal: CategoryGoal): string => JSON.stringify(goal)

/** A stored goal back out, or undefined for none (removed goals are stored as null). */
export function readGoal(stored: unknown): CategoryGoal | undefined {
  if (typeof stored !== 'string') return undefined
  try {
    return parseGoal(JSON.parse(stored)) ?? undefined
  } catch {
    return undefined
  }
}

/** The one way a category is created: last in order. Lifted out of `app/api/categories` so the import commit shares it. */
export async function createCategory(auth: Auth, input: { name: string; group: string; icon?: CategoryIconKey; color?: CategoryColor; goal?: CategoryGoal },
  // Setup import writes this month's target for every category itself, so the
  // fresh 0 below would make its insert-only write report 'exists'.
  opts: { writesTarget?: boolean } = {},
): Promise<'created' | 'exists'> {
  const coll = await getCollection('categories', auth)
  if (await coll.findOne({ name: input.name })) return 'exists'
  const maxDoc = await coll.find({}).sort({ order: -1 }).limit(1).next()
  const order = (maxDoc && typeof maxDoc.order === 'number' ? maxDoc.order : 0) + 1
  // A name with history is a deleted category coming back. It starts fresh this
  // month: `since` keeps lib/budgetCarry.ts from replaying its old target into
  // the months it was gone, and an explicit 0 stops that target carrying in now.
  const history = await (await getCollection('budgets', auth)).findOne({ category: input.name })
    ?? await (await getCollection('expenses', auth)).findOne({ category: input.name })
  // The user's own month, not the server's UTC one: early on the 1st in IST is
  // still last month in UTC, and the 0 row below would land on the old target.
  const since = history ? (await nowForUser(auth.userId)).date.slice(0, 7) : undefined
  // The pre-check above loses to a concurrent create of the same name; the
  // unique index is what actually decides, so report its verdict the same way.
  try {
    await coll.insertOne({ name: input.name, group: input.group, order, ...(input.icon !== undefined ? { icon: input.icon } : {}), ...(input.color !== undefined ? { color: input.color } : {}), ...(input.goal ? { goal: storeGoal(input.goal) } : {}), ...(since ? { since } : {}) })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 'exists'
    throw err
  }
  if (since && !opts.writesTarget) await createBudgetRow(auth, { month: since, category: input.name, assigned: '0' })
  invalidate('categories', auth.spaceId)
  return 'created'
}
