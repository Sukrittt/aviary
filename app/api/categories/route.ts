import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'
import { isCategoryIconKey } from '@/src/lib/categoryIcons'
import { isCategoryColor } from '@/src/lib/categoryColors'
import { createCategory, readGoal, storeGoal } from '@/lib/categories'
import { parseGoal, validText } from '@/lib/inputValidation'
import type { CategoryGoal } from '@/src/types'

export const dynamic = 'force-dynamic'

/** A handled failure raised inside a transaction, so nothing partial commits. */
class CategoryWriteError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** `weeklySince`: the day weekly pacing was switched on (src/lib/weekly.ts). Absent means off. */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
// A real calendar day: the round trip turns 2026-02-31 into 2026-03-03.
const isDay = (v: unknown): v is string =>
  typeof v === 'string' && DAY_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

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
        ...(isCategoryIconKey(d.icon) ? { icon: d.icon } : {}),
        ...(isCategoryColor(d.color) ? { color: d.color } : {}),
        ...(Array.isArray(d.alertPcts) ? { alertPcts: d.alertPcts } : {}),
        ...(typeof d.since === 'string' ? { since: d.since } : {}),
        ...(isDay(d.weeklySince) ? { weeklySince: d.weeklySince } : {}),
        ...(readGoal(d.goal) ? { goal: readGoal(d.goal) } : {}),
        ...(typeof d.note === 'string' && d.note ? { note: d.note } : {}),
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
  if (body.icon !== undefined && !isCategoryIconKey(body.icon)) return error('unknown icon')
  if (body.color !== undefined && !isCategoryColor(body.color)) return error('unknown color')
  const goal = body.goal === undefined ? undefined : parseGoal(body.goal)
  if (goal === null) return error('invalid goal')

  const created = await createCategory(auth, {
    name: String(body.name),
    group: String(body.group ?? ''),
    ...(body.icon !== undefined ? { icon: body.icon } : {}),
    ...(body.color !== undefined ? { color: body.color } : {}),
    ...(goal ? { goal } : {}),
  })
  if (created === 'exists') return error('category already exists', 409)
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
  if (body.icon !== undefined && !isCategoryIconKey(body.icon)) return error('unknown icon')
  if (body.color !== undefined && !isCategoryColor(body.color)) return error('unknown color')
  // The client's own calendar day, so Monday's recap counts weeks in its time zone.
  if (body.weeklySince !== undefined && body.weeklySince !== null && !isDay(body.weeklySince)) return error('weeklySince must be a YYYY-MM-DD day or null')
  // Only a body that names `goal` touches it. Mobile's renames, moves and
  // alert changes send just their own fields, so they leave a goal alone.
  // `null` removes the goal; undefined leaves it.
  let goal: CategoryGoal | null | undefined
  if (body.goal === null) goal = null
  else if (body.goal !== undefined) {
    goal = parseGoal(body.goal)
    if (!goal) return error('invalid goal')
  }
  // Same rule as `goal`: only a body naming `note` touches it. Blank clears it.
  let note: string | null | undefined
  if (body.note === null) note = null
  else if (body.note !== undefined) {
    if (!validText(body.note, 2000, true)) return error('note must be at most 2000 characters')
    note = body.note.trim() || null
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

      if (body.icon !== undefined) {
        await coll.updateOne({ name: effectiveName }, { $set: { icon: body.icon } }, { session })
      }

      if (body.color !== undefined) {
        await coll.updateOne({ name: effectiveName }, { $set: { color: body.color } }, { session })
      }

      if (body.weeklySince === null) {
        await coll.updateOne({ name: effectiveName }, { $unset: { weeklySince: '' } }, { session })
      } else if (body.weeklySince !== undefined) {
        await coll.updateOne({ name: effectiveName }, { $set: { weeklySince: body.weeklySince } }, { session })
      }

      // Null, not $unset: lib/scoped.ts refuses $unset on an encrypted field.
      if (goal !== undefined) {
        await coll.updateOne({ name: effectiveName }, { $set: { goal: goal && storeGoal(goal) } }, { session })
      }
      if (note !== undefined) {
        await coll.updateOne({ name: effectiveName }, { $set: { note } }, { session })
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
    invalidate('budgets', auth.spaceId)
    invalidate('expenses', auth.spaceId)
  }
  invalidate('categories', auth.spaceId)
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
  invalidate('categories', auth.spaceId)
  return json({ ok: true })
}
