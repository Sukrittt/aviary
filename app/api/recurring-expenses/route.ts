import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { nowForUser } from '@/lib/userCurrency'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { RECURRING_EXPENSE_HEADERS, toRow } from '@/lib/models'
import { invalidate } from '@/lib/cache'
import { normalizeItem } from '@/lib/recurringDetection'
import { FREQUENCIES, firstRunOnOrAfter, type Frequency } from '@/lib/recurringExpense'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['active', 'paused', 'ended'])
const PAYMENT_METHODS = new Set(['bank', 'credit_card'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isFrequency(value: string): value is Frequency {
  return (FREQUENCIES as string[]).includes(value)
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('recurring_expenses', auth)
  const docs = await coll.find({}).toArray()
  // `id` rides alongside the CSV-shaped headers/rows rather than joining
  // RECURRING_EXPENSE_HEADERS, same as app/api/expenses — clients edit and
  // delete by it, since `item` is encrypted and can't be a lookup key.
  return json({
    headers: RECURRING_EXPENSE_HEADERS,
    rows: docs.map((d) => ({ id: String(d._id), ...toRow(RECURRING_EXPENSE_HEADERS, d) })),
  })
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.item || !body.amount_inr || !body.category || !body.frequency || !body.start_date) {
    return error('item, amount_inr, category, frequency, start_date required')
  }

  const frequency = String(body.frequency)
  if (!isFrequency(frequency)) return error(`frequency must be one of ${FREQUENCIES.join(', ')}`)

  const startDate = String(body.start_date)
  if (!DATE_RE.test(startDate)) return error('start_date must be YYYY-MM-DD')

  const endDate = String(body.end_date ?? '')
  if (endDate && !DATE_RE.test(endDate)) return error('end_date must be YYYY-MM-DD')
  if (endDate && endDate < startDate) return error('end_date must not precede start_date')

  const paymentMethod = String(body.payment_method ?? 'bank')
  if (!PAYMENT_METHODS.has(paymentMethod)) return error('payment_method must be bank or credit_card')

  const { date: today, timestamp } = await nowForUser(auth.userId)

  const coll = await getCollection('recurring_expenses', auth)
  const suggestionId = typeof body.suggestion_id === 'string' ? body.suggestion_id : undefined
  if (suggestionId) {
    if (!ObjectId.isValid(suggestionId)) return error('Invalid suggestion')
    // Stable id makes repeated confirmation/retried requests idempotent.
    const accepted = await coll.findOne({ _id: new ObjectId(suggestionId) })
    if (accepted) return json({ ok: true, id: suggestionId })
    const suggestions = await getCollection('recurring_detection', auth)
    const suggestion = await suggestions.findOne({ _id: new ObjectId(suggestionId) })
    if (!suggestion?.decision || suggestion.dismissed) return error('Suggestion is no longer available. Scan again.', 409)
    // A subscription may be set up as a recurring expense too: it's how one is logged
    // when the Subscriptions extra is switched off (the import's "find your repeat payments").
    if (startDate <= today) return error('Choose a future start date so past payments are not logged twice.')
    const subs = await getCollection('subscriptions', auth)
    const [schedules, services] = await Promise.all([coll.find({}).toArray(), subs.find({}).toArray()])
    const name = normalizeItem(String(body.item))
    if (schedules.some(r => normalizeItem(String(r.item ?? '')) === name) || services.some(r => normalizeItem(String(r.service ?? '')) === name)) {
      return error('This payment is already tracked. Edit the existing schedule instead.', 409)
    }
    if (!Number.isFinite(Number(body.amount_inr)) || Number(body.amount_inr) <= 0) return error('Amount must be positive and finite')
  }
  let inserted
  try {
    inserted = await coll.insertOne({
      ...(suggestionId ? { _id: new ObjectId(suggestionId), suggestion_id: suggestionId } : {}),
      item: String(body.item),
      amount_inr: String(body.amount_inr),
      category: String(body.category),
      notes: String(body.notes ?? ''),
      payment_method: paymentMethod,
      frequency,
      start_date: startDate,
      end_date: endDate,
      // Computed here, never taken from the client: a backdated start schedules
      // forward instead of instantly backfilling history nobody asked for. The
      // cron's backfill is for runs it *missed*, not for dates that predate the
      // recurrence being created.
      next_run_date: firstRunOnOrAfter(startDate, frequency, today),
      status: 'active',
      created_at: timestamp,
    })
  } catch (err) {
    if (suggestionId && (err as { code?: number }).code === 11000) {
      const live = await coll.findOne({ _id: new ObjectId(suggestionId) })
      if (live) return json({ ok: true, id: suggestionId })
      return error('This suggestion was already used for an archived schedule. Restore it or add a new recurring expense manually.', 409)
    }
    throw err
  }

  invalidate('recurring_expenses', auth.userId)
  return json({ ok: true, id: String(inserted.insertedId) })
}

export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id || !ObjectId.isValid(id)) return error('id required')

  const coll = await getCollection('recurring_expenses', auth)
  const existing = await coll.findOne({ _id: new ObjectId(id) })
  if (!existing) return error('recurring expense not found', 404)

  const update: Record<string, string> = {}
  if (body.item !== undefined) update.item = String(body.item)
  if (body.amount_inr !== undefined) update.amount_inr = String(body.amount_inr)
  if (body.category !== undefined) update.category = String(body.category)
  if (body.notes !== undefined) update.notes = String(body.notes)

  if (body.payment_method !== undefined) {
    const paymentMethod = String(body.payment_method)
    if (!PAYMENT_METHODS.has(paymentMethod)) return error('payment_method must be bank or credit_card')
    update.payment_method = paymentMethod
  }

  if (body.status !== undefined) {
    const status = String(body.status)
    if (!STATUSES.has(status)) return error('status must be active, paused or ended')
    update.status = status
  }

  if (body.frequency !== undefined) {
    const frequency = String(body.frequency)
    if (!isFrequency(frequency)) return error(`frequency must be one of ${FREQUENCIES.join(', ')}`)
    update.frequency = frequency
  }

  if (body.start_date !== undefined) {
    const startDate = String(body.start_date)
    if (!DATE_RE.test(startDate)) return error('start_date must be YYYY-MM-DD')
    update.start_date = startDate
  }

  if (body.end_date !== undefined) {
    const endDate = String(body.end_date)
    if (endDate && !DATE_RE.test(endDate)) return error('end_date must be YYYY-MM-DD')
    update.end_date = endDate
  }

  const startDate = update.start_date ?? String(existing.start_date)
  const endDate = update.end_date ?? String(existing.end_date ?? '')
  if (endDate && endDate < startDate) return error('end_date must not precede start_date')

  // Resuming means "start again from now", not "make up the time off". The
  // cron only reads active rows, so `next_run_date` sits frozen for the whole
  // pause; leaving it there would hand the next run every date in that stretch
  // and its backfill would dutifully log them all. A run the cron *missed* is
  // still backfilled, which is why this is keyed to the paused→active
  // transition rather than to any write of status: 'active'.
  const resuming = update.status === 'active' && String(existing.status) !== 'active'

  // Rescheduling likewise changes where the next occurrence lands, so recompute
  // rather than leaving a `next_run_date` that belongs to the old schedule.
  if (resuming || update.frequency !== undefined || update.start_date !== undefined) {
    const frequency = update.frequency ?? String(existing.frequency)
    update.next_run_date = firstRunOnOrAfter(startDate, frequency, (await nowForUser(auth.userId)).date)
  }

  await coll.updateOne({ _id: existing._id }, { $set: update })
  invalidate('recurring_expenses', auth.userId)
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id || !ObjectId.isValid(id)) return error('id required')

  const coll = await getCollection('recurring_expenses', auth)
  const result = await coll.deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0) return error('recurring expense not found', 404)

  invalidate('recurring_expenses', auth.userId)
  return json({ ok: true })
}
