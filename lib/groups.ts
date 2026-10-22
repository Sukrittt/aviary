import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'

/** The one way a group is created: last in order. Lifted out of `app/api/groups` so the import commit shares it. */
export async function createGroup(auth: Auth, name: string, style: { icon?: string; color?: string } = {}): Promise<'created' | 'exists'> {
  const coll = await getCollection('groups', auth)
  if (await coll.findOne({ name })) return 'exists'
  const maxDoc = await coll.find({}).sort({ order: -1 }).limit(1).next()
  const order = (maxDoc && typeof maxDoc.order === 'number' ? maxDoc.order : 0) + 1
  // The unique `(user_id, name)` index decides a race the pre-check lost.
  try {
    await coll.insertOne({ name, order, ...style })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 'exists'
    throw err
  }
  invalidate('groups', auth.spaceId)
  return 'created'
}
