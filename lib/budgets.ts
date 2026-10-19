import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import { reconcileThresholdLevels } from '@/lib/notifications/instant'

/**
 * The one way a month's budget row is first created. Lifted out of
 * `POST /api/budgets` so the import commit shares it. `'exists'` when the
 * unique `{user_id, month, category}` index already holds a row: a later
 * change goes through PUT, with its version check.
 */
export async function createBudgetRow(
  auth: Auth,
  row: { month: string; category: string; assigned: string; rolled_over?: string },
): Promise<'created' | 'exists'> {
  const coll = await getCollection('budgets', auth)
  try {
    await coll.insertOne({ month: row.month, category: row.category, assigned: row.assigned, rolled_over: row.rolled_over ?? '0', version: 1 })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 'exists'
    throw err
  }
  invalidate('budgets', auth.spaceId)
  await reconcileThresholdLevels(auth, [row.category], row.month)
  return 'created'
}
