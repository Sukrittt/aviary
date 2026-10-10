import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { nowForUser } from '@/lib/userCurrency'
import { invalidate } from '@/lib/cache'
import { accountLimitError, accountRow, ACCOUNT_HEADERS, parseAccountInput } from '@/lib/accounts'

export const dynamic = 'force-dynamic'

/** `GET /api/accounts`: every account, archived ones included so old rows keep their label. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('accounts', auth)
  const docs = await coll.find({}).sort({ created_at: 1 }).toArray()
  return json({ headers: ACCOUNT_HEADERS, rows: docs.map(accountRow) })
}

function sameName(a: unknown, b: string) {
  return String(a ?? '').trim().toLowerCase() === b.toLowerCase()
}

/** `POST /api/accounts` `{ name, type }`. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const input = parseAccountInput(await readBody(req))
  if (!input?.name || !input.type) return error('name and a type of bank, cash or credit_card required')
  const coll = await getCollection('accounts', auth)
  const live = await coll.find({ archived: { $ne: true } }).toArray()
  // `name` is encrypted, so uniqueness is checked here rather than by an index.
  if (live.some((a) => sameName(a.name, input.name!))) return error('An account with this name already exists.', 409)
  const limit = accountLimitError(live, input.type)
  if (limit) return error(limit, 409)
  const { timestamp } = await nowForUser(auth.userId)
  const inserted = await coll.insertOne({ name: input.name, type: input.type, archived: false, created_at: timestamp })
  invalidate('accounts', auth.userId)
  return json({ ok: true, id: String(inserted.insertedId) })
}

/** `PUT /api/accounts` `{ id, name?, type?, archived? }`. Archiving hides an account from pickers; its rows keep the label. */
export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  const id = typeof body.id === 'string' ? body.id : ''
  if (!ObjectId.isValid(id)) return error('id required')
  const input = parseAccountInput(body, true)
  if (!input) return error('invalid name or type')
  if (body.archived !== undefined && typeof body.archived !== 'boolean') return error('archived must be true or false')

  const coll = await getCollection('accounts', auth)
  const existing = await coll.findOne({ _id: new ObjectId(id) })
  if (!existing) return error('account not found', 404)
  const others = (await coll.find({ archived: { $ne: true } }).toArray()).filter((a) => String(a._id) !== id)
  const name = input.name ?? String(existing.name)
  const type = input.type ?? (existing.type as 'bank')
  const archived = body.archived ?? existing.archived === true
  if (!archived) {
    if (others.some((a) => sameName(a.name, name))) return error('An account with this name already exists.', 409)
    const limit = accountLimitError(others, type)
    if (limit) return error(limit, 409)
  }

  await coll.updateOne({ _id: existing._id }, { $set: { name, type, archived } })
  invalidate('accounts', auth.userId)
  return json({ ok: true })
}
