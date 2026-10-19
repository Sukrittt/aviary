import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'

const controls = vi.hoisted(() => ({
  afterRead: null as null | (() => Promise<void>),
}))

vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: 'holding-concurrency-test', readOnly: false, sessionId: null, spaceId: 'holding-concurrency-test', spaceOwnerId: 'holding-concurrency-test', spaceRole: 'owner' as const }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))

// Use real scoped/encrypted collections and real Mongo transactions. The
// barrier schedules the first two holding reads before either transaction can
// write; transaction retries pass through after the barrier is released.
vi.mock('@/lib/http', async (original) => {
  const actual = await original<typeof import('@/lib/http')>()
  return {
    ...actual,
    getCollection: async (...args: Parameters<typeof actual.getCollection>) => {
      const coll = await actual.getCollection(...args)
      if (args[0] !== 'holdings') return coll
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
import { applyHoldingAction } from '@/lib/holdings'
import { GET, PUT } from './route'

let server: MongoMemoryReplSet

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('holding-concurrency'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  await (await getDb()).collection('holdings').createIndex(
    { user_id: 1, name: 1 },
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
  const db = await getDb()
  await db.collection('holdings').deleteMany({})
  await db.collection('holding_events').deleteMany({})
})

function request(body: object) {
  return new Request('http://localhost/api/holdings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function overlapReads() {
  let count = 0
  let release!: () => void
  const both = new Promise<void>((resolve) => { release = resolve })
  controls.afterRead = async () => {
    if (count >= 2) return
    count += 1
    if (count === 2) release()
    await both
  }
}

async function seed(overrides: Record<string, unknown> = {}) {
  await scoped((await getDb()).collection('holdings'), 'holding-concurrency-test').insertOne({
    name: 'Stocks',
    type: 'Equity',
    value: '1000',
    updated_at: '2026-09-01T00:00:00.000Z',
    is_recurring: 'true',
    recurring_amount: '100',
    recurring_day: '1',
    recurring_last_run: '2026-09',
    ...overrides,
  })
}

async function row(name = 'Stocks') {
  return scoped((await getDb()).collection('holdings'), 'holding-concurrency-test').findOne({ name })
}

describe('holding concurrency on a real replica set', () => {
  it('exposes legacy rows as version 0, requires a version, and returns the latest row on conflict', async () => {
    await seed()

    const data = await (await GET(new Request('http://localhost/api/holdings'))).json()
    expect(data.rows[0]).toMatchObject({ name: 'Stocks', value: '1000', version: 0 })
    expect((await PUT(request({ name: 'Stocks', type: 'Fund' }))).status).toBe(428)
    expect((await PUT(request({ name: 'Stocks', type: 'Fund', version: -1 }))).status).toBe(400)
    expect((await PUT(request({ name: 'Stocks', type: 'Fund', version: 0.5 }))).status).toBe(400)
    expect((await PUT(request({ name: 'Stocks', type: 'Fund', version: 0 }))).status).toBe(200)

    const stale = await PUT(request({ name: 'Stocks', type: 'Bonds', version: 0 }))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ current: { name: 'Stocks', type: 'Fund', version: 1 } })
    expect(await row()).toMatchObject({ type: 'Fund', version: 1 })
  })

  it('allows only one of two overlapping edits', async () => {
    await seed({ version: 0 })
    overlapReads()

    const responses = await Promise.all(['Fund', 'Bonds'].map((type) =>
      PUT(request({ name: 'Stocks', type, version: 0 })),
    ))

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await row()).toMatchObject({ version: 1 })
  })

  it('rejects a draft made stale by a holding action', async () => {
    await seed({ version: 0 })

    const action = await applyHoldingAction(
      { userId: 'holding-concurrency-test', readOnly: false, sessionId: null, spaceId: 'holding-concurrency-test', spaceOwnerId: 'holding-concurrency-test', spaceRole: 'owner' as const },
      { name: 'Stocks', action: 'contribution', amount: 250 },
    )
    expect(action).toMatchObject({ ok: true, previousValue: 1000, newValue: 1250 })

    const stale = await PUT(request({ name: 'Stocks', is_recurring: true, recurring_amount: '150', version: 0 }))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ current: { value: '1250', version: 1 } })
    expect(await row()).toMatchObject({ value: '1250', recurring_amount: '100', version: 1 })
  })

  it('turns a rename racing an edit into a conflict rather than an ambiguous 404', async () => {
    await seed({ version: 0 })
    overlapReads()

    const responses = await Promise.all([
      PUT(request({ name: 'Stocks', new_name: 'Retirement', version: 0 })),
      PUT(request({ name: 'Stocks', type: 'Bonds', version: 0 })),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(responses.some((response) => response.status === 404)).toBe(false)
    const live = await scoped((await getDb()).collection('holdings'), 'holding-concurrency-test').find({}).toArray()
    expect(live).toHaveLength(1)
    expect(live[0].version).toBe(1)
  })
})
