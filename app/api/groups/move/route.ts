import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name || typeof body.toIndex !== 'number') return error('name, toIndex required')

  const coll = await getCollection('groups', auth)
  const docs = await coll.find({}).sort({ order: 1 }).toArray()
  const names = docs.map((d) => d.name)
  const fromPos = names.indexOf(String(body.name))
  if (fromPos < 0) return error('group not found', 404)
  if (body.toIndex < 0 || body.toIndex >= names.length) return error('toIndex out of range', 400)

  const rest = names.filter((n) => n !== body.name)
  rest.splice(body.toIndex, 0, String(body.name))

  const minOrder = Math.min(...docs.map((d) => (typeof d.order === 'number' ? d.order : 0)))
  await coll.bulkWrite(
    rest.map((name, i) => ({
      updateOne: { filter: { name }, update: { $set: { order: minOrder + i } } },
    })),
  )
  invalidate('groups', auth.spaceId)
  return json({ ok: true })
}
