import { validMoney, validMonth, validText } from '@/lib/inputValidation'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { BUDGET_HEADERS, toRow } from '@/lib/models'
import { invalidate } from '@/lib/cache'
import { resolveCategoryName } from '@/lib/categoryName'
import { reconcileThresholdLevels } from '@/lib/notifications/instant'
import { withTx } from '@/lib/mongodb'
import { carriedAssigned } from '@/lib/budgetCarry'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('budgets', auth)
  const docs = await coll.find({}).toArray()
  return json({ headers: BUDGET_HEADERS, rows: docs.map(budgetRow) })
}

// Existing records without a stored version start at 0; no backfill is
// required. Keep version outside BUDGET_HEADERS because that array is also the
// CSV export column set.
function budgetRow(doc: Record<string, unknown>) {
  return { ...toRow(BUDGET_HEADERS, doc), version: Number(doc.version ?? 0) }
}

class BudgetWriteError extends Error {
  constructor(readonly status: number, message: string, readonly current?: Record<string, unknown>) {
    super(message)
  }
}

function writePrecondition(body: Record<string, unknown>) {
  if (body.version === undefined) {
    return error('Refresh or update the app before editing budget assignments.', 428)
  }
  if (typeof body.version !== 'number' || !Number.isSafeInteger(body.version) || body.version < 0) {
    return error('a non-negative integer version is required')
  }
  return null
}

function checkBudget(found: Record<string, unknown> | null, version: unknown): void {
  if (!found) {
    if (version === 0) return
    throw new BudgetWriteError(409, 'This budget assignment changed on another device. Review the latest version before saving.')
  }
  if (Number(found.version ?? 0) !== version) {
    throw new BudgetWriteError(
      409,
      'This budget assignment changed on another device. Review the latest version before saving.',
      budgetRow(found),
    )
  }
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  const invalid = budgetInputError(body)
  if (invalid) return error(invalid)
  if (!body.month || !body.category || body.assigned === undefined) {
    return error('month, category, assigned required')
  }

  const coll = await getCollection('budgets', auth)
  try {
    await coll.insertOne({
      month: String(body.month),
      category: String(body.category),
      assigned: String(body.assigned),
      rolled_over: String(body.rolled_over ?? 0),
      version: 1,
    })
  } catch (err) {
    // The unique index on {user_id, month, category} (scripts/ensure-indexes.mjs)
    // throws E11000 on a repeat POST for the same envelope/month — that's a
    // client error (use PUT to update), not a server failure.
    if (isDuplicateKeyError(err)) return error('a budget row for this month and category already exists', 409)
    throw err
  }
  invalidate('budgets', auth.userId)
  await reconcileThresholdLevels(auth, [String(body.category)], String(body.month))
  return json({ ok: true, version: 1 })
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
}

export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  const invalid = budgetInputError(body)
  if (invalid) return error(invalid)
  if (!body.month || !body.category) return error('month, category required')
  const precondition = writePrecondition(body)
  if (precondition) return precondition

  const update: Record<string, string> = {}
  if (body.assigned !== undefined) update.assigned = String(body.assigned)
  if (body.rolled_over !== undefined) update.rolled_over = String(body.rolled_over)
  // One-off income for the month, only meaningful on the income row. Never
  // carried: a new row starts from the carried `assigned` and its own extra.
  if (body.extra !== undefined) update.extra = String(body.extra)
  if (body.newCategory !== undefined) update.category = String(body.newCategory)
  if (Object.keys(update).length === 0) return error('no fields to update')

  const coll = await getCollection('budgets', auth)
  const month = String(body.month)
  let category = String(body.category)
  let version: number
  try {
    version = await withTx(async (session) => {
      // Resolve and read inside every transaction attempt. A retry must never
      // reuse a snapshot or category alias from the failed attempt.
      category = await resolveCategoryName(auth, String(body.category), session)
      const found = await coll.findOne({ month, category }, { session })
      checkBudget(found, body.version)

      if (found) {
        const currentVersion = Number(found.version ?? 0)
        const result = await coll.updateOne(
          { _id: found._id, version: found.version ?? { $exists: false } },
          { $set: update, $inc: { version: 1 } } as never,
          { session },
        )
        if (result.matchedCount !== 1) {
          throw new BudgetWriteError(409, 'This budget assignment changed on another device. Review the latest version before saving.')
        }
        return currentVersion + 1
      }

      // No row is the conceptual version 0. The unique month/category index
      // arbitrates two simultaneous first writes; the loser becomes a 409.
      // An unedited assignment keeps showing the carried-forward amount, so
      // the new row must start from it rather than zero.
      const assigned = update.assigned ?? String(await carriedAssigned(coll, category, month, session))
      try {
        await coll.insertOne({
          month,
          category: update.category ?? category,
          assigned,
          rolled_over: update.rolled_over ?? '0',
          ...(update.extra !== undefined ? { extra: update.extra } : {}),
          version: 1,
        }, { session })
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw new BudgetWriteError(409, 'This budget assignment changed on another device. Review the latest version before saving.')
        }
        throw err
      }
      return 1
    })
  } catch (err) {
    if (!(err instanceof BudgetWriteError)) throw err
    // Conditional misses and duplicate first writes discover the winner only
    // after this transaction aborts, so read it outside the failed snapshot.
    const current = err.current ?? await coll.findOne({ month, category })
    return json(
      { error: err.message, ...(current ? { current: budgetRow(current) } : {}) },
      { status: err.status },
    )
  }
  invalidate('budgets', auth.userId)
  await reconcileThresholdLevels(
    auth,
    [category, ...(update.category ? [update.category] : [])],
    month,
  )
  return json({ ok: true, version })
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  const invalid = budgetInputError(body)
  if (invalid) return error(invalid)
  if (!body.month || !body.category) return error('month, category required')

  const coll = await getCollection('budgets', auth)
  const result = await coll.deleteOne({ month: String(body.month), category: String(body.category) })
  if (result.deletedCount === 0) return error('budget row not found', 404)
  invalidate('budgets', auth.userId)
  await reconcileThresholdLevels(auth, [String(body.category)], String(body.month))
  return json({ ok: true })
}

// Negative amounts are legitimate: transfers can overdraw `assigned`.
function budgetInputError(body: Record<string, unknown>): string | null {
  if (!validMonth(body.month) || !validText(body.category, 100)) return 'invalid month or category'
  for (const field of ['assigned', 'rolled_over', 'extra'] as const) {
    if (body[field] !== undefined && !validMoney(body[field], true)) return `invalid ${field}`
  }
  if (body.newCategory !== undefined && !validText(body.newCategory, 100)) return 'invalid category'
  return null
}
