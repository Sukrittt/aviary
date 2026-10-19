import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import type { CategoryIconKey } from '@/src/lib/categoryIcons'
import type { CategoryColor } from '@/src/lib/categoryColors'

/** The one way a category is created: last in order. Lifted out of `app/api/categories` so the import commit shares it. */
export async function createCategory(auth: Auth, input: { name: string; group: string; icon?: CategoryIconKey; color?: CategoryColor }): Promise<'created' | 'exists'> {
  const coll = await getCollection('categories', auth)
  if (await coll.findOne({ name: input.name })) return 'exists'
  const maxDoc = await coll.find({}).sort({ order: -1 }).limit(1).next()
  const order = (maxDoc && typeof maxDoc.order === 'number' ? maxDoc.order : 0) + 1
  // The pre-check above loses to a concurrent create of the same name; the
  // unique index is what actually decides, so report its verdict the same way.
  try {
    await coll.insertOne({ name: input.name, group: input.group, order, ...(input.icon !== undefined ? { icon: input.icon } : {}), ...(input.color !== undefined ? { color: input.color } : {}) })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return 'exists'
    throw err
  }
  invalidate('categories', auth.userId)
  return 'created'
}
