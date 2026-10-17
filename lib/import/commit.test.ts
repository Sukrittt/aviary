import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ notifyThresholdCrossed: vi.fn(), reconcileThresholdLevels: vi.fn() }))
vi.mock('@/lib/userCurrency', () => ({
  nowForUser: async () => ({ date: '2026-10-17', timestamp: '2026-10-17T10:00:00.000Z' }),
  getUserCurrency: async () => 'INR',
}))
const completeOnboarding = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/billing/service', () => ({ completeOnboarding: () => completeOnboarding() }))
const sendPush = vi.fn(async (_message: unknown) => 0)
vi.mock('@/lib/push', () => ({ sendPushNotification: (arg: unknown) => sendPush(arg) }))
const sendEmail = vi.fn(async (_message: unknown, _key: unknown) => 'email-id')
vi.mock('@/lib/email/resend', () => ({ sendEmail: (msg: unknown, key: unknown) => sendEmail(msg, key) }))
// AI off: every category lands in Essentials, which the review copy expects.
vi.mock('@/lib/import/ai', () => ({ importAiAllowed: async () => false, pickCategoryGroups: vi.fn(), pickColumnRoles: vi.fn() }))

import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { previewFile } from './service'
import { commitImport, parseEdits, type CommitEdits } from './commit'
import { passAndChain, retryImport, runImportPass } from './backfill'
import type { Review } from './service'

const USER = 'import-test'
const auth = { userId: USER, readOnly: false, sessionId: null }
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name))

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('imports'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  const db = await getDb()
  const live = { partialFilterExpression: { deleted_at: null } }
  const clientId = { unique: true, partialFilterExpression: { client_id: { $type: 'string' } } }
  await db.collection('budgets').createIndex({ user_id: 1, month: 1, category: 1 }, { unique: true, ...live })
  await db.collection('categories').createIndex({ user_id: 1, name: 1 }, { unique: true, ...live })
  await db.collection('groups').createIndex({ user_id: 1, name: 1 }, { unique: true, ...live })
  for (const name of ['expenses', 'incomes', 'recurring_incomes']) await db.collection(name).createIndex({ user_id: 1, client_id: 1 }, clientId)
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  vi.clearAllMocks()
  const db = await getDb()
  for (const c of await db.collections()) await c.deleteMany({})
  await db.collection('users').insertOne({ _id: USER as never, email: 'sam@example.com', name: 'Sam Rao', currencyCode: 'USD' })
})

const coll = async (name: string) => scoped((await getDb()).collection(name), USER)
const count = async (name: string, filter: Record<string, unknown> = {}) => (await coll(name)).countDocuments(filter)
const budget = async (month: string, category: string) => (await coll('budgets')).findOne({ month, category })

function editsFrom(review: Review, over: Partial<CommitEdits> = {}): CommitEdits {
  return parseEdits({
    currency: review.currency,
    direction: review.direction,
    groups: review.groups,
    categories: review.categories.map((c) => (c.source === 'Food · Groceries' ? { ...c, name: 'Groceries' } : c)),
    accounts: review.accounts,
    salary: review.salary && { amount: review.salary.amount, day: review.salary.day },
    ...over,
  })
}

describe('preview', () => {
  it('reads a Money Manager file into a review without touching the account', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'Money Manager.csv')
    expect(review).toMatchObject({
      app: 'moneymanager',
      currency: 'INR',
      directionSource: 'column',
      counts: { expense: 6, income: 2, from: '2026-09-01', to: '2026-10-04' },
      skipped: { transfer: 2, opening_balance: 1, zero: 1, future: 1, other_currency: 1 },
      salary: { label: 'Acme payroll', amount: 85000, day: 1 },
      otherCurrencies: ['USD'],
      droppedAccounts: [],
    })
    expect(review.categories).toEqual([
      { source: 'Rent', name: 'Rent', group: 'Essentials', monthly: 25000 },
      { source: 'Food · Groceries', name: 'Food · Groceries', group: 'Essentials', monthly: 1600 },
      { source: 'Food · Eating out', name: 'Food · Eating out', group: 'Essentials', monthly: 900 },
      { source: 'Health', name: 'Health', group: 'Essentials', monthly: 200 },
    ])
    expect(review.accounts.map((a) => [a.name, a.type])).toEqual([['Cash', 'cash'], ['HDFC Bank', 'bank'], ['HDFC Credit Card', 'credit_card']])
    expect(review.samples).toHaveLength(3)
    expect(await count('categories')).toBe(0)
    expect(await count('imports', { status: 'previewed' })).toBe(1)
  })

  it('a second upload replaces the first preview', async () => {
    await previewFile(auth, fixture('money-manager.csv'), 'a.csv')
    const second = await previewFile(auth, fixture('monefy.csv'), 'b.csv')
    const docs = await (await coll('imports')).find({}).toArray()
    expect(docs.map((d) => String(d._id))).toEqual([second.importId])
  })

  it('keeps the rows encrypted at rest', async () => {
    const { importId } = await previewFile(auth, fixture('money-manager.csv'), 'a.csv')
    const raw = await (await getDb()).collection('imports').findOne({ _id: new ObjectId(importId) })
    expect(String(raw?.rows)).not.toContain('Acme payroll')
    expect(String(raw?.plan)).toMatch(/^enc:/)
  })
})

describe('commit and backfill', () => {
  it('sets up the account in one go, then books the history through the normal write paths', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    const result = await commitImport(auth, review.importId, editsFrom(review))
    expect(result).toEqual({ importId: review.importId, total: 8, groupCount: 1, categoryCount: 4, income: 85000 })

    const user = await (await getDb()).collection('users').findOne({ _id: USER as never })
    expect(user?.currencyCode).toBe('INR')
    expect((await (await coll('groups')).find({}).toArray()).map((g) => g.name)).toEqual(['Essentials'])
    expect((await (await coll('categories')).find({}).sort({ order: 1 }).toArray()).map((c) => [c.name, c.group])).toEqual([
      ['Rent', 'Essentials'], ['Groceries', 'Essentials'], ['Food · Eating out', 'Essentials'], ['Health', 'Essentials'],
    ])
    expect(await count('accounts')).toBe(3)
    expect(await (await coll('recurring_incomes')).findOne({ frequency: 'monthly', status: 'active' })).toMatchObject({ label: 'Acme payroll', amount: '85000', start_date: '2026-10-01' })
    expect(await budget('2026-10', '__income__')).toMatchObject({ assigned: '85000' })
    expect(await budget('2026-10', 'Groceries')).toMatchObject({ assigned: '1600' })
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
    expect(await count('expenses')).toBe(0)

    expect(await runImportPass(auth, review.importId, Date.now() + 30_000)).toBe('done')
    expect(await count('expenses', { source: 'import', import_id: review.importId })).toBe(6)
    const dinner = (await (await coll('expenses')).find({}).toArray()).find((e) => e.item === 'Dinner')
    expect(dinner).toMatchObject({ category: 'Food · Eating out', payment_method: 'credit_card', notes: 'with friends', date: '2026-09-05' })
    // The Credit Card envelope moved, as if the user had logged it.
    expect(await budget('2026-09', '__credit_card__')).toMatchObject({ assigned: '900' })
    // Last month's salary shows as that month's income; this month's is already in `assigned`.
    expect(await budget('2026-09', '__income__')).toMatchObject({ assigned: '0', extra: '85000' })
    expect(await budget('2026-10', '__income__')).toMatchObject({ assigned: '85000', extra: '0' })
    expect((await (await coll('incomes')).find({}).toArray()).map((i) => [i.date, i.counted])).toEqual([['2026-09-01', 'extra'], ['2026-10-01', 'monthly']])

    const doc = await (await coll('imports')).findOne({ _id: new ObjectId(review.importId) })
    expect(doc).toMatchObject({ status: 'done', done: 8, total: 8, failed: 0 })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]).toMatchObject([{ to: ['sam@example.com'], subject: 'Your history’s in' }, `import-done:${review.importId}`])
    expect((sendEmail.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain('All 8 spends and paydays from Money Manager are in Aviary.')
    expect(sendPush).toHaveBeenCalledTimes(1)
  })

  it('a retried commit returns the same import and writes nothing twice', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    const first = await commitImport(auth, review.importId, editsFrom(review))
    const counts = await Promise.all(['groups', 'categories', 'accounts', 'recurring_incomes', 'budgets'].map((c) => count(c)))
    expect(await commitImport(auth, review.importId, editsFrom(review))).toEqual(first)
    expect(await Promise.all(['groups', 'categories', 'accounts', 'recurring_incomes', 'budgets'].map((c) => count(c)))).toEqual(counts)
    expect(completeOnboarding).toHaveBeenCalledTimes(2)
  })

  it('refuses a second import once one is under way', async () => {
    const first = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, first.importId, editsFrom(first))
    const second = await previewFile(auth, fixture('monefy.csv'), 'monefy.csv')
    await expect(commitImport(auth, second.importId, editsFrom(second))).rejects.toMatchObject({ code: 'already_importing' })
  })

  it('without a confirmed salary every income row counts as extra', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review, { salary: null }))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    expect(await count('recurring_incomes', { status: 'active' })).toBe(0)
    expect(await budget('2026-10', '__income__')).toMatchObject({ assigned: '0', extra: '85000' })
  })

  it('rerunning from a rewound cursor doubles nothing and notifies once', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    await (await coll('imports')).updateOne({ _id: new ObjectId(review.importId) }, { $set: { status: 'importing', cursor: 0, done: 0 } })
    expect(await runImportPass(auth, review.importId, Date.now() + 30_000)).toBe('done')
    expect(await count('expenses')).toBe(6)
    expect(await count('incomes')).toBe(2)
    expect(await budget('2026-09', '__credit_card__')).toMatchObject({ assigned: '900' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('a pass gives way to one already holding the lease', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    await (await coll('imports')).updateOne({ _id: new ObjectId(review.importId) }, { $set: { lockedUntil: Date.now() + 60_000 } })
    expect(await runImportPass(auth, review.importId, Date.now() + 30_000)).toBe('leased')
    expect(await count('expenses')).toBe(0)
  })
})

describe('commit edge cases', () => {
  const csv = (lines: string[]) => Buffer.from(lines.join('\n'))

  it('a file with no spends still sets up and onboards, with one envelope to start from', async () => {
    const review = await previewFile(auth, csv(['Date,Item,Amount', '2026-09-01,Pay,100', '2026-10-01,Pay,100']), 'pay.csv')
    const result = await commitImport(auth, review.importId, editsFrom(review, { direction: 'negative_spend', salary: null }))
    expect(result.categoryCount).toBe(1)
    expect((await (await coll('categories')).find({}).toArray()).map((c) => c.name)).toEqual(['Uncategorised'])
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
  })

  it('a salary typed in without a detected pattern isn’t counted twice this month', async () => {
    const review = await previewFile(auth, csv([
      'Date,Item,Amount', '2026-08-01,Salary Aug,1000', '2026-09-01,Salary Sep,1000', '2026-10-01,Salary Oct,1000', '2026-10-02,Bread,-3',
    ]), 'x.csv')
    expect(review.salary).toBeNull()
    await commitImport(auth, review.importId, editsFrom(review, { salary: { amount: 1000, day: 1 } }))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    const october = await budget('2026-10', '__income__')
    expect(Number(october?.assigned) + Number(october?.extra)).toBe(1000)
    expect(await (await coll('recurring_incomes')).findOne({ status: 'active' })).toMatchObject({ start_date: '2026-11-01' })
  })

  it('won’t import into an account that finished setting up another way', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await (await getDb()).collection('users').updateOne({ _id: USER as never }, { $set: { onboardedAt: '2026-10-17T09:00:00.000Z' } })
    await expect(commitImport(auth, review.importId, editsFrom(review))).rejects.toMatchObject({ code: 'already_onboarded' })
    expect(await count('categories')).toBe(0)
  })

  it('two commits at once set up one account, not two', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    const results = await Promise.allSettled([commitImport(auth, review.importId, editsFrom(review)), commitImport(auth, review.importId, editsFrom(review))])
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'busy' })
    expect(await count('accounts')).toBe(3)
  })

  it('accounts renamed to the same name become one, and both keep their rows', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    const accounts = review.accounts.map((a) => (a.source === 'HDFC Credit Card' ? { ...a, name: 'HDFC Bank', type: 'bank' as const } : a))
    await commitImport(auth, review.importId, editsFrom(review, { accounts }))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    expect(await count('accounts')).toBe(2)
    const dinner = (await (await coll('expenses')).find({}).toArray()).find((e) => e.item === 'Dinner')
    expect(dinner?.account_id).toBeTruthy()
  })
})

describe('chaining passes', () => {
  it('queues the next pass while rows remain, and stops once done', async () => {
    vi.stubEnv('CRON_SECRET', 'chain-secret')
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
      await commitImport(auth, review.importId, editsFrom(review))
      // A deadline already past: the pass books nothing and hands on.
      await passAndChain(auth, review.importId, Date.now() - 1, 'https://app.example')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]).toMatchObject(['https://app.example/api/cron/import-pass', { method: 'POST', headers: { Authorization: 'Bearer chain-secret' } }])
      await passAndChain(auth, review.importId, Date.now() + 30_000, 'https://app.example')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      vi.stubEnv('CRON_SECRET', '')
    }
  })
})

describe('failing rows', () => {
  async function seedImport(rows: unknown[]) {
    const { insertedId } = await (await coll('imports')).insertOne({
      status: 'importing', app: 'generic', filename: 'x.csv', currency: 'INR', direction: 'negative_spend', directionSource: 'sign',
      hasCurrency: false, rows: JSON.stringify(rows), skipped: {}, droppedOverCap: 0, plan: '{}', total: rows.length, done: 0, failed: 0,
      cursor: 0, streak: 0, streak_start: 0, lockedUntil: 0, created_at: new Date(),
    })
    return String(insertedId)
  }
  const good = (i: number) => ({ kind: 'expense', date: '2026-09-01', amount: 5, item: `Row ${i}`, notes: '', category: 'Food' })
  // An empty category fails createExpense's validation, the way a bad row would.
  const bad = (i: number) => ({ ...good(i), category: '' })

  it('a chunk where every row throws doesn’t stop the import', async () => {
    const id = await seedImport([...Array.from({ length: 50 }, (_, i) => bad(i)), ...Array.from({ length: 10 }, (_, i) => good(i))])
    expect(await runImportPass(auth, id, Date.now() + 30_000)).toBe('done')
    expect(await count('expenses')).toBe(10)
    expect(await (await coll('imports')).findOne({ _id: new ObjectId(id) })).toMatchObject({ status: 'done', failed: 50, done: 60, streak: 0 })
    expect((sendEmail.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain('10 of your 60 spends and paydays from your file are in Aviary.')
  })

  it('three failing chunks in a row stop it, tell the user, and a retry starts where they began', async () => {
    const id = await seedImport([...Array.from({ length: 50 }, (_, i) => good(i)), ...Array.from({ length: 160 }, (_, i) => bad(i + 50))])
    expect(await runImportPass(auth, id, Date.now() + 30_000)).toBe('failed')
    const failed = await (await coll('imports')).findOne({ _id: new ObjectId(id) })
    // Stops after the third bad chunk, before the last ten rows.
    expect(failed).toMatchObject({ status: 'failed', streak: 3, streak_start: 50, cursor: 200, failed: 150 })
    expect(failed?.last_error).toBe('invalid category')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]).toMatchObject([{ subject: 'Your history didn’t all make it in' }, `import-failed:${id}`])

    expect(await retryImport(auth, id)).toBe(true)
    expect(await (await coll('imports')).findOne({ _id: new ObjectId(id) })).toMatchObject({ status: 'importing', cursor: 50, failed: 0, streak: 0 })
  })
})
