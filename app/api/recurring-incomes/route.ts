import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { nowForUser } from '@/lib/userCurrency'
import { invalidate } from '@/lib/cache'
import { validDate, validText } from '@/lib/inputValidation'
import { FREQUENCIES, firstRunOnOrAfter, type Frequency } from '@/lib/recurringExpense'
import { AccountError, liveAccount } from '@/lib/accounts'
import { validIncomeAmount, ensureIncomeMigrated, RECURRING_INCOME_HEADERS, runRecurringIncomes, syncMonthlyIncome } from '@/lib/income'
import { toRow } from '@/lib/models'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['active', 'paused', 'ended'])

function isFrequency(value: unknown): value is Frequency {
  return typeof value === 'string' && (FREQUENCIES as string[]).includes(value)
}

function row(doc: Record<string, unknown>) {
  return { id: String(doc._id), ...toRow(RECURRING_INCOME_HEADERS, doc) }
}

/**
 * After any schedule change: Ready to Assign counts the monthly ones from day
 * 1 of this month, and anything due today posts now rather than tomorrow.
 */
async function settle(auth: Auth) {
  const { date } = await nowForUser(auth.userId)
  await syncMonthlyIncome(auth, date.slice(0, 7))
  await runRecurringIncomes(auth, date)
  invalidate('recurring_incomes', auth.userId)
}

/** `GET /api/recurring-incomes`: the schedules, after turning an older account's monthly income into one. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  await ensureIncomeMigrated(auth)
  const coll = await getCollection('recurring_incomes', auth)
  const docs = await coll.find({}).sort({ created_at: 1 }).toArray()
  return json({ headers: RECURRING_INCOME_HEADERS, rows: docs.map(row) })
}

async function accountId(auth: Auth, raw: unknown): Promise<string | undefined> {
  if (raw === undefined || raw === null) return undefined
  if (raw === '') return ''
  return (await liveAccount(auth, String(raw))).id
}

function inputError(body: Record<string, unknown>, partial: boolean): string | null {
  if ((body.label !== undefined || !partial) && !validText(body.label, 200)) return 'invalid label'
  if ((body.amount !== undefined || !partial) && !validIncomeAmount(body.amount)) return 'amount must be positive, in whole cents'
  if ((body.frequency !== undefined || !partial) && !isFrequency(body.frequency)) return `frequency must be one of ${FREQUENCIES.join(', ')}`
  if ((body.start_date !== undefined || !partial) && !validDate(body.start_date)) return 'start_date must be YYYY-MM-DD'
  if (body.end_date !== undefined && body.end_date !== '' && !validDate(body.end_date)) return 'end_date must be YYYY-MM-DD'
  if (body.status !== undefined && !STATUSES.has(String(body.status))) return 'status must be active, paused or ended'
  return null
}

/** `POST /api/recurring-incomes` `{ label, amount, frequency, start_date, end_date?, account_id? }`. `start_date` is the first payday. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const body = await readBody(req)
  const invalid = inputError(body, false)
  if (invalid) return error(invalid)
  const startDate = String(body.start_date)
  const endDate = String(body.end_date ?? '')
  if (endDate && endDate < startDate) return error('end_date must not precede start_date')

  let account: string | undefined
  try {
    account = await accountId(auth, body.account_id)
  } catch (err) {
    if (err instanceof AccountError) return error('That account is gone. Pick another one.')
    throw err
  }

  await ensureIncomeMigrated(auth)
  const { date: today, timestamp } = await nowForUser(auth.userId)
  const coll = await getCollection('recurring_incomes', auth)
  const inserted = await coll.insertOne({
    label: String(body.label).trim(),
    amount: String(Math.round(Number(body.amount) * 100) / 100),
    frequency: String(body.frequency),
    start_date: startDate,
    end_date: endDate,
    // Same rule as recurring expenses: a backdated first payday schedules
    // forward rather than backfilling paydays nobody asked to record.
    next_run_date: firstRunOnOrAfter(startDate, String(body.frequency), today),
    account_id: account ?? '',
    status: 'active',
    created_at: timestamp,
  })
  await settle(auth)
  return json({ ok: true, id: String(inserted.insertedId) })
}

/** `PUT /api/recurring-incomes` `{ id, ...fields }`. */
export async function PUT(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PUT')
  if (guard) return guard

  const body = await readBody(req)
  const id = typeof body.id === 'string' ? body.id : ''
  if (!ObjectId.isValid(id)) return error('id required')
  const invalid = inputError(body, true)
  if (invalid) return error(invalid)

  const coll = await getCollection('recurring_incomes', auth)
  const existing = await coll.findOne({ _id: new ObjectId(id) })
  if (!existing) return error('recurring income not found', 404)

  const update: Record<string, string> = {}
  if (body.label !== undefined) update.label = String(body.label).trim()
  if (body.amount !== undefined) update.amount = String(Math.round(Number(body.amount) * 100) / 100)
  if (body.frequency !== undefined) update.frequency = String(body.frequency)
  if (body.start_date !== undefined) update.start_date = String(body.start_date)
  if (body.end_date !== undefined) update.end_date = String(body.end_date)
  if (body.status !== undefined) update.status = String(body.status)
  try {
    const account = await accountId(auth, body.account_id)
    if (account !== undefined) update.account_id = account
  } catch (err) {
    if (err instanceof AccountError) return error('That account is gone. Pick another one.')
    throw err
  }

  const startDate = update.start_date ?? String(existing.start_date)
  const endDate = update.end_date ?? String(existing.end_date ?? '')
  if (endDate && endDate < startDate) return error('end_date must not precede start_date')

  // Resuming starts from now rather than making up the paused stretch, and a
  // new payday or frequency moves the next one: same rules as recurring expenses.
  const resuming = update.status === 'active' && String(existing.status) !== 'active'
  if (resuming || update.frequency !== undefined || update.start_date !== undefined) {
    const frequency = update.frequency ?? String(existing.frequency)
    update.next_run_date = firstRunOnOrAfter(startDate, frequency, (await nowForUser(auth.userId)).date)
  }

  await coll.updateOne({ _id: existing._id }, { $set: update })
  await settle(auth)
  return json({ ok: true })
}

/** `DELETE /api/recurring-incomes` `{ id }`. Paydays already posted stay in the ledger. */
export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const body = await readBody(req)
  const id = typeof body.id === 'string' ? body.id : ''
  if (!ObjectId.isValid(id)) return error('id required')
  const coll = await getCollection('recurring_incomes', auth)
  const result = await coll.deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0) return error('recurring income not found', 404)
  await settle(auth)
  return json({ ok: true })
}
