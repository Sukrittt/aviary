import { nowForUser } from '@/lib/userCurrency'
import { createExpense } from '@/lib/createExpense'
import type { Auth } from '@/lib/access'

/**
 * Inserts one auto-generated `expenses` row for a subscription that's due
 * today, via `createExpense` (see its file header — this used to be a fork
 * that dropped `client_id`, `withTx`, and per-subscription payment method;
 * now it's a thin wrapper instead). `client_id: sub:<service>:<date>` makes a
 * same-day retry (e.g. the cron rerunning after a push failure) idempotent,
 * same guarantee the recurring-expense cron leans on.
 */

export type SubscriptionExpenseResult =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; reason: 'no-category' | 'failed' }

export async function applySubscriptionExpense(
  auth: Auth,
  sub: { service: string; amount_inr: string; category: string; notes?: string },
): Promise<SubscriptionExpenseResult> {
  if (!sub.category) return { ok: false, reason: 'no-category' }

  const { date } = await nowForUser(auth.userId)
  const notes = sub.notes ? `Auto-added from subscription · ${sub.notes}` : 'Auto-added from subscription'

  try {
    const result = await createExpense(auth, {
      item: sub.service,
      amount_inr: sub.amount_inr,
      category: sub.category,
      notes,
      date,
      source: 'subscription',
      client_id: `sub:${sub.service}:${date}`,
    })
    return { ok: true, id: result.id, duplicate: result.duplicate }
  } catch (err) {
    // The cron walks every subscription in one pass, and there's no backfill: a throw here costs the rest today's charge.
    console.error('subscription expense failed for', auth.spaceId, sub.service, err)
    return { ok: false, reason: 'failed' }
  }
}
