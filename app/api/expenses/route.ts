import { expenseInputError } from '@/lib/inputValidation'
import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection, parsePageParams, pageMeta } from '@/lib/http'
import { getAuth, readOnlyGuard, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { EXPENSE_HEADERS, toRow } from '@/lib/models'
import { invalidate } from '@/lib/cache'
import { getCachedCategoryMap, invalidateCategoryMap, learnCategoryCorrection, type CategoryMap } from '@/lib/categoryMap'
import { notifyThresholdCrossed } from '@/lib/notifications/instant'
import { withTx } from '@/lib/mongodb'
import { createExpense, adjustCreditCardEnvelope } from '@/lib/createExpense'
import { resolveCategoryName } from '@/lib/categoryName'
import { flagIfDuplicate } from '@/lib/duplicates'
import { markManualTransactionComplete } from '@/lib/users'
import { AccountError, liveAccount, paymentMethodFor } from '@/lib/accounts'
import { deleteExpensePhotoQuietly } from '@/lib/expensePhoto'

export const dynamic = 'force-dynamic'

const SORT = { date: -1, timestamp: -1, _id: -1 } as const

// Read before the write, so the new row's own vote can't hide a correction.
// Best effort: a failure here only skips learning, never the save.
async function mapBeforeWrite(auth: Auth): Promise<CategoryMap | null> {
  try {
    const expenses = await getCollection('expenses', auth)
    const overrides = await getCollection('category_map_overrides', auth)
    return await getCachedCategoryMap(auth.userId, expenses, overrides)
  } catch {
    return null
  }
}

async function learnFromSave(auth: Auth, map: CategoryMap | null, item: string, category: string) {
  if (!map) return
  try {
    const overrides = await getCollection('category_map_overrides', auth)
    if (await learnCategoryCorrection(map, item, category, overrides)) invalidateCategoryMap(auth.userId)
  } catch {
    // Learning is a nicety; the expense is already saved.
  }
}

// Where a client says an expense came from. `text` is a row typed into the
// money brain and confirmed on its review card (lib/ai/capture.ts);
// `balance_gap` is an estimate confirmed after a weekly balance check
// (lib/balanceCheck.ts). Server-side sources (recurring, subscription) are set
// by their own jobs, never by a client.
const CLIENT_SOURCES = new Set(['manual', 'text', 'balance_gap'])

/**
 * `GET /api/expenses` — three modes, picked by `?page=` and `?from=`.
 *
 * No `page`, no `from`: legacy full list, unchanged — Insights needs all history,
 * and older clients still call it. Kept byte-for-byte identical.
 *
 * `from` (no `page`): recent rows plus `lastSpent`, see below.
 *
 * `page` present: real pagination for the Activity screens. `category` and
 * `from`/`to` (on `date`) filter in Mongo — both are plaintext fields
 * (lib/encryptedFields.ts) and `date` is indexed ({user_id,date} in
 * scripts/ensure-indexes.mjs), so skip/limit works directly. `item`/`notes`
 * are encrypted, so a `q` search can't run as a Mongo $regex — it filters in
 * JS over the already category/date-bounded, decrypted set instead (same
 * ciphertext constraint app/api/ai/chat/sessions/route.ts works around for
 * its own encrypted `title` field).
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('expenses', auth)
  const url = new URL(req.url)

  // `from` without `page`: only rows dated on/after `from`, for the screens that
  // need just recent months (envelopes, widgets, log-expense hints). Envelopes
  // also show each category's last spend date, which can be older than `from`,
  // so `lastSpent` carries that from a $group over plaintext fields — no rows
  // fetched or decrypted for it.
  const recentFrom = url.searchParams.get('from')
  if (recentFrom && !url.searchParams.has('page')) {
    const [docs, last] = await Promise.all([
      coll.find({ date: { $gte: recentFrom } }).toArray(),
      coll.aggregate<{ _id: string; last: string }>([{ $group: { _id: '$category', last: { $max: '$date' } } }]).toArray(),
    ])
    return json({
      headers: EXPENSE_HEADERS,
      rows: docs.map((d) => expenseRow(d)),
      lastSpent: Object.fromEntries(last.map((d) => [d._id, d.last])),
    })
  }

  if (!url.searchParams.has('page')) {
    const docs = await coll.find({}).toArray()
    // `id` and `version` ride alongside the CSV-shaped row rather than joining
    // EXPENSE_HEADERS itself, since that array is also the CSV export's column
    // set — this keeps the export unchanged while giving JSON callers a real
    // row identity and revision for conditional edits/deletes.
    return json({
      headers: EXPENSE_HEADERS,
      rows: docs.map((d) => (expenseRow(d))),
    })
  }

  const { page, limit } = parsePageParams(url, { defaultLimit: 50, maxLimit: 200 })
  const category = url.searchParams.get('category') || undefined
  const account = url.searchParams.get('account') || undefined
  const from = url.searchParams.get('from') || undefined
  const to = url.searchParams.get('to') || undefined
  const q = url.searchParams.get('q')?.trim().toLowerCase() || undefined

  const mongoFilter: Record<string, unknown> = {}
  if (category) mongoFilter.category = category
  if (account) mongoFilter.account_id = account
  if (from || to) mongoFilter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }

  let pageDocs: Record<string, unknown>[]
  let total: number
  // `amount_inr` is encrypted too, so the period-total footer both clients
  // show (sum over the whole filtered set, not just this page) needs
  // decrypted rows — bounded by the same category/date filter either way.
  let totalAmount: number

  if (q) {
    const cursor = coll.find(mongoFilter).sort(SORT).batchSize(250)
    const start = (page - 1) * limit
    pageDocs = []
    total = 0
    totalAmount = 0
    try {
      for await (const doc of cursor) {
        if (!String(doc.item ?? '').toLowerCase().includes(q) && !String(doc.notes ?? '').toLowerCase().includes(q)) continue
        if (total >= start && pageDocs.length < limit) pageDocs.push(doc)
        total++
        totalAmount += Number(doc.amount_inr) || 0
      }
    } finally {
      await cursor.close()
    }
  } else {
    // Encrypted amounts cannot be summed by Mongo. Stream only that field so
    // the total does not retain the user's entire history in request memory.
    const sum = async () => {
      const cursor = coll.find(mongoFilter, { projection: { amount_inr: 1 } }).batchSize(250)
      let count = 0
      let amount = 0
      try {
        for await (const doc of cursor) {
          count++
          amount += Number(doc.amount_inr) || 0
        }
      } finally {
        await cursor.close()
      }
      return { count, amount }
    }
    const [rows, totals] = await Promise.all([
      coll.find(mongoFilter).sort(SORT).skip((page - 1) * limit).limit(limit).toArray(),
      sum(),
    ])
    pageDocs = rows
    total = totals.count
    totalAmount = totals.amount
  }

  return json({
    headers: EXPENSE_HEADERS,
    rows: pageDocs.map((d) => (expenseRow(d))),
    total,
    totalAmount,
    ...pageMeta(total, page, limit),
  })
}

// Existing records without a version start at 0; no backfill is required.
// `has_photo` rides alongside like `id`/`version`, outside the CSV columns.
function expenseRow(doc: Record<string, unknown>) {
  // `account_id` rides outside EXPENSE_HEADERS like `id`: that array is also the CSV export's columns.
  return { ...toRow(EXPENSE_HEADERS, doc), id: String(doc._id), version: Number(doc.version ?? 0), account_id: String(doc.account_id ?? ''), has_photo: typeof doc.photo_file === 'string' }
}

class ExpenseWriteError extends Error {
  constructor(readonly status: number, message: string, readonly current?: Record<string, unknown>) {
    super(message)
  }
}

function writePrecondition(body: Record<string, unknown>) {
  if (body.version === undefined) return error('Refresh or update the app before editing or deleting transactions.', 428)
  if (typeof body.version !== 'number' || !Number.isSafeInteger(body.version) || body.version < 0) {
    return error('a non-negative integer version is required')
  }
  if (typeof body.id !== 'string' || !ObjectId.isValid(body.id)) return error('a valid expense id is required', 400)
  return null
}

function checkExpense(found: Record<string, unknown> | null, version: unknown): asserts found is Record<string, unknown> {
  if (!found) throw new ExpenseWriteError(404, 'This transaction was deleted on another device. Your changes have not been saved.')
  if (Number(found.version ?? 0) !== version) {
    throw new ExpenseWriteError(409, 'This transaction changed on another device. Review the latest version before saving or deleting.', expenseRow(found))
  }
}

function writeError(err: unknown) {
  if (!(err instanceof ExpenseWriteError)) throw err
  return json({ error: err.message, ...(err.current ? { current: err.current } : {}) }, { status: err.status })
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  const invalid = expenseInputError(body)
  if (invalid) return error(invalid)
  if (!body.item || !body.amount_inr || !body.category) {
    return error('item, amount_inr, category required')
  }
  if (body.source !== undefined && !CLIENT_SOURCES.has(String(body.source))) return error('invalid source')

  const mapBefore = await mapBeforeWrite(auth)
  // The insert itself lives in `lib/createExpense.ts` so the recurring-expense
  // cron can reuse it verbatim instead of forking a simplified copy.
  const result = await createExpense(auth, {
    item: String(body.item),
    amount_inr: String(body.amount_inr),
    category: String(body.category),
    notes: body.notes === undefined ? undefined : String(body.notes),
    date: body.date === undefined ? undefined : String(body.date),
    timestamp: body.timestamp === undefined ? undefined : String(body.timestamp),
    payment_method: body.payment_method === undefined ? undefined : String(body.payment_method),
    account_id: typeof body.account_id === 'string' && body.account_id ? body.account_id : undefined,
    client_id: typeof body.client_id === 'string' ? body.client_id : undefined,
    source: body.source === undefined ? undefined : String(body.source),
  })

  // The Get Started card is account state, not device state. Only the manual
  // entry screen sends this source marker; scans and recurring charges do not
  // accidentally complete the step. Idempotent replays keep the first instant.
  if (body.source === 'manual') await markManualTransactionComplete(auth.userId)
  if (!result.duplicate) await learnFromSave(auth, mapBefore, String(body.item), result.category)

  // Replays were checked on their first attempt. Mobile's offline queue lands
  // here too, which is where accidental double entries mostly come from.
  const duplicateOf = result.duplicate ? null : await flagIfDuplicate(auth, {
    id: result.id,
    item: String(body.item),
    amount_inr: String(body.amount_inr),
    timestamp: result.timestamp,
    date: result.timestamp.slice(0, 10),
    payment_method: result.paymentMethod,
  })

  // The id and the server-generated timestamp go back to the caller so it can
  // address the row it just created — mobile's post-log success screen needs
  // both to offer Undo without re-fetching the whole list to find the row.
  // `category` is echoed back because it may not be the one that was asked for:
  // a client posting from a list loaded before a rename gets mapped forward, and
  // its success screen looks up the envelope by name.
  return json(
    result.duplicate
      ? { ok: true, id: result.id, version: result.version, timestamp: result.timestamp, category: result.category, duplicate: true }
      : { ok: true, id: result.id, version: result.version, timestamp: result.timestamp, category: result.category, ...(duplicateOf ? { duplicate_of: duplicateOf } : {}) },
  )
}

export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  const precondition = writePrecondition(body)
  if (precondition) return precondition
  const coll = await getCollection('expenses', auth)

  const rawUpdate: Record<string, unknown> = {}
  if (body.category !== undefined) rawUpdate.category = body.category
  if (body.new_item !== undefined) rawUpdate.item = body.new_item
  if (body.new_amount_inr !== undefined) rawUpdate.amount_inr = body.new_amount_inr
  if (body.new_date !== undefined) rawUpdate.date = body.new_date
  if (body.new_notes !== undefined) rawUpdate.notes = body.new_notes
  if (body.new_payment_method !== undefined) rawUpdate.payment_method = body.new_payment_method
  // A new account brings its payment method with it; '' just clears the label.
  let accountUpdate: string | undefined
  if (body.new_account_id !== undefined) {
    if (typeof body.new_account_id !== 'string') return error('invalid account')
    if (body.new_account_id) {
      try {
        const account = await liveAccount(auth, body.new_account_id)
        accountUpdate = account.id
        rawUpdate.payment_method = paymentMethodFor(account.type)
      } catch (err) {
        if (err instanceof AccountError) return error('That account is gone. Pick another one.')
        throw err
      }
    } else {
      accountUpdate = ''
    }
  }
  if (Object.keys(rawUpdate).length === 0 && accountUpdate === undefined) return error('no fields to update')
  const invalid = expenseInputError(rawUpdate, true)
  if (invalid) return error(invalid)

  const update: Record<string, string> = Object.fromEntries(Object.entries(rawUpdate).map(([key, value]) => [key, String(value)]))

  const mapBefore = update.category !== undefined ? await mapBeforeWrite(auth) : null
  let outcome: { category: string; affectsCC: boolean; version: number; item: string; recategorized: boolean }
  try {
    outcome = await withTx(async (session) => {
      // Every retry must read again inside its snapshot. Never capture old
      // amounts, dates, or payment methods outside this callback.
      const found = await coll.findOne({ _id: new ObjectId(String(body.id)) }, { session })
      checkExpense(found, body.version)
      const version = Number(found.version ?? 0)
      // Recategorizing from a list loaded before a rename must not park the
      // row under a name no category has any more (lib/categoryName.ts).
      // Idempotent on retry: a live name resolves to itself.
      if (update.category !== undefined) update.category = await resolveCategoryName(auth, update.category, session)
      const next: Record<string, unknown> = { ...update, ...(accountUpdate !== undefined ? { account_id: accountUpdate } : {}), version: version + 1 }
      if (body.new_date !== undefined && found.timestamp !== undefined) {
        const ts = String(found.timestamp)
        next.timestamp = `${String(body.new_date)}${ts.includes('T') ? ts.slice(ts.indexOf('T')) : ''}`
      }
      const oldCategory = String(found.category ?? '')
      const oldIsCC = found.payment_method === 'credit_card'
      const newIsCC = (update.payment_method ?? found.payment_method) === 'credit_card'
      const oldMonth = String(found.date ?? '').slice(0, 7)
      const newMonth = String(update.date ?? found.date ?? '').slice(0, 7)
      const oldAmount = Number(found.amount_inr) || 0
      const newAmount = Number(update.amount_inr ?? found.amount_inr) || 0
      const result = await coll.updateOne(
        { _id: found._id, version: found.version ?? { $exists: false } },
        { $set: next }, { session },
      )
      // Throw *inside* the transaction so no side effect can commit on a miss.
      if (result.matchedCount !== 1) throw new ExpenseWriteError(409, 'This transaction changed. Refresh and review it before saving.')
      if (oldIsCC && newIsCC && oldMonth === newMonth) {
        await adjustCreditCardEnvelope(auth, oldMonth, newAmount - oldAmount, session)
      } else {
        if (oldIsCC) await adjustCreditCardEnvelope(auth, oldMonth, -oldAmount, session)
        if (newIsCC) await adjustCreditCardEnvelope(auth, newMonth, newAmount, session)
      }
      return {
        category: update.category ?? String(found.category ?? ''),
        affectsCC: oldIsCC || newIsCC,
        version: version + 1,
        item: update.item ?? String(found.item ?? ''),
        recategorized: update.category !== undefined && update.category !== oldCategory,
      }
    })
  } catch (err) {
    return writeError(err)
  }

  invalidate('expenses', auth.userId)
  invalidate('wrapped', auth.userId)
  if (outcome.affectsCC) invalidate('budgets', auth.userId)
  invalidateCategoryMap(auth.userId)
  if (outcome.recategorized) await learnFromSave(auth, mapBefore, outcome.item, outcome.category)
  // The category that could newly be over its threshold: wherever the edit
  // landed the expense, not where it used to be.
  await notifyThresholdCrossed(auth, outcome.category)
  return json({ ok: true, version: outcome.version })
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  const precondition = writePrecondition(body)
  if (precondition) return precondition
  const coll = await getCollection('expenses', auth)
  let outcome: { category: string; affectsCC: boolean; photoFile: string | null }
  try {
    outcome = await withTx(async (session) => {
      const found = await coll.findOne({ _id: new ObjectId(String(body.id)) }, { session })
      checkExpense(found, body.version)
      // The photo blob is deleted below, so a row restored from Archive must
      // not still claim one. Unsetting leaves `version` alone for the delete's own check.
      const photoFile = typeof found.photo_file === 'string' ? found.photo_file : null
      if (photoFile) await coll.updateOne({ _id: found._id }, { $unset: { photo_file: '' } }, { session })
      const result = await coll.deleteOne(
        { _id: found._id, version: found.version ?? { $exists: false } }, { session },
      )
      if (result.deletedCount !== 1) throw new ExpenseWriteError(409, 'This transaction changed. Refresh and review it before deleting.')
      const affectsCC = found.payment_method === 'credit_card'
      const amount = Number(found.amount_inr)
      if (affectsCC && amount > 0) {
        await adjustCreditCardEnvelope(auth, String(found.date ?? '').slice(0, 7), -amount, session)
      }
      return { category: String(found.category ?? ''), affectsCC, photoFile }
    })
  } catch (err) {
    return writeError(err)
  }

  if (outcome.photoFile) await deleteExpensePhotoQuietly(auth.userId, String(body.id), outcome.photoFile)

  invalidate('expenses', auth.userId)
  invalidate('wrapped', auth.userId)
  if (outcome.affectsCC) invalidate('budgets', auth.userId)
  invalidateCategoryMap(auth.userId)

  // Deleting can drop a category back below a threshold it had crossed —
  // sync that the same way an edit-down does, so a later re-cross fires again.
  await notifyThresholdCrossed(auth, outcome.category)

  return json({ ok: true })
}
