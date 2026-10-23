// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { MongoClient, type Db } from 'mongodb'
import type { MongoMemoryServer } from 'mongodb-memory-server'
import { startMongo } from '@/src/test-utils/mongo'

let db: Db
let server: MongoMemoryServer
let client: MongoClient
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => db }))
vi.mock('@/lib/billing/service', () => ({ refreshFromProvider: vi.fn(async () => ({})) }))

const { grantReward } = await import('./reward')
const { refreshFromProvider } = await import('@/lib/billing/service')

const fetchMock = vi.fn(async () => new Response('{}'))
const DAY = 86_400_000
beforeAll(async () => {
  server = await startMongo()
  client = await MongoClient.connect(server.getUri())
  db = client.db('reward_test')
}, 120_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => {
  await db.dropDatabase()
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('REVENUECAT_SECRET_KEY', 'sk_test')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const accounts = () => db.collection('billing_accounts')
const now = Date.now()
const addAccount = (o: Record<string, unknown> = {}) =>
  accounts().insertOne({ _id: 'u' as never, trialStartedAt: new Date(now - 10 * DAY), trialEndsAt: new Date(now + 20 * DAY), trialCohort: 'onboarding-v2', createdAt: new Date(now - 10 * DAY), ...o })
const playSub = () => db.collection('billing_subscriptions').insertOne({
  userId: 'u', provider: 'revenuecat', environment: 'production', store: 'play', productId: 'envelope_individual:monthly', basePlanId: 'monthly',
  storeTransactionId: 'GPA.1', status: 'active', autoRenew: true, expiresAt: new Date(now + 10 * DAY), verifiedAt: new Date(), providerRefs: {}, createdAt: new Date(), updatedAt: new Date(),
})

it('holds when setup never finished', async () => {
  expect(await grantReward('u', 1, 'referral')).toEqual({ kind: 'hold' })
  expect(await db.collection('admin_audit').countDocuments()).toBe(0)
})

it('extends a trial and leaves an audit row', async () => {
  await addAccount({ retentionDeadline: new Date() })
  const r = await grantReward('u', 1, 'referral:K7QM4P')
  expect(r.kind).toBe('extend_trial')
  const acc = await accounts().findOne({ _id: 'u' as never })
  expect(acc?.trialEndsAt.getTime()).toBeGreaterThan(now + 45 * DAY)
  expect(acc?.retentionDeadline).toBeNull()
  expect(await db.collection('admin_audit').findOne({ action: 'billing.reward' })).toMatchObject({ adminId: 'system:referral', targetUserId: 'u', detail: { kind: 'extend_trial', months: 1 } })
})

it('defers a renewing Play subscription through RevenueCat and re-reads it', async () => {
  await addAccount({ trialEndsAt: new Date(now - 40 * DAY) })
  await playSub()
  const r = await grantReward('u', 1, 'referral')
  expect(r.kind).toBe('play_defer')
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.revenuecat.com/v1/subscribers/u/subscriptions/envelope_individual/defer')
  expect(JSON.parse(String(init.body)).expiry_time_ms).toBe(r.kind === 'play_defer' ? r.until.getTime() : 0)
  expect(refreshFromProvider).toHaveBeenCalledWith('u')
  expect((await accounts().findOne({ _id: 'u' as never }))?.comp).toBeUndefined()
})

it('gifts the month after the paid period when Play refuses the deferral', async () => {
  await addAccount({ trialEndsAt: new Date(now - 40 * DAY) })
  await playSub()
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const r = await grantReward('u', 1, 'referral')
  expect(r.kind).toBe('comp')
  const comp = (await accounts().findOne({ _id: 'u' as never }))?.comp
  expect(comp.until.getTime()).toBeGreaterThan(now + 38 * DAY)
  expect(comp.grantedBy).toBe('system:referral')
})
