import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'

const controls = vi.hoisted(() => ({
  afterRead: null as null | (() => Promise<void>),
}))

vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: 'budget-concurrency-test', readOnly: false, sessionId: null, spaceId: 'budget-concurrency-test', spaceOwnerId: 'budget-concurrency-test', spaceRole: 'owner' as const }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ reconcileThresholdLevels: vi.fn() }))

// Use real scoped/encrypted collections and real Mongo transactions. The
// barrier only schedules the first two budget reads before either write;
// transaction retries pass straight through once the promise is released.
vi.mock('@/lib/http', async (original) => {
  const actual = await original<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: async (...args: Parameters<typeof actual.getCollection>) => {
      const coll = await actual.getCollection(...args)
      if (args[0] !== 'budgets') return coll
      return {
        ...coll,
        findOne: async (...params: Parameters<typeof coll.findOne>) => {
          const row = await coll.findOne(...params)
          await controls.afterRead?.()
          return row
        },
      }
    },
  }
})

import { getClient, getDb } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { adjustCreditCardEnvelope } from '@/lib/createExpense'
import { GET, PUT } from './route'
import { POST as transfer } from './transfer/route'
import { withTx } from '@/lib/mongodb'

let server: MongoMemoryReplSet

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('budget-concurrency'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  await (await getDb()).collection('budgets').createIndex(
    { user_id: 1, month: 1, category: 1 },
    { unique: true, partialFilterExpression: { deleted_at: null } },
  )
}, 120_000)

afterAll(async () => {
  if (server) {
    await (await getClient()).close()
    await server.stop()
  }
  vi.unstubAllEnvs()
})

beforeEach(async () => {
  controls.afterRead = null
  await (await getDb()).collection('budgets').deleteMany({})
})

function request(body: object) {
  return new Request('http://localhost/api/budgets', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function overlapReads() {
  let count = 0
  let release!: () => void
  const both = new Promise<void>((resolve) => { release = resolve })
  controls.afterRead = async () => {
    if (++count === 2) release()
    await both
  }
}

async function row(category = 'Food') {
  return scoped((await getDb()).collection('budgets'), 'budget-concurrency-test')
    .findOne({ month: '2026-09', category })
}

describe('budget concurrency on a real replica set', () => {
  it('exposes legacy rows as version 0, requires a version, and returns the latest row on conflict', async () => {
    await scoped((await getDb()).collection('budgets'), 'budget-concurrency-test').insertOne({
      month: '2026-09', category: 'Food', assigned: '100', rolled_over: '0',
    })

    const data = await (await GET(new Request('http://localhost/api/budgets'))).json()
    expect(data.rows[0]).toMatchObject({ category: 'Food', assigned: '100', version: 0 })
    expect((await PUT(request({ month: '2026-09', category: 'Food', assigned: '125' }))).status).toBe(428)
    expect((await PUT(request({ month: '2026-09', category: 'Food', assigned: '125', version: -1 }))).status).toBe(400)
    expect((await PUT(request({ month: '2026-09', category: 'Food', assigned: '125', version: 0.5 }))).status).toBe(400)
    expect((await PUT(request({ month: '2026-09', category: 'Food', assigned: '125', version: 0 }))).status).toBe(200)

    const stale = await PUT(request({ month: '2026-09', category: 'Food', assigned: '150', version: 0 }))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ current: { assigned: '125', version: 1 } })
    expect(await row()).toMatchObject({ assigned: '125', version: 1 })
  })

  it('allows only one of two overlapping edits', async () => {
    await scoped((await getDb()).collection('budgets'), 'budget-concurrency-test').insertOne({
      month: '2026-09', category: 'Food', assigned: '100', rolled_over: '0', version: 0,
    })
    overlapReads()

    const responses = await Promise.all([125, 150].map((assigned) =>
      PUT(request({ month: '2026-09', category: 'Food', assigned: String(assigned), version: 0 })),
    ))

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await row()).toMatchObject({ version: 1 })
  })

  it('allows only one first write when the envelope has no row yet', async () => {
    overlapReads()

    const responses = await Promise.all([125, 150].map((assigned) =>
      PUT(request({ month: '2026-09', category: 'Food', assigned: String(assigned), version: 0 })),
    ))

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await row()).toMatchObject({ version: 1 })
    expect(await (await getDb()).collection('budgets').countDocuments({
      user_id: 'budget-concurrency-test', month: '2026-09', category: 'Food', deleted_at: null,
    })).toBe(1)
  })

  it('rejects a draft made stale by an automatic credit-card assignment', async () => {
    await scoped((await getDb()).collection('budgets'), 'budget-concurrency-test').insertOne({
      month: '2026-09', category: '__credit_card__', assigned: '100', rolled_over: '0', version: 0,
    })

    await withTx((session) => adjustCreditCardEnvelope(
      { userId: 'budget-concurrency-test', readOnly: false, sessionId: null, spaceId: 'budget-concurrency-test', spaceOwnerId: 'budget-concurrency-test', spaceRole: 'owner' as const },
      '2026-09',
      50,
      session,
    ))

    const stale = await PUT(request({
      month: '2026-09', category: '__credit_card__', assigned: '125', version: 0,
    }))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ current: { assigned: '150', version: 1 } })
  })

  it('makes both sides of a transfer stale', async () => {
    const budgets = scoped((await getDb()).collection('budgets'), 'budget-concurrency-test')
    await budgets.insertMany([
      { month: '2026-09', category: 'Food', assigned: '100', rolled_over: '0', version: 0 },
      { month: '2026-09', category: 'Travel', assigned: '25', rolled_over: '0', version: 0 },
    ])

    const moved = await transfer(new Request('http://localhost/api/budgets/transfer', {
      method: 'POST',
      body: JSON.stringify({ month: '2026-09', from: 'Food', to: 'Travel', amount: 10 }),
    }))
    expect(moved.status).toBe(200)

    for (const category of ['Food', 'Travel']) {
      const stale = await PUT(request({ month: '2026-09', category, assigned: '999', version: 0 }))
      expect(stale.status).toBe(409)
      expect(await stale.json()).toMatchObject({ current: { category, version: 1 } })
    }
  })
})
