import { expenseInputError } from './inputValidation'
import type { ClientSession } from 'mongodb'
import { getCollection } from '@/lib/http'
import { nowForUser } from '@/lib/userCurrency'
import type { Auth } from '@/lib/access'
import { invalidate } from '@/lib/cache'
import { invalidateCategoryMap } from '@/lib/categoryMap'
import { notifyThresholdCrossed } from '@/lib/notifications/instant'
import { withTx } from '@/lib/mongodb'
import { casRetry } from '@/lib/cas'
import { resolveCategoryName } from '@/lib/categoryName'

/**
 * The one way an expense gets created. Lifted out of `app/api/expenses`'s POST
 * handler so a server-side job can reuse it without going over HTTP — same
 * reasoning as `applyHoldingAction` and `applySubscriptionExpense`, except
 * this is the *real* path rather than a simplified copy of it.
 *
 * That distinction is the point. `lib/subscriptionExpense.ts` forked this
 * logic and, in simplifying, dropped `withTx` (so an insert can land without
 * its Credit Card envelope bump), dropped `client_id` (so a retry can double a
 * row), and hardcoded `payment_method: 'bank'` (so the Credit Card envelope is
 * never touched at all). Forking it a second time for recurring expenses would
 * have repeated all three on another money path.
 */

export interface CreateExpenseInput {
  item: string
  amount_inr: string
  category: string
  notes?: string
  /** 'YYYY-MM-DD'; defaults to today IST. The recurring backfill passes the *occurrence's* date, not today's. */
  date?: string
  timestamp?: string
  payment_method?: string
  /** Names the intent, so a retry is recognized before it can insert a second row. */
  client_id?: string
  source?: string
  /**
   * Whether to run the post-insert threshold check. Defaults true. A backfill
   * writing several occurrences at once passes `false` and calls
   * `notifyThresholdCrossed` once itself — it rebuilds the whole AI expense
   * context per call, so running it per row is both slow and N duplicate pushes.
   */
  notify?: boolean
}

export interface CreateExpenseResult {
  id: string
  timestamp: string
  version: number
  duplicate: boolean
  /**
   * The category the row was actually stored under. Usually what the caller
   * asked for, but a name loaded before a rename is mapped forward
   * (lib/categoryName.ts) — clients need the real one to find its envelope.
   */
  category: string
}

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
}

/**
 * Nudge the __credit_card__ envelope for a month by an amount delta, floor 0.
 * Always called from inside a caller's `withTx` — takes that transaction's
 * session rather than starting its own; concurrent writes to the same
 * document within a transaction abort with a retryable conflict that
 * `withTransaction` already retries, so the update itself needs no CAS guard
 * (`assigned` is also field-level encrypted, so it can't be used as a filter
 * anyway). A concurrent insert for the same month is caught via the unique
 * partial index and retried as an update.
 */
export async function adjustCreditCardEnvelope(
  auth: Auth,
  month: string,
  delta: number,
  session: ClientSession,
) {
  if (!month || delta === 0) return
  const budgetColl = await getCollection('budgets', auth)

  await casRetry<'done'>(async () => {
    const existing = await budgetColl.findOne({ month, category: '__credit_card__' }, { session })
    if (existing) {
      const current = Number(existing.assigned) || 0
      await budgetColl.updateOne(
        { _id: existing._id },
        { $set: { assigned: String(Math.max(0, current + delta)) }, $inc: { version: 1 } } as never,
        { session },
      )
      return 'done'
    }
    if (delta <= 0) return 'done'
    try {
      await budgetColl.insertOne(
        { month, category: '__credit_card__', assigned: String(delta), rolled_over: '0', version: 1 },
        { session },
      )
      return 'done'
    } catch (err) {
      if (isDuplicateKeyError(err)) return 'retry'
      throw err
    }
  })
}

export async function createExpense(auth: Auth, input: CreateExpenseInput): Promise<CreateExpenseResult> {
  const invalid = expenseInputError({ ...input })
  if (invalid) throw new Error(invalid)
  const ist = await nowForUser(auth.userId)
  const date = String(input.date || ist.date)
  const timestamp = String(input.timestamp || `${date}T${ist.timestamp.slice(11)}`)
  const paymentMethod = String(input.payment_method ?? 'bank')
  const clientId = typeof input.client_id === 'string' ? input.client_id : undefined

  const coll = await getCollection('expenses', auth)

  // A queued offline create can be retried (lost response, killed app, retried
  // request) without the client ever knowing whether the first attempt landed.
  // `client_id` names the intent so a retry is recognized before it can insert
  // a second row or double the Credit Card envelope bump below. The recurring
  // cron leans on the same guarantee, minting `recur:<id>:<date>` per
  // occurrence so a backfill can never log the same date twice.
  if (clientId) {
    const existing = await coll.findOne({ client_id: clientId })
    if (existing) {
      // Replay acknowledges the original create, not a newer edit the caller
      // has never seen. In particular, Undo must still check creation version 0.
      return { id: String(existing._id), timestamp: String(existing.timestamp), version: 0, duplicate: true, category: String(existing.category ?? input.category) }
    }
  }

  // The expense insert and its Credit Card envelope bump must land together —
  // a partial write here leaves an expense with no matching envelope bump.
  const { insertedId, category } = await withTx(async (session) => {
    // A caller can be working from a category list loaded before a rename (a
    // stale mobile screen, an offline queue flushed later, the recurring cron);
    // resolve it here so the row lands in the renamed category rather than
    // orphaning under a name that no longer exists.
    const category = await resolveCategoryName(auth, String(input.category), session)
    const inserted = await coll.insertOne(
      {
        timestamp,
        version: 0,
        date,
        item: String(input.item),
        amount_inr: String(input.amount_inr),
        category,
        notes: String(input.notes ?? ''),
        source: String(input.source ?? 'manual'),
        amount: '',
        description: '',
        payment_method: paymentMethod,
        ...(clientId ? { client_id: clientId } : {}),
      },
      { session },
    )

    // Auto-transfer to the Credit Card envelope for CC purchases.
    if (paymentMethod === 'credit_card') {
      const amountNum = Number(input.amount_inr)
      if (!Number.isNaN(amountNum) && amountNum > 0) {
        await adjustCreditCardEnvelope(auth, date.slice(0, 7), amountNum, session)
      }
    }

    return { insertedId: inserted.insertedId, category }
  })

  invalidate('expenses', auth.userId)
  invalidate('wrapped', auth.userId)
  if (paymentMethod === 'credit_card') invalidate('budgets', auth.userId)
  invalidateCategoryMap(auth.userId)
  // Awaited (not fire-and-forget): a serverless function can be frozen the
  // instant the response is sent, so a background call here could just never
  // run. notifyThresholdCrossed never throws, so this only adds latency, not
  // failure risk.
  if (input.notify !== false) await notifyThresholdCrossed(auth, category)

  return { id: String(insertedId), timestamp, version: 0, duplicate: false, category }
}
