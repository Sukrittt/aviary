import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { nowForUser } from '@/lib/userCurrency'
import { validDate, validText } from '@/lib/inputValidation'
import { AccountError, liveAccount } from '@/lib/accounts'
import { addIncome, deleteIncome, incomeRow, IncomeWriteError, updateIncome, INCOME_HEADERS } from '@/lib/income'

export const dynamic = 'force-dynamic'

/**
 * `GET /api/incomes[?from=YYYY-MM-DD]`: the income ledger, newest first. A
 * user has a handful of rows a month, so there's no paging: Activity merges
 * them into its expense pages by date.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const from = new URL(req.url).searchParams.get('from')
  if (from && !validDate(from)) return error('invalid from')
  const coll = await getCollection('incomes', auth)
  const docs = await coll.find(from ? { date: { $gte: from } } : {}).sort({ date: -1, created_at: -1 }).toArray()
  return json({ headers: INCOME_HEADERS, rows: docs.map(incomeRow) })
}

function writeError(err: unknown) {
  if (err instanceof AccountError) return error('That account is gone. Pick another one.', 400)
  if (!(err instanceof IncomeWriteError)) throw err
  return json({ error: err.message, ...(err.current ? { current: err.current } : {}) }, { status: err.status })
}

/** `''` clears the account; anything else must be a live account. */
async function accountId(auth: Awaited<ReturnType<typeof getAuth>>, raw: unknown): Promise<string | undefined> {
  if (raw === undefined || raw === null) return undefined
  if (raw === '') return ''
  return (await liveAccount(auth, String(raw))).id
}

/** `POST /api/incomes` `{ amount, label, date?, notes?, account_id?, client_id? }`: a one-off that lands in this month's Ready to Assign. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  if (body.client_id !== undefined && !validText(body.client_id, 200)) return error('invalid client id')
  try {
    const date = body.date === undefined ? (await nowForUser(auth.userId)).date : body.date
    const result = await addIncome(auth, {
      date: date as string,
      amount: Number(body.amount),
      label: typeof body.label === 'string' ? body.label : '',
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      account_id: await accountId(auth, body.account_id),
      source: 'manual',
      counted: 'extra',
      client_id: typeof body.client_id === 'string' ? body.client_id : undefined,
    })
    return json({ ok: true, ...result })
  } catch (err) {
    return writeError(err)
  }
}

function precondition(body: Record<string, unknown>) {
  if (typeof body.id !== 'string') return error('id required')
  if (typeof body.version !== 'number' || !Number.isSafeInteger(body.version) || body.version < 0) return error('a non-negative integer version is required')
  return null
}

/** `PUT /api/incomes` `{ id, version, amount?, date?, label?, notes?, account_id? }`. */
export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  const bad = precondition(body)
  if (bad) return bad
  try {
    const version = await updateIncome(auth, String(body.id), Number(body.version), {
      ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
      ...(body.date !== undefined ? { date: body.date as string } : {}),
      ...(body.label !== undefined ? { label: body.label as string } : {}),
      ...(body.notes !== undefined ? { notes: body.notes as string } : {}),
      ...(body.account_id !== undefined ? { account_id: await accountId(auth, body.account_id) } : {}),
    })
    return json({ ok: true, version })
  } catch (err) {
    return writeError(err)
  }
}

/** `DELETE /api/incomes` `{ id, version }`. A one-off comes back out of its month's Ready to Assign. */
export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  const bad = precondition(body)
  if (bad) return bad
  try {
    await deleteIncome(auth, String(body.id), Number(body.version))
    return json({ ok: true })
  } catch (err) {
    return writeError(err)
  }
}
