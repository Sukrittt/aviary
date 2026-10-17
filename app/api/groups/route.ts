import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { isCategoryIconKey } from '@/src/lib/categoryIcons'
import { createGroup } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('groups', auth)
  const docs = (await coll.find({}).sort({ order: 1 }).toArray()).filter((d) => d.name)
  // Plain names by default (Mobile reads string[]); ?icons=1 adds each picked icon.
  if (new URL(req.url).searchParams.get('icons') === '1')
    return json(docs.map((d) => ({ name: d.name, ...(isCategoryIconKey(d.icon) ? { icon: d.icon } : {}) })))
  return json(docs.map((d) => d.name))
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')

  if ((await createGroup(auth, String(body.name))) === 'exists') return error('group already exists', 409)
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
  if (body.icon !== undefined && !isCategoryIconKey(body.icon)) return error('unknown icon')
  const existing = await coll.findOne({ name: String(body.name) })
  if (!existing) return error('group not found', 404)

  if (body.newName && body.newName !== body.name) {
    const newName = String(body.newName)
    const dupe = await coll.findOne({ name: newName })
    if (dupe) return error('group already exists', 409)
    await coll.updateOne({ name: String(body.name) }, { $set: { name: newName } })
    const catColl = await getCollection('categories', auth)
    // Archived categories too, so restoring one later still finds its group.
    await catColl.updateMany({ group: String(body.name) }, { $set: { group: newName } }, {}, { includeDeleted: true })
    invalidate('categories', auth.userId)
  }
  if (body.icon !== undefined)
    await coll.updateOne({ name: String(body.newName || body.name) }, { $set: { icon: body.icon } })
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
  if (!(await coll.findOne({ name: String(body.name) }))) return error('group not found', 404)

  // Its categories go to Archive with it (soft delete, restorable for 7 days).
  // Past transactions keep their category name, same as deleting one category.
  // Categories first: if the group delete then fails, a retry still works and
  // no live category is left pointing at a missing group.
  const catColl = await getCollection('categories', auth)
  await catColl.deleteMany({ group: String(body.name) })
  await coll.deleteOne({ name: String(body.name) })
  invalidate('categories', auth.userId)
  invalidate('groups', auth.userId)
  return json({ ok: true })
}
