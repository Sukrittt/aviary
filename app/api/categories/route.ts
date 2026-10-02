import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/** A handled failure raised inside a transaction, so nothing partial commits. */
class CategoryWriteError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** True for Mongo's duplicate-key error — the unique `(user_id, name)` index firing on a race. */
function isDuplicateName(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('categories', auth)
  const docs = await coll.find({}).sort({ order: 1 }).toArray()
  return json(
    docs
      .map((d) => ({
        name: d.name ?? '',
        group: d.group ?? '',
        ...(Array.isArray(d.alertPcts) ? { alertPcts: d.alertPcts } : {}),
      }))
      .filter((c) => c.name),
  )
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (!body.name) return error('name required')

  const coll = await getCollection('categories', auth)
  const exists = await coll.findOne({ name: String(body.name) })
  if (exists) return error('category already exists', 409)
  const maxDoc = await coll.find({}).sort({ order: -1 }).limit(1).next()
  const order = (maxDoc && typeof maxDoc.order === 'number' ? maxDoc.order : 0) + 1
  // The pre-check above loses to a concurrent create of the same name; the
  // unique index is what actually decides, so report its verdict the same way.
  try {
    await coll.insertOne({ name: String(body.name), group: String(body.group ?? ''), order })
  } catch (err) {
    if (isDuplicateName(err)) return error('category already exists', 409)
    throw err
  }
  invalidate('categories', auth.userId)
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

  // Validate before opening the transaction: a bad threshold list must not be
  // able to roll back a rename that was otherwise fine.
  let alertPcts: number[] | undefined
  if (Array.isArray(body.alertPcts)) {
    const pcts = body.alertPcts
    const valid =
      pcts.length <= 5 &&
      pcts.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100) &&
      new Set(pcts).size === pcts.length
    if (!valid) return error('alertPcts must be at most 5 unique integers between 0 and 100')
    alertPcts = [...pcts].sort((a, b) => a - b)
  }

  const coll = await getCollection('categories', auth)
  const budgetColl = await getCollection('budgets', auth)
  const expenseColl = await getCollection('expenses', auth)
  const recurringColl = await getCollection('recurring_expenses', auth)
  const scanColl = await getCollection('bill_scans', auth)
  const overrideColl = await getCollection('category_map_overrides', auth)

  let renamed: boolean
  try {
    // One transaction for the category row and both cascades: a rename that
    // stops halfway leaves budgets and expenses pointing at a name that no
    // longer exists. Every retry rereads inside its own snapshot.
    renamed = await withTx(async (session) => {
      const existing = await coll.findOne({ name: String(body.name) }, { session })
      if (!existing) throw new CategoryWriteError(404, 'category not found')

      let effectiveName = String(body.name)
      let didRename = false
      if (body.newName && body.newName !== body.name) {
        effectiveName = String(body.newName)
        const dupe = await coll.findOne({ name: effectiveName }, { session })
        if (dupe) throw new CategoryWriteError(409, 'category already exists')
        // `previousNames` keeps the old name resolvable so a client that never
        // saw this rename — a stale category list, an offline expense flushed
        // afterwards — still writes into this category. See lib/categoryName.ts.
        await coll.updateOne(
          { name: String(body.name) },
          { $set: { name: effectiveName }, $push: { previousNames: String(body.name) } as never },
          { session },
        )

        // Cascade the rename to every collection that stores a category name,
        // or the rows left behind point at a category nobody can see: budgets
        // stop matching their envelope, and the nightly recurring cron keeps
        // logging expenses under the dead name.
        await budgetColl.updateMany({ category: String(body.name) }, { $set: { category: effectiveName } }, { session })

        // Invalidate open expense editors too; category changes are record changes.
        await expenseColl.updateMany({ category: String(body.name) }, { $set: { category: effectiveName }, $inc: { version: 1 } as never }, { session })

        for (const collection of [recurringColl, scanColl, overrideColl]) {
          await collection.updateMany({ category: String(body.name) }, { $set: { category: effectiveName } }, { session })
        }
        didRename = true
      }

      if (body.group !== undefined) {
        await coll.updateOne({ name: effectiveName }, { $set: { group: String(body.group) } }, { session })
      }

      if (body.alertPcts === null) {
        await coll.updateOne({ name: effectiveName }, { $unset: { alertPcts: '' } }, { session })
      } else if (alertPcts) {
        await coll.updateOne({ name: effectiveName }, { $set: { alertPcts } }, { session })
      }

      return didRename
    })
  } catch (err) {
    if (err instanceof CategoryWriteError) return error(err.message, err.status)
    // Two renames can both clear the dupe pre-check; the unique index decides.
    if (isDuplicateName(err)) return error('category already exists', 409)
    throw err
  }

  // Cache invalidation goes after the transaction resolves — withTx can rerun
  // its callback, so nothing with an outside effect belongs inside it.
  if (renamed) {
    invalidate('budgets', auth.userId)
    invalidate('expenses', auth.userId)
  }
  invalidate('categories', auth.userId)
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

  const coll = await getCollection('categories', auth)
  const result = await coll.deleteOne({ name: String(body.name) })
  if (result.deletedCount === 0) return error('category not found', 404)
  invalidate('categories', auth.userId)
  return json({ ok: true })
}
