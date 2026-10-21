import type { Db } from 'mongodb'

const COLLECTION = 'notification_threshold_state'

/**
 * Atomically records `category`'s current crossed level for `month` and
 * reports whether it just rose above where it was last recorded. A drop
 * (edited/deleted expense) lowers the recorded level, so climbing back past
 * the same threshold later fires again — this replaces the old "claimed
 * forever this month" dedupe for threshold/overspend pushes. One person can
 * be in several budgets with a "Food" each, so another budget's category is
 * stored under its id; the personal budget keeps the bare names it always had.
 */
export async function syncLevel(db: Db, userId: string, month: string, category: string, level: number, spaceId = userId): Promise<boolean> {
  const prev = await db.collection(COLLECTION).findOneAndUpdate(
    { user_id: userId, month, category: spaceId === userId ? category : `${spaceId}:${category}` },
    { $set: { level, updatedAt: new Date() } },
    { upsert: true, returnDocument: 'before' },
  )
  return level > (prev?.level ?? 0)
}
