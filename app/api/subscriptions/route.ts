import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection, escapeRegExp, nowIST } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { SUBSCRIPTION_HEADERS, toRow } from '@/lib/models'
import { invalidate } from '@/lib/cache'
import { normalizeItem } from '@/lib/recurringDetection'
import { nowForUser } from '@/lib/userCurrency'

export const dynamic = 'force-dynamic'
const SUGGESTED_CYCLES = new Set(['weekly', 'monthly', 'quarterly', 'yearly'])

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('subscriptions', auth)
  const docs = await coll.find({}).toArray()
  return json({ headers: SUBSCRIPTION_HEADERS, rows: docs.map((d) => toRow(SUBSCRIPTION_HEADERS, d)) })
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.service || !body.amount_inr) return error('service, amount_inr required')

  const coll = await getCollection('subscriptions', auth)
  const suggestionId = typeof body.suggestion_id === 'string' ? body.suggestion_id : undefined
  if (suggestionId) {
    if (!ObjectId.isValid(suggestionId)) return error('Invalid suggestion')
    const accepted = await coll.findOne({ _id: new ObjectId(suggestionId) })
    if (accepted) return json({ ok: true, id: suggestionId })

    const suggestions = await getCollection('recurring_detection', auth)
    const suggestion = await suggestions.findOne({ _id: new ObjectId(suggestionId) })
    if (!suggestion?.decision || suggestion.dismissed) return error('Suggestion is no longer available. Scan again.', 409)
    if ((suggestion.decision as { pattern?: string }).pattern !== 'subscription') return error('This suggestion belongs in recurring expenses.', 409)

    const amount = Number(body.amount_inr)
    if (!Number.isFinite(amount) || amount <= 0) return error('Amount must be positive and finite')
    const cycle = String(body.billing_cycle ?? 'monthly')
    if (!SUGGESTED_CYCLES.has(cycle)) return error('Choose a supported billing cycle')
    const dueDate = String(body.next_due_date ?? '')
    const { date: today } = await nowForUser(auth.userId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate <= today) {
      return error('Choose a future due date so past payments are not logged twice.')
    }

    const recurring = await getCollection('recurring_expenses', auth)
    const schedules = await recurring.find({}, { projection: { item: 1 } }).toArray()
    const name = normalizeItem(String(body.service))
    if (schedules.some(row => normalizeItem(String(row.item ?? '')) === name)) {
      return error('This payment is already tracked. Edit the existing schedule instead.', 409)
    }
  }

  const exists = await coll.findOne({
    service: { $regex: new RegExp(`^${escapeRegExp(String(body.service))}$`, 'i') },
  })
  if (exists) {
    if (suggestionId && /^cancel/i.test(String(exists.status ?? ''))) {
      await coll.updateOne({ _id: exists._id }, { $set: {
        suggestion_id: suggestionId,
        amount_inr: String(body.amount_inr),
        billing_cycle: String(body.billing_cycle || 'monthly'),
        next_due_date: String(body.next_due_date ?? ''),
        status: 'active',
        renewal_or_end_month: '',
        notes: String(body.notes ?? ''),
        category: String(body.category ?? ''),
      } })
      invalidate('subscriptions', auth.spaceId)
      return json({ ok: true, id: suggestionId, reactivated: true })
    }
    return error('subscription already exists', 409)
  }

  try {
    await coll.insertOne({
      ...(suggestionId ? { _id: new ObjectId(suggestionId), suggestion_id: suggestionId } : {}),
      timestamp: String(body.timestamp || nowIST().timestamp),
      service: String(body.service),
      amount_inr: String(body.amount_inr),
      billing_cycle: String(body.billing_cycle || 'monthly'),
      next_due_date: String(body.next_due_date ?? ''),
      status: 'active',
      renewal_or_end_month: String(body.renewal_or_end_month ?? ''),
      notes: String(body.notes ?? ''),
      category: String(body.category ?? ''),
    })
  } catch (err) {
    if (suggestionId && (err as { code?: number }).code === 11000) {
      const live = await coll.findOne({ _id: new ObjectId(suggestionId) })
      if (live) return json({ ok: true, id: suggestionId })
      return error('This suggestion was already used for an archived subscription. Restore it or add a new subscription manually.', 409)
    }
    throw err
  }
  invalidate('subscriptions', auth.spaceId)
  return json({ ok: true, ...(suggestionId ? { id: suggestionId } : {}) })
}

export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.service) return error('service required')

  // Case-insensitive match, consistent with the POST duplicate check and DELETE below.
  const coll = await getCollection('subscriptions', auth)
  const existing = await coll.findOne({
    service: { $regex: new RegExp(`^${escapeRegExp(String(body.service))}$`, 'i') },
  })
  if (!existing) return error('subscription not found', 404)

  const update: Record<string, string> = {}
  if (body.new_service !== undefined) update.service = String(body.new_service)
  if (body.amount_inr !== undefined) update.amount_inr = String(body.amount_inr)
  if (body.billing_cycle !== undefined) update.billing_cycle = String(body.billing_cycle)
  if (body.next_due_date !== undefined) update.next_due_date = String(body.next_due_date)
  if (body.notes !== undefined) update.notes = String(body.notes)
  if (body.status !== undefined) update.status = String(body.status)
  if (body.renewalOrEndMonth !== undefined) update.renewal_or_end_month = String(body.renewalOrEndMonth)
  if (body.category !== undefined) update.category = String(body.category)

  if (body.status === 'cancelled' && body.renewalOrEndMonth === undefined) {
    const expiry = new Date()
    expiry.setMonth(expiry.getMonth() + 1)
    update.renewal_or_end_month = expiry.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  if (body.status === 'active' && body.renewalOrEndMonth === undefined) {
    update.renewal_or_end_month = ''
  }

  await coll.updateOne({ _id: existing._id }, { $set: update })
  invalidate('subscriptions', auth.spaceId)
  return json({ ok: true })
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.service) return error('service required')

  // Case-insensitive match, consistent with the POST duplicate check.
  const coll = await getCollection('subscriptions', auth)
  const result = await coll.deleteOne({
    service: { $regex: new RegExp(`^${escapeRegExp(String(body.service))}$`, 'i') },
  })
  if (result.deletedCount === 0) return error('subscription not found', 404)
  invalidate('subscriptions', auth.spaceId)
  return json({ ok: true })
}
