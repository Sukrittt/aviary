import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { EXPENSE_HEADERS, toRow } from '@/lib/models'
import { invalidate } from '@/lib/cache'

export const dynamic = 'force-dynamic'

const row = (d: Record<string, unknown>) => ({ ...toRow(EXPENSE_HEADERS, d), id: String(d._id), version: Number(d.version ?? 0) })

/**
 * `GET /api/expenses/duplicates` — every expense flagged by lib/duplicates.ts,
 * paired with the one it likely double-logs. Deleting either side goes through
 * the normal `DELETE /api/expenses`; a flag whose original is gone is dropped here.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('expenses', auth)

  const flagged = await coll.find({ duplicate_of: { $exists: true } }).sort({ timestamp: -1 }).toArray()
  if (flagged.length === 0) return json({ pairs: [] })

  const originalIds = flagged.map((d) => String(d.duplicate_of)).filter((id) => ObjectId.isValid(id))
  const originals = new Map(
    (await coll.find({ _id: { $in: originalIds.map((id) => new ObjectId(id)) } }).toArray()).map((d) => [String(d._id), d]),
  )

  const orphans = flagged.filter((d) => !originals.has(String(d.duplicate_of))).map((d) => d._id)
  if (orphans.length > 0) {
    await coll.updateMany({ _id: { $in: orphans } }, { $unset: { duplicate_of: '' } })
    invalidate('expenses', auth.spaceId)
  }

  return json({
    pairs: flagged
      .filter((d) => originals.has(String(d.duplicate_of)))
      .map((d) => ({ duplicate: row(d), original: row(originals.get(String(d.duplicate_of))!) })),
  })
}

/** `POST /api/expenses/duplicates` `{ id }` — "Keep both": clears the flag so the pair never comes back. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (typeof body.id !== 'string' || !ObjectId.isValid(body.id)) return error('a valid expense id is required')
  const coll = await getCollection('expenses', auth)
  await coll.updateOne({ _id: new ObjectId(body.id) }, { $unset: { duplicate_of: '' } })
  invalidate('expenses', auth.spaceId)
  return json({ ok: true })
}
