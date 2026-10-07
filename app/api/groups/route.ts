import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('groups', auth)
  const docs = await coll.find({}).sort({ order: 1 }).toArray()
  return json(docs.map((d) => d.name).filter(Boolean))
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')

  const coll = await getCollection('groups', auth)
  const exists = await coll.findOne({ name: String(body.name) })
  if (exists) return error('group already exists', 409)
  const maxDoc = await coll.find({}).sort({ order: -1 }).limit(1).next()
  const order = (maxDoc && typeof maxDoc.order === 'number' ? maxDoc.order : 0) + 1
  await coll.insertOne({ name: String(body.name), order })
  invalidate('groups', auth.userId)
  return json({ ok: true })
}

export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')

  const coll = await getCollection('groups', auth)
  const existing = await coll.findOne({ name: String(body.name) })
  if (!existing) return error('group not found', 404)

  if (body.newName && body.newName !== body.name) {
    const newName = String(body.newName)
    const dupe = await coll.findOne({ name: newName })
    if (dupe) return error('group already exists', 409)
    await coll.updateOne({ name: String(body.name) }, { $set: { name: newName } })
    const catColl = await getCollection('categories', auth)
    await catColl.updateMany({ group: String(body.name) }, { $set: { group: newName } })
    invalidate('categories', auth.userId)
  }
  invalidate('groups', auth.userId)
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')

  const coll = await getCollection('groups', auth)
  const result = await coll.deleteOne({ name: String(body.name) })
  if (result.deletedCount === 0) return error('group not found', 404)

  // Its categories go to Archive with it (soft delete, restorable for 7 days).
  // Past transactions keep their category name, same as deleting one category.
  const catColl = await getCollection('categories', auth)
  await catColl.deleteMany({ group: String(body.name) })
  invalidate('categories', auth.userId)
  invalidate('groups', auth.userId)
  return json({ ok: true })
}
