import { json, error, readBody, getCollection } from '@/lib/http'
import { carriedAssigned } from '@/lib/budgetCarry'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'
import { casRetry } from '@/lib/cas'
import { reconcileThresholdLevels } from '@/lib/notifications/instant'

export const dynamic = 'force-dynamic'

/** Matches the client-side sentinel in MoveMoneyModal.tsx / move-money.tsx. */
const RTA_SENTINEL = '__ready_to_assign__'

interface Source {
  category: string
  amount: number
}

/**
 * Moves money between envelopes (or from Ready to Assign into one) in a
 * single transaction. Replaces the old client-side pattern of two
 * independent `PUT /api/budgets` calls — a debit that succeeded followed by
 * a credit that failed used to make money disappear with no error shown.
 *
 * body: { month, to, sources: [{ category, amount }] } — or the single-source
 * shorthand { month, to, from, amount }. `sources[].category` may be the RTA
 * sentinel (debits nothing, RTA is derived, not a stored row). `to` may also
 * be RTA, in which case the transaction only debits the source envelopes.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  const month = typeof body.month === 'string' ? body.month : ''
  const to = typeof body.to === 'string' ? body.to : ''
  const rawSources = Array.isArray(body.sources)
    ? body.sources
    : typeof body.from === 'string' && typeof body.amount === 'number'
      ? [{ category: body.from, amount: body.amount }]
      : null

  if (!month || !to || !rawSources || rawSources.length === 0) {
    return error('month, to, and sources (or from/amount) required')
  }
  const sources: Source[] = []
  for (const raw of rawSources as unknown[]) {
    const category = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).category : undefined
    const amount = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).amount : undefined
    if (typeof category !== 'string' || typeof amount !== 'number' || !(amount > 0)) {
      return error('each source needs a category and a positive amount')
    }
    if (category === to) return error('cannot transfer a category to itself')
    sources.push({ category, amount })
  }

  const totalAmount = sources.reduce((sum, s) => sum + s.amount, 0)

  const budgetColl = await getCollection('budgets', auth)

  // Fail fast on a source category that has never had a budget row at all —
  // that's a genuinely nonexistent envelope, not just one untouched this
  // month (see carriedAssigned() in lib/budgetCarry.ts for that case).
  for (const source of sources) {
    if (source.category === RTA_SENTINEL) continue
    const existing = await budgetColl.findOne({ category: source.category })
    if (!existing) return error(`no budget row for "${source.category}" in ${month}`, 404)
  }

  await withTx(async (session) => {
    // Debit every non-RTA source. A concurrent insert for the same
    // month+category (the no-row-yet branch below) is caught via the unique
    // partial index and retried as an update — same pattern as the target
    // credit below. Otherwise `assigned` is field-level encrypted so it can't
    // be a filter field; concurrent writes to an *existing* document within a
    // transaction abort with a retryable conflict that `withTransaction`
    // already retries.
    for (const source of sources) {
      if (source.category === RTA_SENTINEL) continue
      await casRetry<'done'>(async () => {
        const existing = await budgetColl.findOne({ month, category: source.category }, { session })
        if (existing) {
          const current = Number(existing.assigned) || 0
          await budgetColl.updateOne(
            { _id: existing._id },
            { $set: { assigned: String(current - source.amount) }, $inc: { version: 1 } } as never,
            { session },
          )
          return 'done'
        }
        // No row yet for this month — the client still shows this envelope
        // as available, carrying forward the most recent prior month's
        // assigned amount until it's explicitly touched (see Mobile's
        // src/lib/envelope.ts::carriedAssigned). Materialize that row now so
        // debiting it here matches what was on screen instead of 404ing.
        const carried = await carriedAssigned(budgetColl, source.category, month, session)
        try {
          await budgetColl.insertOne(
            { month, category: source.category, assigned: String(carried - source.amount), rolled_over: '0', version: 1 },
            { session },
          )
          return 'done'
        } catch (err) {
          if (isDuplicateKeyError(err)) return 'retry'
          throw err
        }
      })
    }

    // Credit the target, upserting a row if this is its first assignment. A
    // concurrent insert for the same category is caught via the unique
    // partial index and retried as an update. Ready to Assign is derived, so
    // returning money there intentionally has no target row to credit.
    if (to !== RTA_SENTINEL) await casRetry<'done'>(async () => {
      const existing = await budgetColl.findOne({ month, category: to }, { session })
      if (existing) {
        const current = Number(existing.assigned) || 0
        await budgetColl.updateOne(
          { _id: existing._id },
          { $set: { assigned: String(current + totalAmount) }, $inc: { version: 1 } } as never,
          { session },
        )
        return 'done'
      }
      // Same carry-forward as the debit side: a target with no row this month
      // still displays its prior assignment, so the new row must build on it.
      // Inserting just totalAmount dropped the carried balance, which flowed
      // back into Ready to Assign.
      const carried = await carriedAssigned(budgetColl, to, month, session)
      try {
        await budgetColl.insertOne(
          { month, category: to, assigned: String(carried + totalAmount), rolled_over: '0', version: 1 },
          { session },
        )
        return 'done'
      } catch (err) {
        if (isDuplicateKeyError(err)) return 'retry'
        throw err
      }
    })
  })

  invalidate('budgets', auth.spaceId)
  await reconcileThresholdLevels(
    auth,
    [to, ...sources.map((source) => source.category)].filter((category) => category !== RTA_SENTINEL),
    month,
  )
  return json({ ok: true })
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
}
