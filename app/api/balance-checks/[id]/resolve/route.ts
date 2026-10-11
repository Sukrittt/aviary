import { ObjectId } from 'mongodb'
import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { validMoney } from '@/lib/inputValidation'
import {
  CARD_WINDOW_DAYS,
  cardShortfall,
  checksCollection,
  gapProposal,
  historyStart,
  loadCheckExpenses,
  loggedPct,
  MONEY_IN_REASONS,
  paidByCard,
  spendBetween,
  splitByHabit,
  toStoredCheck,
  type MoneyInReason,
  type StoredCheck,
} from '@/lib/balanceCheck'
import type { Auth } from '@/lib/access'
import { addIncome } from '@/lib/income'

export const dynamic = 'force-dynamic'

/** The estimated rows for a resolved gap, split by the user's habits (nothing is logged here). */
async function estimates(auth: Auth, check: StoredCheck) {
  if (check.forgotten <= 0 && check.cardShortfall <= 0) return null
  const expenses = await loadCheckExpenses(auth, historyStart(check.timestamp))
  const rows = [
    ...splitByHabit(check.forgotten, expenses, 'bank'),
    ...splitByHabit(check.cardShortfall, expenses, 'credit_card'),
  ]
  return gapProposal(String(check._id), check.date, rows)
}

function reply(check: StoredCheck, proposal: Awaited<ReturnType<typeof estimates>>) {
  return json({
    status: 'resolved',
    forgotten: check.forgotten,
    cardShortfall: check.cardShortfall,
    proposal,
    loggedPct: check.kind === 'surplus' ? 100 : loggedPct(check.logged, check.forgotten),
  })
}

/**
 * `POST /api/balance-checks/:id/resolve`: what an open gap was.
 *
 * Money that left (`unlogged`): `{ cardBill?, movedOut? }`, both optional and
 * never counted as spending. What's left over is spends the user didn't log,
 * returned as estimated rows split by their usual envelopes. A card bill is
 * also compared with the card spends logged in the 30 days before, and a
 * clear shortfall comes back as estimated card spends. The app reviews those
 * rows on its capture card and logs them with `source: balance_gap`.
 *
 * More money than expected (`surplus`): `{ moneyIn }`, one of income, refund
 * or moved_in. Income lands in the ledger as "Money in" and in this month's
 * Ready to Assign (idempotent on the check id); the other two log nothing.
 *
 * Resolving an already resolved check returns the same answer, so a retry
 * after a lost response is safe.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return error('invalid id', 400)

  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const coll = await checksCollection(auth)
  const doc = await coll.findOne({ _id: new ObjectId(id) })
  if (!doc) return error('check not found', 404)
  const check = toStoredCheck(doc)
  if (check.status === 'resolved') return reply(check, await estimates(auth, check))
  if (check.status !== 'open') return error('This check has nothing to explain.', 409)

  const body = await readBody(req)
  const resolvedAt = new Date().toISOString()

  if (check.kind === 'surplus') {
    const moneyIn = body.moneyIn as MoneyInReason
    if (!MONEY_IN_REASONS.includes(moneyIn)) return error('moneyIn must be income, refund or moved_in')
    // Before the status flips, so a failed post leaves the check open to retry.
    if (moneyIn === 'income' && check.gap < 0) {
      await addIncome(auth, {
        date: check.date,
        amount: Math.round(-check.gap * 100) / 100,
        label: 'Money in',
        notes: 'Found by your balance check',
        source: 'balance_gap',
        counted: 'extra',
        client_id: `balance:${id}`,
      })
    }
    await coll.updateOne({ _id: new ObjectId(id) }, { $set: { status: 'resolved', money_in: moneyIn, forgotten: '0', resolved_at: resolvedAt } })
    return reply({ ...check, status: 'resolved', moneyIn, forgotten: 0 }, null)
  }

  for (const field of ['cardBill', 'movedOut'] as const) {
    if (body[field] !== undefined && !validMoney(body[field])) return error(`${field} must be a positive number`)
  }
  const cardBill = Math.round(Number(body.cardBill ?? 0) * 100) / 100
  const movedOut = Math.round(Number(body.movedOut ?? 0) * 100) / 100

  let forgotten = Math.max(0, check.gap - cardBill - movedOut)
  if (forgotten <= check.tolerance) forgotten = 0
  forgotten = Math.round(forgotten)

  let shortfall = 0
  if (cardBill > 0) {
    const expenses = await loadCheckExpenses(auth, historyStart(check.timestamp))
    const windowStart = new Date(Date.parse(check.timestamp) - CARD_WINDOW_DAYS * 86_400_000).toISOString()
    shortfall = cardShortfall(cardBill, spendBetween(expenses, windowStart, check.timestamp, paidByCard), check.tolerance)
  }

  await coll.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: 'resolved',
        forgotten: String(forgotten),
        card_bill: String(cardBill),
        card_shortfall: String(shortfall),
        moved_out: String(movedOut),
        resolved_at: resolvedAt,
      },
    },
  )
  const resolved: StoredCheck = { ...check, status: 'resolved', forgotten, cardBill, cardShortfall: shortfall, movedOut }
  return reply(resolved, await estimates(auth, resolved))
}
