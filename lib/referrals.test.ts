// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import type { MongoMemoryServer } from 'mongodb-memory-server'
import { startMongo } from '@/src/test-utils/mongo'

let db: Db
let server: MongoMemoryServer
let client: MongoClient
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => db }))
vi.mock('@/lib/posthogServer', () => ({ captureServer: vi.fn(async () => true), captureLater: vi.fn() }))
const grantReward = vi.fn(async (_u: string, _m: number, _r: string) => ({ kind: 'extend_trial' as const, until: new Date('2027-01-01') }))
vi.mock('@/lib/billing/reward', () => ({ grantReward: (u: string, m: number, r: string) => grantReward(u, m, r) }))

const R = await import('./referrals')
const { captureServer } = await import('@/lib/posthogServer')

const DAY = 86_400_000
const NOW = new Date('2026-10-24T12:00:00.000Z')

beforeAll(async () => {
  server = await startMongo()
  client = await MongoClient.connect(server.getUri())
  db = client.db('referrals_test')
}, 120_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => {
  await db.dropDatabase()
  await db.collection('referral_codes').createIndex({ ownerId: 1 }, { unique: true, partialFilterExpression: { ownerId: { $type: 'string' } } })
  vi.clearAllMocks()
})

const addUser = (id: string, o: Record<string, unknown> = {}) =>
  db.collection('users').insertOne({ _id: id as never, email: `${id}@example.com`, emailVerified: true, createdAt: new Date(NOW.getTime() - DAY), onboardedAt: null, ...o })
const onboard = (id: string) => db.collection('users').updateOne({ _id: id as never }, { $set: { onboardedAt: NOW.toISOString() } })
/** An expense logged by `id`, written at `at` (server time lives in the ObjectId). */
const logAt = (id: string, at: Date, o: Record<string, unknown> = {}) =>
  db.collection('expenses').insertOne({ _id: ObjectId.createFromTime(Math.floor(at.getTime() / 1000)), user_id: id, created_by: id, deleted_at: null, source: 'manual', ...o })
const referral = (id: string) => db.collection('referrals').findOne({ _id: id as never })

async function codeFor(owner: string) {
  await addUser(owner)
  return R.userCode(owner)
}

describe('codes', () => {
  it('gives each user one stable six-character code with no look-alike characters', async () => {
    const code = await codeFor('alice')
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
    expect(await R.userCode('alice')).toBe(code)
  })

  it('normalises what people type', () => {
    expect(R.normalizeCode(' k7qm4p ')).toBe('K7QM4P')
    expect(R.normalizeCode('no spaces')).toBeNull()
    expect(R.normalizeCode(42)).toBeNull()
  })

  it('treats Gmail dots and +tags as the same inbox', () => {
    expect(R.canonicalEmail('A.Lice+aviary@GoogleMail.com')).toBe('alice@gmail.com')
    expect(R.canonicalEmail('a.lice+x@work.in')).toBe('a.lice@work.in')
  })
})

describe('applyReferral', () => {
  it('ties a new account to the code and its owner', async () => {
    const code = await codeFor('alice')
    await addUser('bob')
    expect(await R.applyReferral('bob', code.toLowerCase(), 'link', NOW)).toBe('applied')
    expect(await referral('bob')).toMatchObject({ code, referrerId: 'alice', status: 'pending', via: 'link', kind: 'user' })
    expect(captureServer).toHaveBeenCalledWith('bob', 'referral_code_applied', expect.objectContaining({ code, via: 'link' }))
  })

  it('refuses unknown, inactive and own codes, and a second code', async () => {
    const code = await codeFor('alice')
    await addUser('bob')
    expect(await R.applyReferral('bob', 'ZZZZZZ', 'link', NOW)).toBe('not_found')
    expect(await R.applyReferral('alice', code, 'link', NOW)).toBe('own_code')
    await db.collection('referral_codes').insertOne({ _id: 'PAUSED' as never, kind: 'creator', ownerId: null, active: false })
    expect(await R.applyReferral('bob', 'PAUSED', 'link', NOW)).toBe('inactive')
    expect(await R.applyReferral('bob', code, 'link', NOW)).toBe('applied')
    await codeFor('carol')
    expect(await R.applyReferral('bob', await R.userCode('carol'), 'link', NOW)).toBe('already_referred')
  })


  it.each([
    ['self', { email: 'a.lice+2@gmail.com' }, { email: 'alice@gmail.com' }],
    ['unverified', { emailVerified: false }, {}],
    ['disposable', { email: 'bob@mailinator.com' }, {}],
  ])('records a %s referral as blocked, never pending', async (reason, bob, alice) => {
    await addUser('alice', alice)
    const code = await R.userCode('alice')
    await addUser('bob', bob)
    expect(await R.applyReferral('bob', code, 'link', NOW)).toBe('blocked')
    expect(await referral('bob')).toMatchObject({ status: 'blocked', reason })
  })
})

describe('maybeActivate', () => {
  async function pending() {
    const code = await codeFor('alice')
    await addUser('bob', { createdAt: new Date(NOW.getTime() - 5 * DAY) })
    await R.applyReferral('bob', code, 'link', NOW)
    await onboard('bob')
    return code
  }

  it('waits for expenses on three different days', async () => {
    await pending()
    await logAt('bob', new Date(NOW.getTime() - 3 * DAY))
    await logAt('bob', new Date(NOW.getTime() - 3 * DAY + 60_000))
    await logAt('bob', new Date(NOW.getTime() - 2 * DAY), { source: 'import' })
    await logAt('bob', new Date(NOW.getTime() - 2 * DAY + 5000), { source: 'recurring' })
    await logAt('bob', new Date(NOW.getTime() - 1 * DAY), { deleted_at: new Date() })
    expect(await R.maybeActivate('bob', NOW)).toBe(false)
    expect(grantReward).not.toHaveBeenCalled()
  })

  it('ignores rows written for them: statements, balance gaps and fresh starts', async () => {
    await pending()
    await logAt('bob', new Date(NOW.getTime() - 3 * DAY), { source: 'statement' })
    await logAt('bob', new Date(NOW.getTime() - 2 * DAY), { source: 'balance_gap' })
    await logAt('bob', new Date(NOW.getTime() - 1 * DAY), { source: 'fresh_start' })
    expect(await R.maybeActivate('bob', NOW)).toBe(false)
  })

  it('does not count days before setup is finished', async () => {
    const code = await codeFor('alice')
    await addUser('bob', { createdAt: new Date(NOW.getTime() - 5 * DAY) })
    await R.applyReferral('bob', code, 'link', NOW)
    for (const d of [3, 2, 1]) await logAt('bob', new Date(NOW.getTime() - d * DAY))
    expect(await R.maybeActivate('bob', NOW)).toBe(false)
  })

  it('rewards both sides once on the third day, however often it runs', async () => {
    const code = await pending()
    for (const d of [3, 2, 1]) await logAt('bob', new Date(NOW.getTime() - d * DAY))
    const [a, b] = await Promise.all([R.maybeActivate('bob', NOW), R.maybeActivate('bob', NOW)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(grantReward).toHaveBeenCalledTimes(2)
    expect(grantReward).toHaveBeenCalledWith('bob', 1, `referral:${code}`)
    expect(grantReward).toHaveBeenCalledWith('alice', 1, `referral:${code}`)
    expect(await referral('bob')).toMatchObject({ status: 'activated', referee: { kind: 'extend_trial' }, referrer: { kind: 'extend_trial' } })
    expect(captureServer).toHaveBeenCalledWith('bob', 'referral_activated', expect.anything())
    expect(captureServer).toHaveBeenCalledWith('alice', 'referral_rewarded', expect.objectContaining({ side: 'referrer' }))
  })


  it('caps a referrer at three months a month but still rewards the friend', async () => {
    const code = await codeFor('alice')
    for (const n of [1, 2, 3]) {
      await db.collection('referrals').insertOne({ _id: `old${n}` as never, code, kind: 'user', referrerId: 'alice', status: 'activated', referrer: { kind: 'extend_trial', at: new Date(NOW.getTime() - n * 3600_000) } })
    }
    await addUser('bob', { createdAt: new Date(NOW.getTime() - 5 * DAY) })
    await R.applyReferral('bob', code, 'link', NOW)
    await onboard('bob')
    for (const d of [3, 2, 1]) await logAt('bob', new Date(NOW.getTime() - d * DAY))
    await R.maybeActivate('bob', NOW)
    expect(grantReward).toHaveBeenCalledTimes(1)
    expect(grantReward).toHaveBeenCalledWith('bob', 1, expect.any(String))
    expect((await referral('bob'))?.referrer).toMatchObject({ kind: 'capped' })
  })

  it('gives a creator code\'s months to the new user only', async () => {
    await db.collection('referral_codes').insertOne({ _id: 'PRIYA' as never, kind: 'creator', ownerId: null, label: 'Priya', refereeMonths: 2, referrerMonths: 0, offer: null, active: true, createdAt: NOW })
    await addUser('bob', { createdAt: new Date(NOW.getTime() - 5 * DAY) })
    expect(await R.applyReferral('bob', 'priya', 'install', NOW)).toBe('applied')
    await onboard('bob')
    for (const d of [3, 2, 1]) await logAt('bob', new Date(NOW.getTime() - d * DAY))
    await R.maybeActivate('bob', NOW)
    expect(grantReward).toHaveBeenCalledTimes(1)
    expect(grantReward).toHaveBeenCalledWith('bob', 2, 'referral:PRIYA')
  })

  it('lets a referral lapse after 30 days', async () => {
    const code = await codeFor('alice')
    await addUser('bob', { createdAt: new Date(NOW.getTime() - 31 * DAY), onboardedAt: NOW.toISOString() })
    await db.collection('referrals').insertOne({ _id: 'bob' as never, code, kind: 'user', referrerId: 'alice', status: 'pending', via: 'link', appliedAt: NOW })
    expect(await R.maybeActivate('bob', NOW)).toBe(false)
    expect((await referral('bob'))?.status).toBe('expired')
  })
})

describe('held rewards and the summary', () => {
  it('grants a referrer\'s held month once they finish setup', async () => {
    const code = await codeFor('alice')
    await db.collection('referrals').insertOne({ _id: 'bob' as never, code, kind: 'user', referrerId: 'alice', status: 'activated', referrer: { kind: 'hold', at: NOW } })
    expect(await R.grantHeld('alice', NOW)).toBe(1)
    expect(grantReward).toHaveBeenCalledWith('alice', 1, `referral:${code}`)
    expect((await referral('bob'))?.referrer).toMatchObject({ kind: 'extend_trial' })
  })

  it('sums up what the referrer sees', async () => {
    const code = await codeFor('alice')
    await db.collection('referrals').insertMany([
      { _id: 'b1' as never, code, referrerId: 'alice', status: 'activated', referrer: { kind: 'comp', at: NOW } },
      { _id: 'b2' as never, code, referrerId: 'alice', status: 'pending' },
      { _id: 'b3' as never, code, referrerId: 'alice', status: 'blocked' },
    ])
    expect(await R.referralSummary('alice', 'https://www.useaviary.com')).toEqual({
      code, link: `https://www.useaviary.com/r/${code}`, joined: 2, activated: 1, monthsEarned: 1, referredBy: null,
    })
  })
})
