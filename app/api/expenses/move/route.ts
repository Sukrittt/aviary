import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { withTx } from '@/lib/mongodb'
import { adjustCreditCardEnvelope } from '@/lib/createExpense'
import { invalidate } from '@/lib/cache'
import { invalidateCategoryMap } from '@/lib/categoryMap'
import { moveExpensePhoto } from '@/lib/expensePhoto'
import { notifyThresholdCrossed } from '@/lib/notifications/instant'
import { lookupMembership, resolveSpaceAccess } from '@/lib/spaces'

export const dynamic = 'force-dynamic'

class MoveError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

// Belong to the budget the expense leaves, so they don't travel with it.
const LOCAL_FIELDS = ['_id', 'user_id', 'deleted_at', 'account_id', 'version'] as const

/**
 * `POST /api/expenses/move` `{ id, version, to, category }`: "Move to another
 * budget", for an expense logged in the wrong one. It leaves this budget and
 * lands in `to` under one of that budget's own categories, keeping its id,
 * so a photo and every client reference follow it. Both budgets' card
 * envelopes move with a card spend. All in one transaction: it's never in
 * both budgets, or neither.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (typeof body.id !== 'string' || !ObjectId.isValid(body.id)) return error('a valid expense id is required')
  if (typeof body.version !== 'number' || !Number.isSafeInteger(body.version)) return error('a version is required')
  if (typeof body.to !== 'string' || !body.to) return error('a budget to move to is required')
  if (typeof body.category !== 'string' || !body.category) return error('a category is required')
  if (body.to === auth.spaceId) return error('this expense is already in that budget')

  const target = await resolveSpaceAccess(auth.userId, body.to, lookupMembership)
  if (target.denied) return json({ error: 'NOT_A_MEMBER', spaceId: body.to }, { status: 403 })
  const targetAuth: Auth = { ...auth, spaceId: target.spaceId, spaceOwnerId: target.ownerId, spaceRole: target.role }
  // The budget it lands in must be one its owner's plan keeps open, too.
  const targetGate = await requireAccess(targetAuth)
  if (targetGate) return targetGate

  const from = await getCollection('expenses', auth)
  const to = await getCollection('expenses', targetAuth)
  const categories = await getCollection('categories', targetAuth)
  const id = new ObjectId(body.id)
  let moved: { category: string; fromCategory: string; photoFile: string | null; affectsCC: boolean }
  try {
    moved = await withTx(async (session) => {
      if (!(await categories.findOne({ name: body.category }, { session }))) throw new MoveError(400, 'that budget has no such category')
      const found = await from.findOne({ _id: id }, { session })
      if (!found) throw new MoveError(404, 'This transaction was deleted on another device.')
      if (Number(found.version ?? 0) !== body.version) throw new MoveError(409, 'This transaction changed on another device. Review it before moving it.')

      // A real delete, not a soft one: the expense lives on in the other budget, not in this one's Archive.
      const gone = await from.purge({ _id: id, version: found.version ?? { $exists: false } }, { session })
      if (gone.deletedCount !== 1) throw new MoveError(409, 'This transaction changed on another device. Review it before moving it.')
      const copy = Object.fromEntries(Object.entries(found).filter(([k]) => !(LOCAL_FIELDS as readonly string[]).includes(k)))
      await to.insertOne({ ...copy, _id: id, category: body.category, version: Number(found.version ?? 0) + 1, created_by: found.created_by ?? auth.spaceOwnerId }, { session })

      const affectsCC = found.payment_method === 'credit_card'
      const amount = Number(found.amount_inr)
      if (affectsCC && amount !== 0 && Number.isFinite(amount)) {
        const month = String(found.date ?? '').slice(0, 7)
        await adjustCreditCardEnvelope(auth, month, -amount, session)
        await adjustCreditCardEnvelope(targetAuth, month, amount, session)
      }
      return {
        category: String(body.category),
        fromCategory: String(found.category ?? ''),
        photoFile: typeof found.photo_file === 'string' ? found.photo_file : null,
        affectsCC,
      }
    })
  } catch (err) {
    if (err instanceof MoveError) return error(err.message, err.status)
    throw err
  }

  if (moved.photoFile) {
    try {
      await moveExpensePhoto(auth.spaceId, targetAuth.spaceId, body.id, moved.photoFile)
    } catch (err) {
      // The expense moved; only its photo didn't. Better no photo than a broken one.
      console.error('expense move: photo move failed for', body.id, err)
      await to.updateOne({ _id: id }, { $unset: { photo_file: '' } })
    }
  }

  for (const space of [auth.spaceId, targetAuth.spaceId]) {
    invalidate('expenses', space)
    invalidate('wrapped', space)
    if (moved.affectsCC) invalidate('budgets', space)
    invalidateCategoryMap(space)
  }
  await notifyThresholdCrossed(auth, moved.fromCategory)
  await notifyThresholdCrossed(targetAuth, moved.category)
  const doc = await to.findOne({ _id: id })
  return json({ ok: true, id: body.id, version: Number(doc?.version ?? 0) })
}
