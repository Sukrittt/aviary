import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/** Handled failures, thrown inside the transaction so nothing partial commits. */
class NotFound extends Error {}
class OutOfRange extends Error {}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name || typeof body.toIndex !== 'number') return error('name, toIndex required')

  const coll = await getCollection('categories', auth)
  const groups = await getCollection('groups', auth)
  // Absent means "stay in this group"; '' is the ungrouped Other bucket.
  const toGroup = body.group === undefined ? undefined : String(body.group)

  // Read and renumber in one transaction: the bulkWrite rewrites every order
  // in the group, so a failure or a concurrent move partway through it would
  // leave two categories sharing an order.
  try {
    await withTx(async (session) => {
      const current = await coll.findOne({ name: String(body.name) }, { session })
      if (!current) throw new NotFound('category not found')

      const fromGroup = current.group ?? ''
      const group = toGroup ?? fromGroup
      if (group !== fromGroup && group && !(await groups.findOne({ name: group }, { session }))) {
        throw new NotFound('group not found')
      }
      // A row with no stored group lists as ungrouped (GET), so it counts here too.
      const groupDocs = await coll.find({ group: group || { $in: ['', null] } }, { session }).sort({ order: 1 }).toArray()
      if (group === fromGroup && !groupDocs.some((d) => d.name === body.name)) throw new NotFound('category group not found')
      const rest = groupDocs.map((d) => d.name).filter((n) => n !== body.name)
      if (Number(body.toIndex) < 0 || Number(body.toIndex) > rest.length) throw new OutOfRange('toIndex out of range')

      rest.splice(Number(body.toIndex), 0, String(body.name))

      // An empty destination has no orders to start from.
      const minOrder = groupDocs.length ? Math.min(...groupDocs.map((d) => (typeof d.order === 'number' ? d.order : 0))) : 0
      await coll.bulkWrite(
        rest.map((name, i) => ({
          updateOne: { filter: { name }, update: { $set: { order: minOrder + i, group } } },
        })),
        { session },
      )
    })
  } catch (err) {
    if (err instanceof NotFound) return error(err.message, 404)
    if (err instanceof OutOfRange) return error(err.message, 400)
    throw err
  }

  invalidate('categories', auth.spaceId)
  return json({ ok: true })
}
