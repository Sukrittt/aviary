import type { ClientSession } from 'mongodb'
import { ObjectId } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import { withTx } from '@/lib/mongodb'
import { casRetry } from '@/lib/cas'
import { nowForUser } from '@/lib/userCurrency'
import { validDate, validMoney, validText } from '@/lib/inputValidation'
import { isDuplicateKeyError } from '@/lib/createExpense'
import { advance, firstRunOnOrAfter, occurrencesDue } from '@/lib/recurringExpense'

/**
 * The income ledger. Income used to live only on the `__income__` budget row:
 * `assigned` is the monthly income (carried into later months like any
 * assignment) and `extra` is this month's one-offs. That row is still what
 * Ready to Assign reads, on both clients, and nothing here changes its math.
 * What's new is a record of each payment that came in (`incomes`) and the
 * schedules that post them (`recurring_incomes`).
 *
 * Every income row says how it is counted, so the two can't drift:
 *
 * - `extra`: a one-off, a weekly/daily/yearly payday, or money in found by the
 *   balance check. Adding, editing or deleting it moves the month's `extra` by
 *   the same amount, in the same transaction.
 * - `monthly`: the payday of a monthly recurring income. The month's
 *   `assigned` already counts it from day 1 (see `syncMonthlyIncome`), so the
 *   row is only a record and never touches the budget.
 */

export const INCOME_CATEGORY = '__income__'
export const INCOME_SOURCES = ['manual', 'recurring', 'balance_gap'] as const
export type IncomeSource = (typeof INCOME_SOURCES)[number]
export type IncomeCounted = 'extra' | 'monthly'

export const INCOME_HEADERS = ['date', 'amount', 'label', 'notes', 'account_id', 'recurring_id', 'source', 'counted', 'created_at']

export const RECURRING_INCOME_HEADERS = [
  'label',
  'amount',
  'frequency', // daily | weekly | monthly | yearly
  'start_date', // YYYY-MM-DD, the first payday
  'end_date',
  'next_run_date', // YYYY-MM-DD, next payday not yet posted
  'account_id',
  'status', // active | paused | ended
  'created_at',
]

/** Stable id of the schedule made from an older account's monthly income. Never minted twice, even after it's deleted. */
export const MIGRATED_CLIENT_ID = 'migrated-monthly'

export class IncomeWriteError extends Error {
  constructor(readonly status: number, message: string, readonly current?: Record<string, unknown>) {
    super(message)
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** The month's monthly income: its own row, else the latest earlier one. Mirrors the clients' carriedAssigned. */
async function carriedIncome(month: string, budgets: Awaited<ReturnType<typeof getCollection>>, session?: ClientSession): Promise<number> {
  const rows = await budgets.find({ category: INCOME_CATEGORY }, { session }).toArray()
  const own = rows.find((r) => r.month === month)
  if (own) return Number(own.assigned) || 0
  const prior = rows
    .filter((r) => typeof r.month === 'string' && r.month < month)
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))[0]
  return prior ? Number(prior.assigned) || 0 : 0
}

/**
 * Writes the month's `__income__` row through `change`, creating it from the
 * carried monthly income when the month doesn't have one yet (an unedited
 * month shows the carried amount, so a new row must start from it, not 0).
 * Takes the caller's transaction session.
 */
async function writeIncomeRow(
  auth: Auth,
  month: string,
  change: (row: { assigned: number; extra: number }) => { assigned: number; extra: number },
  session: ClientSession,
) {
  const budgets = await getCollection('budgets', auth)
  await casRetry<'done'>(async () => {
    const existing = await budgets.findOne({ month, category: INCOME_CATEGORY }, { session })
    if (existing) {
      const next = change({ assigned: Number(existing.assigned) || 0, extra: Number(existing.extra) || 0 })
      await budgets.updateOne(
        { _id: existing._id },
        { $set: { assigned: String(round2(next.assigned)), extra: String(round2(next.extra)) }, $inc: { version: 1 } } as never,
        { session },
      )
      return 'done'
    }
    const next = change({ assigned: await carriedIncome(month, budgets, session), extra: 0 })
    try {
      await budgets.insertOne(
        { month, category: INCOME_CATEGORY, assigned: String(round2(next.assigned)), rolled_over: '0', extra: String(round2(next.extra)), version: 1 },
        { session },
      )
      return 'done'
    } catch (err) {
      if (isDuplicateKeyError(err)) return 'retry'
      throw err
    }
  })
}

async function bumpExtra(auth: Auth, month: string, delta: number, session: ClientSession) {
  if (!month || delta === 0) return
  await writeIncomeRow(auth, month, (row) => ({ ...row, extra: row.extra + delta }), session)
}

export interface AddIncomeInput {
  date: string
  amount: number
  label: string
  notes?: string
  source: IncomeSource
  counted: IncomeCounted
  account_id?: string
  recurring_id?: string
  /** Names the intent, so a retry is recognized before it inserts or bumps a second time. */
  client_id?: string
}

/** Whole cents only: rounding `1.005` or `0.001` would post a different amount than the user typed, or nothing. */
export function validIncomeAmount(value: unknown): boolean {
  return validMoney(value) && Number(value) > 0 && /^\d+(?:\.\d{1,2})?$/.test(String(value).trim())
}

export function incomeInputError(input: { date?: unknown; amount?: unknown; label?: unknown; notes?: unknown }, partial = false): string | null {
  if ((input.date !== undefined || !partial) && !validDate(input.date)) return 'invalid date'
  if ((input.amount !== undefined || !partial) && !validIncomeAmount(input.amount)) return 'amount must be positive, in whole cents'
  if ((input.label !== undefined || !partial) && !validText(input.label, 200)) return 'invalid label'
  if (input.notes !== undefined && !validText(input.notes, 2000, true)) return 'invalid notes'
  return null
}

function invalidateIncome(auth: Auth) {
  invalidate('incomes', auth.userId)
  invalidate('budgets', auth.userId)
}

/** The one way an income row is created. A one-off moves the month's `extra` with it. */
export async function addIncome(auth: Auth, input: AddIncomeInput): Promise<{ id: string; version: number; duplicate: boolean }> {
  const invalid = incomeInputError(input)
  if (invalid) throw new IncomeWriteError(400, invalid)
  const coll = await getCollection('incomes', auth)
  if (input.client_id) {
    const existing = await coll.findOne({ client_id: input.client_id }, undefined, { includeDeleted: true })
    if (existing) return { id: String(existing._id), version: 0, duplicate: true }
  }
  const { timestamp } = await nowForUser(auth.userId)
  const amount = round2(Number(input.amount))
  let id: ObjectId
  try {
    id = await withTx(async (session) => {
      const inserted = await coll.insertOne(
        {
          date: input.date,
          amount: String(amount),
          label: input.label.trim(),
          notes: input.notes ?? '',
          account_id: input.account_id ?? '',
          recurring_id: input.recurring_id ?? '',
          source: input.source,
          counted: input.counted,
          created_at: timestamp,
          version: 0,
          ...(input.client_id ? { client_id: input.client_id } : {}),
        },
        { session },
      )
      if (input.counted === 'extra') await bumpExtra(auth, monthOf(input.date), amount, session)
      return inserted.insertedId
    })
  } catch (err) {
    // Two racing replays: the loser finds the winner's row.
    if (input.client_id && isDuplicateKeyError(err)) {
      const existing = await coll.findOne({ client_id: input.client_id }, undefined, { includeDeleted: true })
      if (existing) return { id: String(existing._id), version: 0, duplicate: true }
    }
    throw err
  }
  invalidateIncome(auth)
  return { id: String(id), version: 0, duplicate: false }
}

function checkVersion(found: Record<string, unknown> | null, version: number): asserts found is Record<string, unknown> & { _id: ObjectId } {
  if (!found) throw new IncomeWriteError(404, 'This income was deleted on another device.')
  if (Number(found.version ?? 0) !== version) {
    throw new IncomeWriteError(409, 'This income changed on another device. Review it before saving.', incomeRow(found))
  }
}

export function incomeRow(doc: Record<string, unknown>) {
  const row: Record<string, string | number> = { id: String(doc._id), version: Number(doc.version ?? 0) }
  for (const h of INCOME_HEADERS) row[h] = doc[h] === undefined || doc[h] === null ? '' : String(doc[h])
  return row
}

export interface IncomePatch {
  amount?: number
  date?: string
  label?: string
  notes?: string
  account_id?: string
}

/** Edits a row; a one-off's change in amount or month moves `extra` with it. Returns the new version. */
export async function updateIncome(auth: Auth, id: string, version: number, patch: IncomePatch): Promise<number> {
  if (!ObjectId.isValid(id)) throw new IncomeWriteError(400, 'invalid id')
  const invalid = incomeInputError(patch, true)
  if (invalid) throw new IncomeWriteError(400, invalid)
  const coll = await getCollection('incomes', auth)
  const next = await withTx(async (session) => {
    const found = await coll.findOne({ _id: new ObjectId(id) }, { session })
    checkVersion(found, version)
    const set: Record<string, unknown> = { version: version + 1 }
    if (patch.amount !== undefined) set.amount = String(round2(patch.amount))
    if (patch.date !== undefined) set.date = patch.date
    if (patch.label !== undefined) set.label = patch.label.trim()
    if (patch.notes !== undefined) set.notes = patch.notes
    if (patch.account_id !== undefined) set.account_id = patch.account_id
    const result = await coll.updateOne({ _id: found._id, version: found.version }, { $set: set }, { session })
    if (result.matchedCount !== 1) throw new IncomeWriteError(409, 'This income changed. Refresh and review it before saving.')
    if (found.counted === 'extra') {
      const oldMonth = monthOf(String(found.date))
      const newMonth = monthOf(String(set.date ?? found.date))
      const oldAmount = Number(found.amount) || 0
      const newAmount = Number(set.amount ?? found.amount) || 0
      if (oldMonth === newMonth) {
        await bumpExtra(auth, oldMonth, round2(newAmount - oldAmount), session)
      } else {
        await bumpExtra(auth, oldMonth, -oldAmount, session)
        await bumpExtra(auth, newMonth, newAmount, session)
      }
    }
    return version + 1
  })
  invalidateIncome(auth)
  return next
}

/** Soft-deletes a row; a one-off comes back out of its month's `extra`. */
export async function deleteIncome(auth: Auth, id: string, version: number): Promise<void> {
  if (!ObjectId.isValid(id)) throw new IncomeWriteError(400, 'invalid id')
  const coll = await getCollection('incomes', auth)
  await withTx(async (session) => {
    const found = await coll.findOne({ _id: new ObjectId(id) }, { session })
    checkVersion(found, version)
    const result = await coll.deleteOne({ _id: found._id, version: found.version }, { session })
    if (result.deletedCount !== 1) throw new IncomeWriteError(409, 'This income changed. Refresh and review it before deleting.')
    if (found.counted === 'extra') await bumpExtra(auth, monthOf(String(found.date)), -(Number(found.amount) || 0), session)
  })
  invalidateIncome(auth)
}

/**
 * Whether a monthly schedule is part of `month`'s monthly income: started by
 * then, not paused, and not past its end date. An ended schedule still counts
 * in the months up to its end.
 */
function countsIn(r: Record<string, unknown>, month: string): boolean {
  const start = String(r.start_date ?? '').slice(0, 7)
  const end = String(r.end_date ?? '').slice(0, 7)
  if (start && start > month) return false
  if (end) return end >= month && (r.status === 'active' || r.status === 'ended')
  return r.status === 'active'
}

/**
 * Sets `month`'s monthly income to the sum of the active monthly recurring
 * incomes that have started by then, keeping its `extra`. Run after any change
 * to a monthly schedule, so Ready to Assign counts the new figure from day 1
 * and later months carry it. A schedule starting in a later month joins when
 * that month arrives (see `runRecurringIncomes`).
 */
export async function syncMonthlyIncome(auth: Auth, month: string): Promise<void> {
  const rec = await getCollection('recurring_incomes', auth)
  const monthly = (await rec.find({ frequency: 'monthly' }).toArray()).filter((r) => countsIn(r, month))
  const total = round2(monthly.reduce((sum, r) => sum + (Number(r.amount) || 0), 0))
  await withTx((session) => writeIncomeRow(auth, month, (row) => ({ ...row, assigned: total }), session))
  invalidateIncome(auth)
}

/**
 * Accounts from before the ledger have a monthly income on the budget row and
 * no schedule. The first time anything reads schedules, that income becomes
 * one monthly recurring income paid on the 1st, so the Income screen shows
 * what Ready to Assign already counts. The budget itself doesn't move. The
 * stable `client_id` (kept on soft-deleted rows, which this collection never
 * purges) makes it a one-time thing even after the user deletes it.
 */
export async function ensureIncomeMigrated(auth: Auth): Promise<void> {
  if (auth.readOnly) return
  const rec = await getCollection('recurring_incomes', auth)
  if (await rec.findOne({ client_id: MIGRATED_CLIENT_ID }, undefined, { includeDeleted: true })) return
  const { date: today, timestamp } = await nowForUser(auth.userId)
  const month = monthOf(today)
  const amount = await carriedIncome(month, await getCollection('budgets', auth))
  const startDate = `${month}-01`
  try {
    await rec.insertOne({
      client_id: MIGRATED_CLIENT_ID,
      label: 'Monthly income',
      amount: String(amount),
      frequency: 'monthly',
      start_date: startDate,
      end_date: '',
      next_run_date: firstRunOnOrAfter(startDate, 'monthly', today),
      account_id: '',
      created_at: timestamp,
      // Nothing to migrate still leaves the (deleted) marker, so it's never asked again.
      status: amount > 0 ? 'active' : 'ended',
    })
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err
    return
  }
  if (amount <= 0) await rec.deleteOne({ client_id: MIGRATED_CLIENT_ID })
  invalidate('recurring_incomes', auth.userId)
}

/**
 * Posts every payday the user's recurring incomes owe as of `today`, then
 * advances each schedule. Same order and guarantees as the recurring expense
 * pass: insert first (idempotent on `recur-income:<id>:<date>`), advance
 * after, so a crash between the two just retries safely. Returns rows posted.
 */
export async function runRecurringIncomes(auth: Auth, today: string): Promise<number> {
  const rec = await getCollection('recurring_incomes', auth)
  const schedules = await rec.find({ status: 'active' }).toArray()
  // A monthly schedule starting this month (a new job set up ahead) counts
  // from day 1, and one that ended last month stops. Later months carry this
  // month's row, so it has to be right. Re-syncing during the month is idempotent.
  const month = monthOf(today)
  const [y, m] = month.split('-').map(Number)
  const lastMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
  const monthly = await rec.find({ frequency: 'monthly' }).toArray()
  if (monthly.some((s) => String(s.start_date ?? '').slice(0, 7) === month || String(s.end_date ?? '').slice(0, 7) === lastMonth)) {
    await syncMonthlyIncome(auth, month)
  }
  let posted = 0
  for (const s of schedules) {
    const id = String(s._id)
    const schedule = {
      frequency: String(s.frequency ?? ''),
      start_date: String(s.start_date ?? ''),
      end_date: String(s.end_date ?? ''),
      next_run_date: String(s.next_run_date ?? ''),
      status: String(s.status ?? ''),
    }
    const due = occurrencesDue(schedule, today)
    if (due.length === 0) {
      if (schedule.end_date && schedule.end_date < today) await rec.updateOne({ _id: s._id }, { $set: { status: 'ended' } })
      continue
    }
    const amount = Number(s.amount) || 0
    for (const date of due) {
      if (amount <= 0) break
      const result = await addIncome(auth, {
        date,
        amount,
        label: String(s.label || 'Income'),
        source: 'recurring',
        counted: schedule.frequency === 'monthly' ? 'monthly' : 'extra',
        account_id: String(s.account_id ?? '') || undefined,
        recurring_id: id,
        client_id: `recur-income:${id}:${date}`,
      })
      if (!result.duplicate) posted++
    }
    const anchorDay = Number(schedule.start_date.slice(8, 10)) || undefined
    const nextRun = advance(due[due.length - 1], schedule.frequency, anchorDay)
    const ended = Boolean(schedule.end_date) && nextRun > schedule.end_date
    await rec.updateOne({ _id: s._id }, { $set: { next_run_date: nextRun, ...(ended ? { status: 'ended' } : {}) } })
  }
  if (posted > 0) invalidate('recurring_incomes', auth.userId)
  return posted
}
