import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { invalidateCategoryMap } from '@/lib/categoryMap'
import { ARCHIVABLE_COLLECTIONS, isArchivableCollection, purgesAt, type ArchivableCollection } from '@/lib/archive'
import type { ScopedCollection } from '@/lib/scoped'

export const dynamic = 'force-dynamic'

/** A short human label for an archived row, per collection's natural identity field. */
function labelFor(collection: ArchivableCollection, doc: Record<string, unknown>): string {
  switch (collection) {
    case 'expenses':
      return String(doc.item ?? '')
    case 'budgets':
      return `${doc.category ?? ''} · ${doc.month ?? ''}`
    case 'categories':
    case 'groups':
    case 'holdings':
      return String(doc.name ?? '')
    case 'subscriptions':
      return String(doc.service ?? '')
  }
}

/** The amount a row represents, where the collection has one — omitted for categories/groups. */
function amountFor(collection: ArchivableCollection, doc: Record<string, unknown>): number | undefined {
  switch (collection) {
    case 'expenses':
    case 'subscriptions':
      return typeof doc.amount_inr === 'number' ? doc.amount_inr : undefined
    case 'budgets':
      return typeof doc.assigned === 'number' ? doc.assigned : undefined
    case 'holdings':
      return typeof doc.value === 'number' ? doc.value : undefined
    case 'categories':
    case 'groups':
      return undefined
  }
}

/**
 * The natural-key filter that would collide with a restored row — mirrors
 * each collection's own DELETE route. `expenses` has no natural key (matched
 * by `_id` alone), so restoring one can never collide.
 */
function collisionFilter(collection: ArchivableCollection, doc: Record<string, unknown>): Record<string, unknown> | null {
  switch (collection) {
    case 'expenses':
      return null
    case 'budgets':
      return { month: doc.month, category: doc.category }
    case 'categories':
    case 'groups':
    case 'holdings':
      return { name: doc.name }
    case 'subscriptions':
      return { service: doc.service }
  }
}

/** Extra cache tags a restore must bust, beyond the collection's own — mirrors what each DELETE route invalidates. */
function extraInvalidations(collection: ArchivableCollection): string[] {
  switch (collection) {
    case 'expenses':
      return ['wrapped']
    case 'budgets':
    case 'categories':
    case 'groups':
    case 'holdings':
    case 'subscriptions':
      return []
  }
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const url = new URL(req.url)
  const requested = url.searchParams.get('collection')
  if (requested === null) {
    return listArchive(auth, ARCHIVABLE_COLLECTIONS)
  }
  if (!isArchivableCollection(requested)) return error('unknown collection', 400)
  return listArchive(auth, [requested])
}

async function listArchive(auth: Awaited<ReturnType<typeof getAuth>>, names: readonly ArchivableCollection[]) {
  const items = []
  for (const name of names) {
    const coll = await getCollection(name, auth)
    const docs = await coll.find({ deleted_at: { $ne: null } }, {}, { includeDeleted: true }).toArray()
    for (const doc of docs) {
      const deletedAt = String(doc.deleted_at)
      const amount = amountFor(name, doc)
      items.push({
        id: String(doc._id),
        collection: name,
        label: labelFor(name, doc),
        deletedAt,
        purgesAt: purgesAt(deletedAt),
        ...(amount !== undefined ? { amount } : {}),
      })
    }
  }
  items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
  return json({ items })
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  const collection = typeof body.collection === 'string' ? body.collection : ''
  const id = typeof body.id === 'string' ? body.id : ''
  if (!isArchivableCollection(collection)) return error('unknown collection', 400)
  if (!id || !ObjectId.isValid(id)) return error('id required', 400)

  const coll: ScopedCollection = await getCollection(collection, auth)
  const archived = await coll.findOne({ _id: new ObjectId(id) }, {}, { includeDeleted: true })
  if (!archived || !archived.deleted_at) return error('archived item not found', 404)

  const filter = collisionFilter(collection, archived)
  if (filter) {
    const collision = await coll.findOne(filter)
    if (collision) {
      return error('a live item with the same name already exists — rename or delete it before restoring', 409)
    }
  }

  // A category whose group was deleted would render nowhere, so bring the
  // group back from Archive too, or fall back to ungrouped if it's gone for
  // good. Done before the restore so a failure here leaves nothing dangling.
  if (collection === 'categories' && archived.group) {
    const groups = await getCollection('groups', auth)
    if (!(await groups.findOne({ name: archived.group }))) {
      const archivedGroup = await groups.findOne({ name: archived.group }, {}, { includeDeleted: true })
      if (archivedGroup) await groups.restore({ _id: archivedGroup._id })
      else await coll.updateMany({ _id: new ObjectId(id) }, { $set: { group: '' } }, {}, { includeDeleted: true })
      invalidate('groups', auth.userId)
    }
  }

  await coll.restore({ _id: new ObjectId(id) })

  invalidate(collection, auth.userId)
  for (const tag of extraInvalidations(collection)) invalidate(tag, auth.userId)
  if (collection === 'expenses') invalidateCategoryMap(auth.userId)

  return json({ ok: true })
}

/** Manual "delete forever" — purges an already-archived row before the GC cron would. */
export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  const collection = typeof body.collection === 'string' ? body.collection : ''
  const id = typeof body.id === 'string' ? body.id : ''
  if (!isArchivableCollection(collection)) return error('unknown collection', 400)
  if (!id || !ObjectId.isValid(id)) return error('id required', 400)

  const coll: ScopedCollection = await getCollection(collection, auth)
  const archived = await coll.findOne({ _id: new ObjectId(id) }, {}, { includeDeleted: true })
  if (!archived || !archived.deleted_at) return error('archived item not found', 404)

  await coll.purge({ _id: new ObjectId(id) })

  return json({ ok: true })
}
