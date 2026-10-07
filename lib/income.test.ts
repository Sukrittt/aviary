import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/userCurrency', () => ({
  nowForUser: async () => ({ date: '2026-10-08', timestamp: '2026-10-08T10:00:00.000Z' }),
}))

import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import {
  addIncome,
  updateIncome,
  deleteIncome,
  syncMonthlyIncome,
  ensureIncomeMigrated,
  runRecurringIncomes,
  IncomeWriteError,
} from './income'

const USER = 'income-test'
const auth = { userId: USER, readOnly: false, sessionId: null }

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('income'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  const db = await getDb()
  await db.collection('budgets').createIndex({ user_id: 1, month: 1, category: 1 }, { unique: true, partialFilterExpression: { deleted_at: null } })
  await db.collection('incomes').createIndex({ user_id: 1, client_id: 1 }, { unique: true, partialFilterExpression: { client_id: { $type: 'string' } } })
  await db.collection('recurring_incomes').createIndex({ user_id: 1, client_id: 1 }, { unique: true, partialFilterExpression: { client_id: { $type: 'string' } } })
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  const db = await getDb()
  for (const name of ['budgets', 'incomes', 'recurring_incomes']) await db.collection(name).deleteMany({})
})

async function coll(name: string) {
  return scoped((await getDb()).collection(name), USER)
}

async function incomeRow(month: string) {
  const row = await (await coll('budgets')).findOne({ month, category: '__income__' })
  return row ? { assigned: Number(row.assigned), extra: Number(row.extra ?? 0), version: Number(row.version) } : null
}

async function seedIncomeRow(month: string, assigned: number, extra?: number) {
  await (await coll('budgets')).insertOne({ month, category: '__income__', assigned: String(assigned), rolled_over: '0', ...(extra !== undefined ? { extra: String(extra) } : {}), version: 1 })
}

describe('addIncome', () => {
  it('adds a one-off on top of this month, leaving the monthly income alone', async () => {
    await seedIncomeRow('2026-10', 50000, 1000)
    const result = await addIncome(auth, { date: '2026-10-08', amount: 2500, label: 'Freelance', source: 'manual', counted: 'extra' })
    expect(result.duplicate).toBe(false)
    expect(await incomeRow('2026-10')).toEqual({ assigned: 50000, extra: 3500, version: 2 })
    const stored = await (await coll('incomes')).findOne({ _id: new ObjectId(result.id) })
    expect(stored).toMatchObject({ date: '2026-10-08', amount: '2500', label: 'Freelance', source: 'manual', counted: 'extra', version: 0 })
  })

  it("creates the month's income row from the carried monthly income", async () => {
    await seedIncomeRow('2026-08', 40000, 999)
    await addIncome(auth, { date: '2026-10-02', amount: 500, label: 'Gift', source: 'manual', counted: 'extra' })
    // Carries assigned, never the older month's extra.
    expect(await incomeRow('2026-10')).toEqual({ assigned: 40000, extra: 500, version: 1 })
  })

  it('records a payday of the monthly income without counting it twice', async () => {
    await seedIncomeRow('2026-10', 50000)
    await addIncome(auth, { date: '2026-10-01', amount: 50000, label: 'Salary', source: 'recurring', counted: 'monthly' })
    expect(await incomeRow('2026-10')).toEqual({ assigned: 50000, extra: 0, version: 1 })
  })

  it('a replayed client_id neither inserts nor bumps again', async () => {
    await seedIncomeRow('2026-10', 0)
    const input = { date: '2026-10-08', amount: 700, label: 'Refund', source: 'manual' as const, counted: 'extra' as const, client_id: 'c1' }
    const first = await addIncome(auth, input)
    const replay = await addIncome(auth, input)
    expect(replay).toMatchObject({ id: first.id, duplicate: true })
    expect(await incomeRow('2026-10')).toMatchObject({ extra: 700 })
    expect(await (await coll('incomes')).countDocuments({})).toBe(1)
  })

  it('rejects sub-cent amounts instead of rounding them away', async () => {
    await expect(addIncome(auth, { date: '2026-10-08', amount: 1.005, label: 'x', source: 'manual', counted: 'extra' })).rejects.toThrow()
    await expect(addIncome(auth, { date: '2026-10-08', amount: 0.001, label: 'x', source: 'manual', counted: 'extra' })).rejects.toThrow()
  })

  it('rejects a non-positive amount', async () => {
    await expect(addIncome(auth, { date: '2026-10-08', amount: 0, label: 'x', source: 'manual', counted: 'extra' })).rejects.toThrow()
  })
})

describe('updateIncome and deleteIncome', () => {
  it('moves the extra by the change in amount', async () => {
    await seedIncomeRow('2026-10', 0)
    const { id } = await addIncome(auth, { date: '2026-10-08', amount: 1000, label: 'Bonus', source: 'manual', counted: 'extra' })
    const version = await updateIncome(auth, id, 0, { amount: 1500 })
    expect(version).toBe(1)
    expect(await incomeRow('2026-10')).toMatchObject({ extra: 1500 })
  })

  it('moves the extra between months when the date moves', async () => {
    await seedIncomeRow('2026-09', 30000)
    await seedIncomeRow('2026-10', 30000)
    const { id } = await addIncome(auth, { date: '2026-10-08', amount: 1000, label: 'Bonus', source: 'manual', counted: 'extra' })
    await updateIncome(auth, id, 0, { date: '2026-09-30' })
    expect(await incomeRow('2026-10')).toMatchObject({ extra: 0 })
    expect(await incomeRow('2026-09')).toMatchObject({ extra: 1000 })
  })

  it('rejects a stale version without touching money', async () => {
    await seedIncomeRow('2026-10', 0)
    const { id } = await addIncome(auth, { date: '2026-10-08', amount: 1000, label: 'Bonus', source: 'manual', counted: 'extra' })
    await updateIncome(auth, id, 0, { amount: 1200 })
    await expect(updateIncome(auth, id, 0, { amount: 9999 })).rejects.toBeInstanceOf(IncomeWriteError)
    expect(await incomeRow('2026-10')).toMatchObject({ extra: 1200 })
  })

  it('deleting a one-off takes it back out of the month', async () => {
    await seedIncomeRow('2026-10', 50000, 200)
    const { id } = await addIncome(auth, { date: '2026-10-08', amount: 1000, label: 'Bonus', source: 'manual', counted: 'extra' })
    await deleteIncome(auth, id, 0)
    expect(await incomeRow('2026-10')).toMatchObject({ assigned: 50000, extra: 200 })
    expect(await (await coll('incomes')).countDocuments({})).toBe(0)
  })

  it('deleting a monthly payday row leaves the budget alone', async () => {
    await seedIncomeRow('2026-10', 50000)
    const { id } = await addIncome(auth, { date: '2026-10-01', amount: 50000, label: 'Salary', source: 'recurring', counted: 'monthly' })
    await deleteIncome(auth, id, 0)
    expect(await incomeRow('2026-10')).toMatchObject({ assigned: 50000, extra: 0 })
  })
})

describe('syncMonthlyIncome', () => {
  it('sets the monthly income to the sum of active monthly recurring incomes', async () => {
    await seedIncomeRow('2026-10', 10000, 300)
    const rec = await coll('recurring_incomes')
    await rec.insertMany([
      { label: 'Salary', amount: '50000', frequency: 'monthly', status: 'active' },
      { label: 'Rent in', amount: '8000', frequency: 'monthly', status: 'active' },
      { label: 'Paused', amount: '999', frequency: 'monthly', status: 'paused' },
      { label: 'Tuition', amount: '2000', frequency: 'weekly', status: 'active' },
    ])
    await syncMonthlyIncome(auth, '2026-10')
    expect(await incomeRow('2026-10')).toMatchObject({ assigned: 58000, extra: 300 })
  })

  it('leaves out a monthly schedule that starts in a later month', async () => {
    const rec = await coll('recurring_incomes')
    await rec.insertMany([
      { label: 'Salary', amount: '50000', frequency: 'monthly', start_date: '2026-10-01', status: 'active' },
      { label: 'New job', amount: '9000', frequency: 'monthly', start_date: '2026-11-05', status: 'active' },
    ])
    await syncMonthlyIncome(auth, '2026-10')
    expect(await incomeRow('2026-10')).toMatchObject({ assigned: 50000 })
    await syncMonthlyIncome(auth, '2026-11')
    expect(await incomeRow('2026-11')).toMatchObject({ assigned: 59000 })
  })

  it('creates the row when the month has none', async () => {
    await (await coll('recurring_incomes')).insertOne({ label: 'Salary', amount: '42000', frequency: 'monthly', status: 'active' })
    await syncMonthlyIncome(auth, '2026-10')
    expect(await incomeRow('2026-10')).toEqual({ assigned: 42000, extra: 0, version: 1 })
  })
})

describe('ensureIncomeMigrated', () => {
  it('turns the carried monthly income into one monthly recurring income, once', async () => {
    await seedIncomeRow('2026-09', 45000)
    await ensureIncomeMigrated(auth)
    await ensureIncomeMigrated(auth)
    const rows = await (await coll('recurring_incomes')).find({}).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Monthly income', amount: '45000', frequency: 'monthly', start_date: '2026-10-01', next_run_date: '2026-11-01', status: 'active' })
    // Nothing about the budget moves.
    expect(await incomeRow('2026-10')).toBeNull()
  })

  it('does not come back after the user deletes it', async () => {
    await seedIncomeRow('2026-10', 45000)
    await ensureIncomeMigrated(auth)
    const rec = await coll('recurring_incomes')
    await rec.deleteMany({})
    await ensureIncomeMigrated(auth)
    expect(await rec.countDocuments({})).toBe(0)
  })

  it('creates nothing when there is no monthly income', async () => {
    await ensureIncomeMigrated(auth)
    expect(await (await coll('recurring_incomes')).countDocuments({})).toBe(0)
  })
})

describe('runRecurringIncomes', () => {
  it('posts each payday once, counting non-monthly ones into the month', async () => {
    await seedIncomeRow('2026-10', 50000)
    const rec = await coll('recurring_incomes')
    await rec.insertMany([
      { label: 'Salary', amount: '50000', frequency: 'monthly', start_date: '2026-09-01', end_date: '', next_run_date: '2026-10-01', status: 'active' },
      { label: 'Tutoring', amount: '1500', frequency: 'weekly', start_date: '2026-09-24', end_date: '', next_run_date: '2026-10-01', status: 'active' },
    ])
    const posted = await runRecurringIncomes(auth, '2026-10-08')
    expect(posted).toBe(3) // salary on the 1st, tutoring on the 1st and 8th
    expect(await incomeRow('2026-10')).toMatchObject({ assigned: 50000, extra: 3000 })

    const again = await runRecurringIncomes(auth, '2026-10-08')
    expect(again).toBe(0)
    expect(await incomeRow('2026-10')).toMatchObject({ extra: 3000 })

    const all = await rec.find({}).toArray()
    const salary = all.find((r) => r.label === 'Salary')
    const tutoring = all.find((r) => r.label === 'Tutoring')
    expect(salary?.next_run_date).toBe('2026-11-01')
    expect(tutoring?.next_run_date).toBe('2026-10-15')

    const incomes = await (await coll('incomes')).find({}).toArray()
    expect(incomes.map((i) => [i.label, i.date, i.counted]).sort()).toEqual([
      ['Salary', '2026-10-01', 'monthly'],
      ['Tutoring', '2026-10-01', 'extra'],
      ['Tutoring', '2026-10-08', 'extra'],
    ])
  })

  it("counts a monthly schedule into Ready to Assign once its first month arrives", async () => {
    await seedIncomeRow('2026-10', 50000)
    await (await coll('recurring_incomes')).insertMany([
      { label: 'Salary', amount: '50000', frequency: 'monthly', start_date: '2026-09-01', end_date: '', next_run_date: '2026-11-01', status: 'active' },
      { label: 'New job', amount: '9000', frequency: 'monthly', start_date: '2026-10-20', end_date: '', next_run_date: '2026-10-20', status: 'active' },
    ])
    await runRecurringIncomes(auth, '2026-10-02')
    expect(await incomeRow('2026-10')).toMatchObject({ assigned: 59000 })
  })

  it('a replay after a crash before advancing posts nothing new', async () => {
    const rec = await coll('recurring_incomes')
    const { insertedId } = await rec.insertOne({ label: 'Tutoring', amount: '1500', frequency: 'weekly', start_date: '2026-10-01', end_date: '', next_run_date: '2026-10-08', status: 'active' })
    await runRecurringIncomes(auth, '2026-10-08')
    await rec.updateOne({ _id: insertedId }, { $set: { next_run_date: '2026-10-08' } })
    expect(await runRecurringIncomes(auth, '2026-10-08')).toBe(0)
    expect(await incomeRow('2026-10')).toMatchObject({ extra: 1500 })
  })
})
