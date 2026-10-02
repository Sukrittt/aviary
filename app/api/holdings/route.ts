import { json, error, readBody, getCollection, escapeRegExp } from '@/lib/http'
import { nowForUser } from '@/lib/userCurrency'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { HOLDING_HEADERS, toRow } from '@/lib/models'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'
import { nextContributionDate } from '@/lib/holdingRecurrence'

export const dynamic = 'force-dynamic'

// Existing records without a stored version start at 0; no backfill is
// required. Keep version outside HOLDING_HEADERS because that array is also the
// CSV export column set.
function holdingRow(doc: Record<string, unknown>) {
  return { ...toRow(HOLDING_HEADERS, doc), version: Number(doc.version ?? 0) }
}

class HoldingWriteError extends Error {
  constructor(readonly status: number, message: string, readonly current?: Record<string, unknown>) {
    super(message)
  }
}

const HOLDING_CHANGED = 'This holding changed on another device. Review the latest version before saving.'

function writePrecondition(body: Record<string, unknown>) {
  if (body.version === undefined) {
    return error('Refresh or update the app before editing holdings.', 428)
  }
  if (typeof body.version !== 'number' || !Number.isSafeInteger(body.version) || body.version < 0) {
    return error('a non-negative integer version is required')
  }
  return null
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('holdings', auth)
  const docs = await coll.find({}).toArray()
  const { date: today } = await nowForUser(auth.userId)
  const rows = docs.map((doc) => ({
    ...holdingRow(doc),
    next_contribution_date: nextContributionDate({
      is_recurring: doc.is_recurring === 'true' ? 'true' : 'false',
      recurring_amount: String(doc.recurring_amount ?? ''),
      recurring_day: String(doc.recurring_day ?? ''),
      recurring_last_run: String(doc.recurring_last_run ?? ''),
    }, today),
  }))
  return json({ headers: HOLDING_HEADERS, rows })
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name || body.value === undefined) return error('name, value required')

  const coll = await getCollection('holdings', auth)
  const exists = await coll.findOne({
    name: { $regex: new RegExp(`^${escapeRegExp(String(body.name))}$`, 'i') },
  })
  if (exists) return error('holding already exists', 409)

  const isRecurring = body.is_recurring === true || body.is_recurring === 'true'
  const { date: today } = await nowForUser(auth.userId)

  await coll.insertOne({
    name: String(body.name),
    type: String(body.type ?? ''),
    value: String(body.value),
    updated_at: String(body.updated_at || new Date().toISOString()),
    is_recurring: String(isRecurring),
    recurring_amount: isRecurring ? String(Number(body.recurring_amount) || 0) : '',
    // Snapshotted once at creation, not user-editable — the next auto-contribution
    // fires next month, not immediately, so recurring_last_run starts on the
    // current month.
    recurring_day: isRecurring ? String(Number(today.slice(8, 10))) : '',
    recurring_last_run: isRecurring ? today.slice(0, 7) : '',
    version: 1,
  })
  invalidate('holdings', auth.userId)
  return json({ ok: true, version: 1 })
}

export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')
  const precondition = writePrecondition(body)
  if (precondition) return precondition

  const hasEditableField = [
    'new_name',
    'type',
    'value',
    'updated_at',
    'is_recurring',
    'recurring_amount',
  ].some((key) => body[key] !== undefined)
  if (!hasEditableField) return error('no fields to update')

  const coll = await getCollection('holdings', auth)
  const name = String(body.name)
  let version: number
  try {
    version = await withTx(async (session) => {
      // Read and derive the update inside every transaction attempt. A retry
      // must use the latest recurring cadence and revision, not a stale row
      // captured before the transaction started.
      const existing = await coll.findOne({ name }, { session })
      if (!existing) throw new HoldingWriteError(409, 'This holding was renamed or removed. Refresh your holdings before saving again.')
      if (Number(existing.version ?? 0) !== body.version) {
        throw new HoldingWriteError(409, HOLDING_CHANGED, holdingRow(existing))
      }

      const update: Record<string, string> = {}
      if (body.new_name !== undefined) update.name = String(body.new_name)
      if (body.type !== undefined) update.type = String(body.type)
      if (body.value !== undefined) update.value = String(body.value)
      if (body.value !== undefined || body.updated_at !== undefined) {
        update.updated_at = String(body.updated_at || new Date().toISOString())
      }

      // Recurrence is user-visible but independent from `value`. Clients may
      // send only recurring_amount when the switch itself did not change.
      if (body.is_recurring !== undefined) {
        const isRecurring = body.is_recurring === true || body.is_recurring === 'true'
        update.is_recurring = String(isRecurring)
        if (isRecurring) {
          if (body.recurring_amount !== undefined) {
            update.recurring_amount = String(Number(body.recurring_amount) || 0)
          } else if (existing.is_recurring !== 'true') {
            update.recurring_amount = '0'
          }
          // Only snapshot when there isn't one already — turning recurring on
          // for the first time needs its cadence set, while an amount edit must
          // preserve the original day and last-run marker.
          if (!existing.recurring_day) {
            const { date: today } = await nowForUser(auth.userId)
            update.recurring_day = String(Number(today.slice(8, 10)))
            update.recurring_last_run = today.slice(0, 7)
          }
        } else {
          update.recurring_amount = ''
          update.recurring_day = ''
          update.recurring_last_run = ''
        }
      } else if (body.recurring_amount !== undefined) {
        if (existing.is_recurring !== 'true') {
          throw new HoldingWriteError(400, 'recurring_amount requires an active recurring holding')
        }
        update.recurring_amount = String(Number(body.recurring_amount) || 0)
      }

      const currentVersion = Number(existing.version ?? 0)
      try {
        const result = await coll.updateOne(
          { _id: existing._id, version: existing.version ?? { $exists: false } },
          { $set: update, $inc: { version: 1 } } as never,
          { session },
        )
        if (result.matchedCount !== 1) throw new HoldingWriteError(409, HOLDING_CHANGED)
      } catch (err) {
        if (isDuplicateKeyError(err)) throw new HoldingWriteError(409, 'a holding with that name already exists')
        throw err
      }
      return currentVersion + 1
    })
  } catch (err) {
    if (!(err instanceof HoldingWriteError)) throw err
    // A conditional miss discovers the winner only after its transaction
    // aborts, so reread outside the failed snapshot.
    const current = err.current ?? (err.status === 409 ? await coll.findOne({ name }) : null)
    return json(
      { error: err.message, ...(current ? { current: holdingRow(current) } : {}) },
      { status: err.status },
    )
  }
  invalidate('holdings', auth.userId)
  return json({ ok: true, version })
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')

  const coll = await getCollection('holdings', auth)
  const result = await coll.deleteOne({ name: String(body.name) })
  if (result.deletedCount === 0) return error('holding not found', 404)
  invalidate('holdings', auth.userId)
  return json({ ok: true })
}
