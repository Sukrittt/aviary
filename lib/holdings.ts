import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'
import type { Auth } from '@/lib/access'

/**
 * Applies one holding action (market update / contribution / withdrawal):
 * updates the holding's value and logs a `holding_events` row. Tracking-only
 * — deliberately does not touch the budget/envelopes, so a holding's numbers
 * move independently of Ready to Assign. Shared by `app/api/holdings/action`
 * (a manual action) and the recurring-investment cron pass in
 * `app/api/notifications/run` (an automatic contribution) — one code path
 * for both instead of the cron calling the route over HTTP.
 *
 * The value update and the event insert happen in one transaction: a
 * partial write here would otherwise mean a balance moved with no audit
 * event, or an event for a move that never happened. No CAS guard on `value`
 * — it is field-level encrypted so it can't be a filter field. A concurrent
 * write to the same document aborts with a retryable transaction conflict,
 * while incrementing the unencrypted version makes already-open PUT editors
 * detect that this user-visible value changed.
 */

export type HoldingActionResult =
  | { ok: true; previousValue: number; newValue: number }
  | { ok: false; error: string; status: number }

export async function applyHoldingAction(
  auth: Auth,
  params: { name: string; action: 'market_update' | 'contribution' | 'withdrawal'; amount: number },
): Promise<HoldingActionResult> {
  const { name, action, amount } = params

  const holdingsColl = await getCollection('holdings', auth)
  const eventsColl = await getCollection('holding_events', auth)

  const result = await withTx(async (session): Promise<HoldingActionResult> => {
    const holding = await holdingsColl.findOne({ name }, { session })
    if (!holding) return { ok: false, error: 'holding not found', status: 404 }

    const prevValue = Number(holding.value) || 0
    let newValue: number
    switch (action) {
      case 'market_update':
        newValue = Math.max(0, amount)
        break
      case 'contribution':
        newValue = prevValue + amount
        break
      case 'withdrawal':
        newValue = Math.max(0, prevValue - amount)
        break
      default:
        return { ok: false, error: 'invalid action', status: 400 }
    }

    await holdingsColl.updateOne(
      { _id: holding._id },
      { $set: { value: String(newValue), updated_at: new Date().toISOString() }, $inc: { version: 1 } } as never,
      { session },
    )

    await eventsColl.insertOne(
      {
        holding_name: name,
        event_type: action,
        amount: String(amount),
        previous_value: String(prevValue),
        new_value: String(newValue),
        timestamp: new Date().toISOString(),
      },
      { session },
    )

    return { ok: true, previousValue: prevValue, newValue }
  })

  if (result.ok) {
    invalidate('holdings', auth.spaceId)
    invalidate('holdingEvents', auth.spaceId)
  }

  return result
}
