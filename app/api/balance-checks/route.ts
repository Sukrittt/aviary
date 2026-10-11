import { ObjectId } from 'mongodb'
import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { validMoney } from '@/lib/inputValidation'
import { bankAccountNames } from '@/lib/accounts'
import { nowForUser } from '@/lib/userCurrency'
import {
  anchorOf,
  cardWindowStart,
  checksCollection,
  classify,
  historyStart,
  isDue,
  latestChecks,
  loadCheckExpenses,
  loggedPct,
  paidByCard,
  parseAccounts,
  sameAccounts,
  paidFromBank,
  spendBetween,
  toleranceFor,
  type StoredCheck,
} from '@/lib/balanceCheck'

export const dynamic = 'force-dynamic'

/** The meter from the newest check that actually measured something. */
function lastLoggedPct(checks: StoredCheck[]): number | null {
  const measured = checks.find((c) => c.status === 'square' || c.status === 'resolved')
  if (!measured) return null
  return measured.status === 'square' ? 100 : loggedPct(measured.logged, measured.forgotten)
}

/**
 * `GET /api/balance-checks`: whether a check is due, the balance the app
 * expects (so the user can confirm rather than type), and the logged meter
 * from the last check. The demo account never sees a check.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  if (auth.readOnly) return json({ due: false, expected: null, anchor: null, open: false, loggedPct: null, accounts: [] })

  const [checks, now, banks] = await Promise.all([latestChecks(auth, 5), nowForUser(auth.userId), bankAccountNames(auth)])
  const anchor = anchorOf(checks)
  const open = checks[0]?.status === 'open'

  let expected: number | null = null
  if (anchor) {
    const expenses = await loadCheckExpenses(auth, anchor.date)
    expected = Math.round((anchor.balance - spendBetween(expenses, anchor.timestamp, now.timestamp, paidFromBank)) * 100) / 100
  }

  return json({
    due: open || isDue(anchor?.timestamp ?? null, now.timestamp),
    open,
    expected,
    anchor: anchor ? { timestamp: anchor.timestamp, date: anchor.date, balance: anchor.balance } : null,
    loggedPct: lastLoggedPct(checks),
    // The accounts to ask about: the user's bank accounts once they've made
    // any account, else the newest list typed. A check from an older app has none and doesn't clear it.
    accounts: banks ?? checks.find((c) => c.accounts.length > 0)?.accounts ?? [],
  })
}

/**
 * `POST /api/balance-checks` `{ accounts: [{ name, balance }] }` (or
 * `{ balance }` from older apps): records the total and says what it means.
 * The first check is the starting point, and so is one over a different set
 * of accounts. After that it's
 * `square` (nothing to answer), `unlogged` (money left that wasn't logged) or
 * `surplus` (more money than expected); those two stay `open` until
 * `POST /api/balance-checks/:id/resolve`. Sending a new balance while one is
 * open replaces it, so a typo is fixed by simply checking again.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  let balance: number
  let accounts: { name: string; balance: string }[] | undefined
  if (body.accounts !== undefined) {
    const parsed = parseAccounts(body.accounts)
    if (!parsed) return error('accounts must be 1 to 5 named balances')
    balance = parsed.total
    accounts = parsed.accounts.map((a) => ({ name: a.name, balance: String(a.balance) }))
  } else {
    if (!validMoney(body.balance, true)) return error('balance must be a number')
    balance = Math.round(Number(body.balance) * 100) / 100
  }

  const [checks, now] = await Promise.all([latestChecks(auth), nowForUser(auth.userId)])
  const replacing = checks[0]?.status === 'open' ? checks[0] : null
  const anchor = anchorOf(checks)
  const coll = await checksCollection(auth)

  const save = async (doc: Record<string, unknown>): Promise<string> => {
    if (replacing) {
      await coll.replaceOne({ _id: replacing._id as ObjectId }, doc)
      return String(replacing._id)
    }
    const inserted = await coll.insertOne(doc)
    return String(inserted.insertedId)
  }

  const accountsChanged = !!anchor && !sameAccounts(anchor.accounts, accounts?.map((a) => a.name) ?? [])
  if (!anchor || accountsChanged) {
    const id = await save({ timestamp: now.timestamp, date: now.date, status: 'baseline', kind: 'baseline', balance: String(balance), ...(accounts && { accounts }) })
    return json({ id, kind: 'baseline', reason: anchor ? 'accounts_changed' : 'first', balance })
  }

  const expenses = await loadCheckExpenses(auth, historyStart(now.timestamp, anchor.date))
  const logged = spendBetween(expenses, anchor.timestamp, now.timestamp, paidFromBank)
  const expected = Math.round((anchor.balance - logged) * 100) / 100
  const gap = Math.round((anchor.balance - balance - logged) * 100) / 100
  const tolerance = toleranceFor(anchor.balance, expenses)
  const kind = classify(gap, tolerance)
  const cardSpendRecent = spendBetween(expenses, cardWindowStart(now.timestamp), now.timestamp, paidByCard)

  const id = await save({
    timestamp: now.timestamp,
    date: now.date,
    status: kind === 'square' ? 'square' : 'open',
    kind,
    balance: String(balance),
    expected: String(expected),
    logged: String(logged),
    gap: String(gap),
    tolerance: String(tolerance),
    ...(accounts && { accounts }),
  })

  return json({ id, kind, balance, expected, logged, gap, tolerance, cardSpendRecent, loggedPct: kind === 'square' ? 100 : null })
}
