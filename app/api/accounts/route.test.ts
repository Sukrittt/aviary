import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'

const USER = 'accounts-income-test'
vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: USER, readOnly: false, sessionId: null }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ notifyThresholdCrossed: vi.fn() }))
vi.mock('@/lib/users', () => ({ markManualTransactionComplete: vi.fn() }))
vi.mock('@/lib/duplicates', () => ({ flagIfDuplicate: vi.fn(async () => null) }))
vi.mock('@/lib/userCurrency', () => ({
  nowForUser: async () => ({ date: '2026-10-08', timestamp: '2026-10-08T10:00:00.000Z' }),
}))

import { getDb, getClient } from '@/lib/mongodb'
import { flagIfDuplicate } from '@/lib/duplicates'
import { scoped } from '@/lib/scoped'
import * as accounts from './route'
import * as expenses from '../expenses/route'
import * as incomes from '../incomes/route'
import * as recurring from '../recurring-incomes/route'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('accounts'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  const db = await getDb()
  await db.collection('budgets').createIndex({ user_id: 1, month: 1, category: 1 }, { unique: true, partialFilterExpression: { deleted_at: null } })
  for (const name of ['expenses', 'incomes', 'recurring_incomes']) {
    await db.collection(name).createIndex({ user_id: 1, client_id: 1 }, { unique: true, partialFilterExpression: { client_id: { $type: 'string' } } })
  }
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  const db = await getDb()
  for (const name of ['accounts', 'expenses', 'budgets', 'incomes', 'recurring_incomes', 'categories']) await db.collection(name).deleteMany({})
})

function req(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
}

async function budget(month: string, category: string) {
  return scoped((await getDb()).collection('budgets'), USER).findOne({ month, category })
}

async function addAccount(name: string, type: string) {
  const res = await accounts.POST(req('/api/accounts', 'POST', { name, type }))
  return { status: res.status, body: await res.json() }
}

describe('/api/accounts', () => {
  it('creates, lists, renames and archives labels', async () => {
    const { body } = await addAccount('HDFC', 'bank')
    expect((await addAccount('hdfc', 'bank')).status).toBe(409)
    await accounts.PUT(req('/api/accounts', 'PUT', { id: body.id, name: 'HDFC Salary' }))
    await accounts.PUT(req('/api/accounts', 'PUT', { id: body.id, archived: true }))
    const list = await (await accounts.GET(req('/api/accounts', 'GET'))).json()
    expect(list.rows).toEqual([expect.objectContaining({ id: body.id, name: 'HDFC Salary', type: 'bank', archived: true })])
    // Archived names are free again.
    expect((await addAccount('HDFC Salary', 'bank')).status).toBe(200)
  })

  it('stops offering old typed names once the last bank account is archived', async () => {
    const { GET: balanceGET } = await import('../balance-checks/route')
    const checks = scoped((await getDb()).collection('balance_checks'), USER)
    await checks.insertOne({ timestamp: '2026-10-01T10:00:00Z', date: '2026-10-01', status: 'baseline', kind: 'baseline', balance: '100', accounts: [{ name: 'Typed once', balance: '100' }] })
    const id = (await addAccount('HDFC', 'bank')).body.id
    expect((await (await balanceGET(req('/api/balance-checks', 'GET'))).json()).accounts).toEqual(['HDFC'])
    await accounts.PUT(req('/api/accounts', 'PUT', { id, archived: true }))
    expect((await (await balanceGET(req('/api/balance-checks', 'GET'))).json()).accounts).toEqual([])
    await (await getDb()).collection('balance_checks').deleteMany({})
  })

  it('caps bank accounts at five', async () => {
    for (const n of [1, 2, 3, 4, 5]) expect((await addAccount(`Bank ${n}`, 'bank')).status).toBe(200)
    expect((await addAccount('Bank 6', 'bank')).status).toBe(409)
    expect((await addAccount('Wallet', 'cash')).status).toBe(200)
  })
})

describe('expenses on an account', () => {
  it("take the account's payment method, so a card spend still funds the card envelope", async () => {
    const card = (await addAccount('Amex', 'credit_card')).body.id
    const res = await expenses.POST(req('/api/expenses', 'POST', { item: 'Lunch', amount_inr: '400', category: 'Food', date: '2026-10-05', payment_method: 'bank', account_id: card }))
    expect(res.status).toBe(200)
    const { id } = await res.json()
    const rows = (await (await expenses.GET(req('/api/expenses', 'GET'))).json()).rows
    expect(rows[0]).toMatchObject({ id, account_id: card, payment_method: 'credit_card' })
    expect(Number((await budget('2026-10', '__credit_card__'))?.assigned)).toBe(400)
    // Duplicate detection compares the payment method that was saved.
    expect(vi.mocked(flagIfDuplicate).mock.calls.at(-1)?.[1]).toMatchObject({ payment_method: 'credit_card' })

    const cash = (await addAccount('Wallet', 'cash')).body.id
    await expenses.PUT(req('/api/expenses', 'PUT', { id, version: 0, new_account_id: cash }))
    const after = (await (await expenses.GET(req('/api/expenses', 'GET'))).json()).rows[0]
    expect(after).toMatchObject({ account_id: cash, payment_method: 'cash' })
    expect(Number((await budget('2026-10', '__credit_card__'))?.assigned)).toBe(0)

    const page = await (await expenses.GET(req(`/api/expenses?page=1&account=${cash}`, 'GET'))).json()
    expect(page.total).toBe(1)
  })

  it('keeps an expense whose account was archived since, without the label', async () => {
    const id = (await addAccount('Old', 'credit_card')).body.id
    await accounts.PUT(req('/api/accounts', 'PUT', { id, archived: true }))
    const res = await expenses.POST(req('/api/expenses', 'POST', { item: 'Tea', amount_inr: '20', category: 'Food', payment_method: 'bank', account_id: id }))
    expect(res.status).toBe(200)
    const rows = (await (await expenses.GET(req('/api/expenses', 'GET'))).json()).rows
    expect(rows[0]).toMatchObject({ item: 'Tea', account_id: '', payment_method: 'bank' })
  })

  it('refuses to move an expense onto an archived account', async () => {
    const id = (await addAccount('Old', 'bank')).body.id
    await accounts.PUT(req('/api/accounts', 'PUT', { id, archived: true }))
    const created = await (await expenses.POST(req('/api/expenses', 'POST', { item: 'Tea', amount_inr: '20', category: 'Food' }))).json()
    expect((await expenses.PUT(req('/api/expenses', 'PUT', { id: created.id, version: 0, new_account_id: id }))).status).toBe(400)
  })
})

describe('/api/incomes and /api/recurring-incomes', () => {
  it('a one-off lands in this month and comes back out when deleted', async () => {
    const res = await incomes.POST(req('/api/incomes', 'POST', { amount: 1500, label: 'Freelance' }))
    const { id } = await res.json()
    expect(Number((await budget('2026-10', '__income__'))?.extra)).toBe(1500)
    const list = await (await incomes.GET(req('/api/incomes?from=2026-10-01', 'GET'))).json()
    expect(list.rows).toEqual([expect.objectContaining({ id, amount: '1500', label: 'Freelance', date: '2026-10-08', counted: 'extra', version: 0 })])
    await incomes.DELETE(req('/api/incomes', 'DELETE', { id, version: 0 }))
    expect(Number((await budget('2026-10', '__income__'))?.extra)).toBe(0)
  })

  it('a monthly income counts from day 1, and the old monthly figure becomes a schedule', async () => {
    const budgets = scoped((await getDb()).collection('budgets'), USER)
    await budgets.insertOne({ month: '2026-09', category: '__income__', assigned: '40000', rolled_over: '0', version: 1 })

    const before = await (await recurring.GET(req('/api/recurring-incomes', 'GET'))).json()
    expect(before.rows).toEqual([expect.objectContaining({ label: 'Monthly income', amount: '40000', frequency: 'monthly' })])

    await recurring.POST(req('/api/recurring-incomes', 'POST', { label: 'Side gig', amount: 5000, frequency: 'monthly', start_date: '2026-10-20' }))
    expect(Number((await budget('2026-10', '__income__'))?.assigned)).toBe(45000)
    // A job that starts next month doesn't count yet.
    await recurring.POST(req('/api/recurring-incomes', 'POST', { label: 'Next job', amount: 7000, frequency: 'monthly', start_date: '2026-11-01' }))
    expect(Number((await budget('2026-10', '__income__'))?.assigned)).toBe(45000)

    const migrated = before.rows[0].id
    await recurring.PUT(req('/api/recurring-incomes', 'PUT', { id: migrated, amount: 42000 }))
    expect(Number((await budget('2026-10', '__income__'))?.assigned)).toBe(47000)
    await recurring.DELETE(req('/api/recurring-incomes', 'DELETE', { id: migrated }))
    expect(Number((await budget('2026-10', '__income__'))?.assigned)).toBe(5000)
  })

  it('a weekly payday due today posts at once', async () => {
    await recurring.POST(req('/api/recurring-incomes', 'POST', { label: 'Tutoring', amount: 1200, frequency: 'weekly', start_date: '2026-10-08' }))
    const list = await (await incomes.GET(req('/api/incomes', 'GET'))).json()
    expect(list.rows).toEqual([expect.objectContaining({ label: 'Tutoring', date: '2026-10-08', source: 'recurring', counted: 'extra' })])
    expect(Number((await budget('2026-10', '__income__'))?.extra)).toBe(1200)
  })

  it('rejects bad input', async () => {
    expect((await incomes.POST(req('/api/incomes', 'POST', { amount: -5, label: 'x' }))).status).toBe(400)
    expect((await recurring.POST(req('/api/recurring-incomes', 'POST', { label: 'x', amount: 5, frequency: 'hourly', start_date: '2026-10-01' }))).status).toBe(400)
    expect((await recurring.POST(req('/api/recurring-incomes', 'POST', { label: 'x', amount: '1.005', frequency: 'monthly', start_date: '2026-10-01' }))).status).toBe(400)
    expect((await incomes.POST(req('/api/incomes', 'POST', { amount: 0.001, label: 'x' }))).status).toBe(400)
  })
})
