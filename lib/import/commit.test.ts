import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import path from 'node:path'

vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ notifyThresholdCrossed: vi.fn(), reconcileThresholdLevels: vi.fn() }))
vi.mock('@/lib/userCurrency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/userCurrency')>()),
  nowForUser: async () => ({ date: '2026-10-17', timestamp: '2026-10-17T10:00:00.000Z' }),
  getUserCurrency: async () => 'INR',
  getBudgetCurrency: async () => 'INR',
}))
const completeOnboarding = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/billing/service', () => ({ completeOnboarding: () => completeOnboarding() }))
const sendPush = vi.fn(async (_message: unknown) => 0)
vi.mock('@/lib/push', () => ({ sendPushNotification: (arg: unknown) => sendPush(arg) }))
const sendEmail = vi.fn(async (_message: unknown, _key: unknown) => 'email-id')
vi.mock('@/lib/email/resend', () => ({ sendEmail: (msg: unknown, key: unknown) => sendEmail(msg, key) }))
// AI off: every category lands in Essentials, which the review copy expects.
// Flipped on to kill a commit after its salary step, the way a timeout would.
const budgetWrite = vi.hoisted(() => ({ fail: false }))
vi.mock('@/lib/budgets', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/budgets')>()
  return { ...real, createBudgetRow: (...args: Parameters<typeof real.createBudgetRow>) => budgetWrite.fail ? Promise.reject(new Error('timed out')) : real.createBudgetRow(...args) }
})
vi.mock('@/lib/import/ai', () => ({ importAiAllowed: async () => false, pickCategoryGroups: vi.fn(), pickColumnRoles: vi.fn() }))

import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { previewFile, recomputePreview } from './service'
import { commitImport, parseEdits, type CommitEdits } from './commit'
import { chainPass, passAndChain, retryImport, runImportPass } from './backfill'
import { listImports, undoImport } from './undo'
import type { Review } from './service'

const USER = 'import-test'
const auth = { userId: USER, readOnly: false, sessionId: null, spaceId: USER, spaceOwnerId: USER, spaceRole: 'owner' as const }
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name))

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
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
  budgetWrite.fail = false
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

  it('brings in fifteen years whole: 50,000 rows the browser gzipped, oldest first', async () => {
    const lines = ['Date,Description,Amount,Account,Category,Subcategory,Notes']
    for (let i = 0; i < 50_000; i++) {
      const date = new Date(Date.UTC(2011, 9, 1) + Math.floor(i / 9.2) * 86_400_000).toISOString().slice(0, 10)
      lines.push(`${date},Swiggy dinner ${i},-1250.50,HDFC Credit Card,Food,Eating out,${i % 5 ? '' : 'with friends'}`)
    }
    const review = await previewFile(auth, gzipSync(lines.join('\n')), 'History.csv')
    expect(review.counts).toMatchObject({ expense: 50_000, from: '2011-10-01' })
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
    // The schedule pays into the account the salary always came into.
    const schedule = await (await coll('recurring_incomes')).findOne({ status: 'active' })
    expect((await (await coll('accounts')).find({}).toArray()).map((a) => String(a._id))).toContain(schedule?.account_id)
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

  it('a salary paid today is recorded once, not again by its new schedule', async () => {
    const review = await previewFile(auth, csv(['Date,Item,Amount', '2026-08-17,Acme,1000', '2026-09-17,Acme,1000', '2026-10-17,Acme,1000', '2026-10-02,Bread,-3']), 'x.csv')
    expect(review.salary).toMatchObject({ day: 17 })
    await commitImport(auth, review.importId, editsFrom(review))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    expect(await count('incomes', { date: '2026-10-17' })).toBe(1)
    expect(await (await coll('recurring_incomes')).findOne({ status: 'active' })).toMatchObject({ next_run_date: '2026-11-17' })
    const october = await budget('2026-10', '__income__')
    expect(Number(october?.assigned) + Number(october?.extra)).toBe(1000)
  })

  it('two YNAB categories renamed into one envelope keep both plan amounts', async () => {
    const tables = Buffer.concat([readFileSync(path.join(import.meta.dirname, 'fixtures', 'ynab-register.csv'))])
    const review = await previewFile(auth, tables, 'Register.csv')
    await (await coll('imports')).updateOne({ _id: new ObjectId(review.importId) }, { $set: { plan: JSON.stringify({ Rent: 1500, Groceries: 400 }) } })
    const categories = review.categories.map((c) => (c.source === 'Rent' || c.source === 'Groceries' ? { ...c, name: 'Home' } : c))
    await commitImport(auth, review.importId, editsFrom(review, { categories }))
    expect(await budget('2026-10', 'Home')).toMatchObject({ assigned: '1900' })
  })

  it('books a YNAB store refund back to its envelope, not as a payday', async () => {
    const review = await previewFile(auth, fixture('ynab-register.csv'), 'Register.csv')
    expect(review.counts).toMatchObject({ expense: 4, refund: 1, income: 2 })
    expect(review.categories.find((c) => c.source === 'Groceries')).toMatchObject({ monthly: 70 })
    await commitImport(auth, review.importId, editsFrom(review))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    const refund = (await (await coll('expenses')).find({}).toArray()).find((e) => e.item === 'Store refund')
    expect(refund).toMatchObject({ amount_inr: '-15', category: 'Groceries' })
    expect((await (await coll('incomes')).find({}).toArray()).map((i) => i.label)).not.toContain('Store refund')
  })

  it('a refund on a card takes its amount back off the Credit Card envelope', async () => {
    const review = await previewFile(auth, csv([
      'Date,Item,Category,Amount,Account', '2026-09-02,Myntra,Shopping,-100,Visa Card', '2026-09-05,Myntra return,Shopping,30,Visa Card',
    ]), 'x.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    expect(await budget('2026-09', '__credit_card__')).toMatchObject({ assigned: '70' })
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

  it('a payday of the 31st starting in a 30-day month still lands on the 31st after it', async () => {
    const review = await previewFile(auth, csv([
      'Date,Item,Amount', '2026-08-01,Salary Aug,1000', '2026-09-01,Salary Sep,1000', '2026-10-01,Salary Oct,1000', '2026-10-02,Bread,-3',
    ]), 'x.csv')
    await commitImport(auth, review.importId, editsFrom(review, { salary: { amount: 1000, day: 31 } }))
    // November has no 31st, so its payday is the 30th; December's is the 31st again.
    expect(await (await coll('recurring_incomes')).findOne({ status: 'active' })).toMatchObject({ next_run_date: '2026-11-30' })
    const { runRecurringIncomes } = await import('@/lib/income')
    await runRecurringIncomes(auth, '2026-11-30')
    expect(await (await coll('recurring_incomes')).findOne({ status: 'active' })).toMatchObject({ next_run_date: '2026-12-31' })
  })

  it('won’t import into an account that finished setting up another way', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await (await getDb()).collection('users').updateOne({ _id: USER as never }, { $set: { onboardedAt: '2026-10-17T09:00:00.000Z' } })
    await expect(commitImport(auth, review.importId, editsFrom(review))).rejects.toMatchObject({ code: 'already_onboarded' })
    expect(await count('categories')).toBe(0)
  })

  it('a second preview can’t be set up while another is mid-commit', async () => {
    const a = await previewFile(auth, fixture('money-manager.csv'), 'a.csv')
    // Two tabs: the second upload landed before the first purge could see it.
    const { insertedId } = await (await coll('imports')).insertOne({ ...(await (await coll('imports')).findOne({ _id: new ObjectId(a.importId) }))!, _id: new ObjectId(), claimedUntil: Date.now() + 60_000 })
    expect(insertedId).toBeTruthy()
    await expect(commitImport(auth, a.importId, editsFrom(a))).rejects.toMatchObject({ code: 'busy' })
  })

  it('a re-upload leaves a preview that’s mid-commit alone, so that commit still lands', async () => {
    const a = await previewFile(auth, fixture('money-manager.csv'), 'a.csv')
    await (await coll('imports')).updateOne({ _id: new ObjectId(a.importId) }, { $set: { claimedUntil: Date.now() + 60_000 } })
    await previewFile(auth, fixture('monefy.csv'), 'b.csv')
    expect(await count('imports', { _id: new ObjectId(a.importId) })).toBe(1)
  })

  it('a commit that died after the salary step, then a new file, still leaves one salary schedule', async () => {
    const a = await previewFile(auth, fixture('money-manager.csv'), 'a.csv')
    budgetWrite.fail = true
    await expect(commitImport(auth, a.importId, editsFrom(a))).rejects.toThrow('timed out')
    budgetWrite.fail = false
    const b = await previewFile(auth, fixture('money-manager.csv'), 'b.csv')
    await commitImport(auth, b.importId, editsFrom(b))
    expect(await count('recurring_incomes', { status: 'active' })).toBe(1)
  })

  it('a flip that loses the race with a commit says so rather than show a stale review', async () => {
    const review = await previewFile(auth, fixture('monefy.csv'), 'm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    await expect(recomputePreview(auth, review.importId, { direction: 'positive_spend' })).rejects.toMatchObject({ code: 'not_found' })
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
      vi.stubEnv('VERCEL_ENV', 'production')
      vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'app.example')
      await passAndChain(auth, review.importId, Date.now() - 1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]).toMatchObject(['https://app.example/api/cron/import-pass', { method: 'POST', headers: { Authorization: 'Bearer chain-secret' } }])
      await passAndChain(auth, review.importId, Date.now() + 30_000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      vi.stubEnv('CRON_SECRET', '')
      vi.stubEnv('VERCEL_ENV', '')
      vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    }
  })

  it('never sends the secret anywhere but a Vercel-set origin', async () => {
    vi.stubEnv('CRON_SECRET', 'chain-secret')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await chainPass(auth, '6710e6f0a1b2c3d4e5f60718')
      expect(fetchMock).not.toHaveBeenCalled()
      vi.stubEnv('VERCEL_URL', 'aviary-git-x.vercel.app')
      await chainPass(auth, '6710e6f0a1b2c3d4e5f60718')
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://aviary-git-x.vercel.app/api/cron/import-pass')
    } finally {
      vi.unstubAllGlobals()
      vi.stubEnv('CRON_SECRET', '')
      vi.stubEnv('VERCEL_URL', '')
    }
  })
})

describe('failing rows', () => {
  async function seedImport(rows: unknown[]) {
    const { insertedId } = await (await coll('imports')).insertOne({
      status: 'importing', app: 'generic', filename: 'x.csv', currency: 'INR', direction: 'negative_spend', directionSource: 'sign',
      hasCurrency: false, rows: JSON.stringify(rows), skipped: {}, plan: '{}', total: rows.length, done: 0, failed: 0,
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

describe('into a new budget', () => {
  const trip = { ...auth, spaceId: 'sp_trip' }
  beforeEach(async () => {
    const db = await getDb()
    await db.collection('users').updateOne({ _id: USER as never }, { $set: { onboardedAt: '2026-01-01T00:00:00.000Z' } })
    await db.collection('spaces').insertOne({ _id: 'sp_trip' as never, name: 'Trip', emoji: '✈️', owner_id: USER, currencyCode: 'USD', onboardedAt: null, deleted_at: null, created_at: '' })
  })

  it('a member can’t import into a shared budget that isn’t set up yet either', async () => {
    await expect(previewFile({ ...trip, spaceRole: 'member' as const }, fixture('money-manager.csv'), 'mm.csv')).rejects.toMatchObject({ code: 'not_owner' })
  })

  it("sets up that budget from the file, leaving the person's own account, currency and trial alone", async () => {
    const review = await previewFile(trip, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(trip, review.importId, editsFrom(review))
    const db = await getDb()
    expect(await scoped(db.collection('categories'), 'sp_trip').countDocuments({})).toBe(4)
    expect(await count('categories')).toBe(0)
    const space = await db.collection('spaces').findOne({ _id: 'sp_trip' as never })
    expect(space).toMatchObject({ currencyCode: 'INR', onboardedAt: expect.any(String) })
    expect((await db.collection('users').findOne({ _id: USER as never }))?.currencyCode).toBe('USD')
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('a budget that is already set up gets a later import, its currency left alone', async () => {
    await (await getDb()).collection('spaces').updateOne({ _id: 'sp_trip' as never }, { $set: { onboardedAt: '2026-10-01T00:00:00.000Z' } })
    const review = await previewFile(trip, fixture('money-manager.csv'), 'mm.csv')
    expect(review.later).toEqual({ cutoff: null, categories: [], icons: { categories: {}, groups: {} } })
    await commitImport(trip, review.importId, editsFrom(review))
    expect((await (await getDb()).collection('spaces').findOne({ _id: 'sp_trip' as never }))?.currencyCode).toBe('USD')
  })
})

describe('later import, from Settings', () => {
  beforeEach(async () => {
    await (await getDb()).collection('users').updateOne({ _id: USER as never }, { $set: { onboardedAt: '2026-09-10T00:00:00.000Z' } })
    await (await coll('groups')).insertOne({ name: 'Bills', order: 1 })
    await (await coll('categories')).insertOne({ name: 'Rent', group: 'Bills', order: 1, icon: 'House' })
    await (await coll('categories')).insertOne({ name: 'groceries', group: 'Bills', order: 2 })
    // The first thing logged in Aviary: the cutoff.
    await (await coll('expenses')).insertOne({ date: '2026-09-10', item: 'Coffee', amount_inr: '100', category: 'Rent', payment_method: 'bank', timestamp: '2026-09-10T08:00:00.000Z' })
  })

  it('reviews only the rows from before the first entry, with the setup left out', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    expect(review.later).toEqual({ cutoff: '2026-09-10', categories: ['Rent', 'groceries'], icons: { categories: { Rent: 'House' }, groups: {} } })
    expect(review.counts).toMatchObject({ expense: 2, income: 1, from: '2026-09-01', to: '2026-09-05' })
    expect(review.skipped).toMatchObject({ after_start: 5 })
    expect(review.salary).toBeNull()
    expect(review.groups).toEqual(['Bills'])
    expect(review.categories.map((c) => [c.source, c.name, c.monthly])).toEqual([['Food · Groceries', 'Food · Groceries', 0], ['Food · Eating out', 'Food · Eating out', 0]])
  })

  it('maps onto existing envelopes by name, books only the older rows, and touches no setup', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    const result = await commitImport(auth, review.importId, editsFrom(review, { salary: { amount: 85000, day: 1 } }))
    expect(result).toMatchObject({ total: 3, categoryCount: 1, income: 0 })
    expect(completeOnboarding).not.toHaveBeenCalled()
    expect((await (await getDb()).collection('users').findOne({ _id: USER as never }))?.currencyCode).toBe('USD')
    expect(await count('recurring_incomes')).toBe(0)
    expect(await budget('2026-10', 'Rent')).toBeNull()
    // "Groceries" found the existing "groceries"; "Eating out" was new, in the first group.
    expect((await (await coll('categories')).find({}).sort({ order: 1 }).toArray()).map((c) => [c.name, c.group])).toEqual([
      ['Rent', 'Bills'], ['groceries', 'Bills'], ['Food · Eating out', 'Bills'],
    ])

    expect(await runImportPass(auth, review.importId, Date.now() + 30_000)).toBe('done')
    const booked = await (await coll('expenses')).find({ import_id: review.importId }).sort({ date: 1 }).toArray()
    expect(booked.map((e) => [e.date, e.category])).toEqual([['2026-09-02', 'groceries'], ['2026-09-05', 'Food · Eating out']])
    expect(await count('incomes', { import_id: review.importId, counted: 'extra' })).toBe(1)
    expect(await (await coll('imports')).findOne({ _id: new ObjectId(review.importId) })).toMatchObject({ status: 'done', skipped: { after_start: 5 } })
  })

  it('records a payday a monthly schedule already counts, instead of adding it to Ready to Assign again (#230)', async () => {
    await (await coll('recurring_incomes')).insertOne({ label: 'Salary', amount: '85000', frequency: 'monthly', start_date: '2026-09-01', end_date: '', status: 'active' })
    await (await coll('budgets')).insertOne({ month: '2026-08', category: '__income__', assigned: '85000', extra: '0' })
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    expect(await runImportPass(auth, review.importId, Date.now() + 30_000)).toBe('done')
    expect((await (await coll('incomes')).find({ import_id: review.importId }).toArray()).map((i) => [i.date, i.counted])).toEqual([['2026-09-01', 'monthly']])
    expect(Number((await budget('2026-09', '__income__'))?.extra ?? 0)).toBe(0)
  })

  it('still adds pay in a month a backdated schedule never actually counted', async () => {
    await (await coll('recurring_incomes')).insertOne({ label: 'Salary', amount: '85000', frequency: 'monthly', start_date: '2026-06-01', end_date: '', status: 'active' })
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    expect(await runImportPass(auth, review.importId, Date.now() + 30_000)).toBe('done')
    expect(await budget('2026-09', '__income__')).toMatchObject({ extra: '85000' })
  })

  it('undo archives only that import’s rows and backs out what they moved', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    expect(await budget('2026-09', '__credit_card__')).toMatchObject({ assigned: '900' })
    expect(await budget('2026-09', '__income__')).toMatchObject({ extra: '85000' })
    expect((await listImports(auth)).map((i) => [i.importId, i.status, i.total])).toEqual([[review.importId, 'done', 3]])

    await undoImport(auth, review.importId)
    expect(await count('expenses', { import_id: review.importId })).toBe(0)
    expect(await count('incomes', { import_id: review.importId })).toBe(0)
    // Archived, not gone: restorable like any other delete.
    expect(await (await getDb()).collection('expenses').countDocuments({ import_id: review.importId, deleted_at: { $ne: null } })).toBe(2)
    expect((await (await coll('expenses')).find({}).toArray()).map((e) => e.item)).toEqual(['Coffee'])
    expect(await budget('2026-09', '__credit_card__')).toMatchObject({ assigned: '0' })
    expect(await budget('2026-09', '__income__')).toMatchObject({ extra: '0' })
    expect(await listImports(auth)).toEqual([])
    // A second tap changes nothing.
    await undoImport(auth, review.importId)
  })

  it('won’t undo an import that’s still booking', async () => {
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, review.importId, editsFrom(review))
    await expect(undoImport(auth, review.importId)).rejects.toMatchObject({ code: 'already_importing' })
  })

  it('a second later import waits for the first to finish, then goes ahead', async () => {
    const first = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await commitImport(auth, first.importId, editsFrom(first))
    const second = await previewFile(auth, fixture('monefy.csv'), 'monefy.csv')
    await expect(commitImport(auth, second.importId, editsFrom(second))).rejects.toMatchObject({ code: 'already_importing' })
    await runImportPass(auth, first.importId, Date.now() + 30_000)
    await expect(commitImport(auth, second.importId, editsFrom(second))).resolves.toMatchObject({ importId: second.importId })
  })

  it('refuses a file that reads as another currency when it has no currency column to skip rows by', async () => {
    const csv = Buffer.from('Date,Description,Amount\n2026-09-01,Coffee,-€4.50\n2026-09-02,Lunch,-€12.00\n')
    await expect(previewFile(auth, csv, 'euro.csv')).rejects.toMatchObject({ code: 'wrong_currency' })
  })

  it('only the owner of a shared budget can import into it or undo', async () => {
    const member = { ...auth, spaceRole: 'member' as const }
    await expect(previewFile(member, fixture('money-manager.csv'), 'mm.csv')).rejects.toMatchObject({ code: 'not_owner' })
    const review = await previewFile(auth, fixture('money-manager.csv'), 'mm.csv')
    await expect(commitImport(member, review.importId, editsFrom(review))).rejects.toMatchObject({ code: 'not_owner' })
    await commitImport(auth, review.importId, editsFrom(review))
    await runImportPass(auth, review.importId, Date.now() + 30_000)
    await expect(undoImport(member, review.importId)).rejects.toMatchObject({ code: 'not_owner' })
  })
})
