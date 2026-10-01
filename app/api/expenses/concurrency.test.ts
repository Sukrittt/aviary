import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'

const controls = vi.hoisted(() => ({
  afterRead: null as null | (() => Promise<void>),
  missWrite: false,
}))
vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: 'concurrency-test', readOnly: false, sessionId: null }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
// The expenses route imports lib/users, which drags in the server-only WorkOS client.
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ notifyThresholdCrossed: vi.fn() }))
// Real scoped/encrypted collections and real Mongo transactions. The barrier
// only schedules both reads before either write; retries pass straight through.
vi.mock('@/lib/http', async (original) => {
  const actual = await original<typeof import('@/lib/http')>()
  return { ...actual, getCollection: async (...args: Parameters<typeof actual.getCollection>) => {
    const coll = await actual.getCollection(...args)
    if (args[0] !== 'expenses') return coll
    return { ...coll,
      findOne: async (...params: Parameters<typeof coll.findOne>) => {
        const row = await coll.findOne(...params)
        await controls.afterRead?.()
        return row
      },
      updateOne: (...params: Parameters<typeof coll.updateOne>) => controls.missWrite
        ? Promise.resolve({ matchedCount: 0 }) : coll.updateOne(...params),
      deleteOne: (...params: Parameters<typeof coll.deleteOne>) => controls.missWrite
        ? Promise.resolve({ deletedCount: 0 }) : coll.deleteOne(...params),
    }
  } }
})
import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { GET, POST, PUT, DELETE } from './route'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('concurrency'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  const db = await getDb()
  await db.collection('budgets').createIndex({ user_id: 1, month: 1, category: 1 }, { unique: true, partialFilterExpression: { deleted_at: null } })
  await db.collection('expenses').createIndex({ user_id: 1, client_id: 1 }, { unique: true, partialFilterExpression: { client_id: { $type: 'string' } } })
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  controls.afterRead = null
  controls.missWrite = false
  const db = await getDb()
  await db.collection('expenses').deleteMany({})
  await db.collection('budgets').deleteMany({})
})
function request(method: string, body: object) {
  return new Request('http://localhost/api/expenses', { method, body: JSON.stringify(body) })
}
async function seed() {
  const response = await POST(request('POST', { item: 'Lunch', amount_inr: '100', category: 'Food', date: '2026-09-18', payment_method: 'credit_card' }))
  const { id } = await response.json()
  return id as string
}
async function state(id: string) {
  const db = await getDb()
  const expense = await scoped(db.collection('expenses'), 'concurrency-test').findOne({ _id: new ObjectId(id) })
  const budget = await scoped(db.collection('budgets'), 'concurrency-test').findOne({ month: '2026-09', category: '__credit_card__' })
  return { expense, assigned: Number(budget?.assigned) }
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

describe('expense concurrency on a real replica set', () => {
  it('returns versions and rejects stale edits without changing money', async () => {
    const id = await seed()
    const data = await (await GET(new Request('http://localhost/api/expenses'))).json()
    expect(data.rows[0].version).toBe(0)
    expect((await PUT(request('PUT', { id, version: 0, new_amount_inr: '150' }))).status).toBe(200)
    const stale = await PUT(request('PUT', { id, version: 0, category: 'Travel' }))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ current: { version: 1, amount_inr: '150' } })
    expect(await state(id)).toMatchObject({ expense: { version: 1, category: 'Food' }, assigned: 150 })
  })
  it('rejects versionless writes, including legacy timestamp requests', async () => {
    const id = await seed()
    expect((await PUT(request('PUT', { id, category: 'Travel' }))).status).toBe(428)
    expect((await DELETE(request('DELETE', { id }))).status).toBe(428)
    expect((await PUT(request('PUT', { timestamp: 'old', item: 'Lunch', amount_inr: '100', category: 'Travel' }))).status).toBe(428)
    expect((await state(id)).assigned).toBe(100)
  })
  it('a create replay cannot authorize Undo of a later edit the user has not seen', async () => {
    const payload = { item: 'Lunch', amount_inr: '100', category: 'Food', date: '2026-09-18', payment_method: 'credit_card', client_id: 'lost-response' }
    const created = await (await POST(request('POST', payload))).json()
    await PUT(request('PUT', { id: created.id, version: 0, new_amount_inr: '150' }))
    const replay = await (await POST(request('POST', payload))).json()
    const undo = await DELETE(request('DELETE', { id: replay.id, version: replay.version }))
    expect(undo.status).toBe(409)
    expect(await state(created.id)).toMatchObject({ expense: { amount_inr: '150' }, assigned: 150 })
  })
  it('rejects a stale delete after an edit, and returns the latest version for review', async () => {
    const id = await seed()
    await PUT(request('PUT', { id, version: 0, new_amount_inr: '150' }))
    const remove = await DELETE(request('DELETE', { id, version: 0 }))
    expect(remove.status).toBe(409)
    expect(await remove.json()).toMatchObject({ current: { version: 1, amount_inr: '150' } })
    expect(await state(id)).toMatchObject({ expense: { amount_inr: '150' }, assigned: 150 })
  })
  it('increments versions when a category rename changes expenses', async () => {
    const id = await seed()
    const db = await getDb()
    await db.collection('categories').deleteMany({})
    await db.collection('categories').insertOne({ user_id: 'concurrency-test', deleted_at: null, name: 'Food' })
    const { PUT: rename } = await import('../categories/route')
    expect((await rename(request('PUT', { name: 'Food', newName: 'Dining' }))).status).toBe(200)
    const stale = await PUT(request('PUT', { id, version: 0, category: 'Travel' }))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ current: { version: 1, category: 'Dining' } })
  })
  it('does not revive stale versions after delete and restore', async () => {
    const id = await seed()
    await DELETE(request('DELETE', { id, version: 0 }))
    const db = await getDb()
    await scoped(db.collection('expenses'), 'concurrency-test').restore({ _id: new ObjectId(id) })
    expect((await PUT(request('PUT', { id, version: 0, category: 'Travel' }))).status).toBe(409)
  })
  it('supports existing rows with no stored version', async () => {
    const id = await seed()
    await (await getDb()).collection('expenses').updateOne({ _id: new ObjectId(id) }, { $unset: { version: '' } })
    expect((await PUT(request('PUT', { id, version: 0, new_amount_inr: '125' }))).status).toBe(200)
    expect(await state(id)).toMatchObject({ expense: { version: 1 }, assigned: 125 })
  })
  it('allows only one of two overlapping edits and computes the winning balance', async () => {
    const id = await seed()
    overlapReads()
    const responses = await Promise.all([150, 200].map((amount) => PUT(request('PUT', { id, version: 0, new_amount_inr: String(amount) }))))
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const result = await state(id)
    expect(result.assigned).toBe(Number(result.expense?.amount_inr))
    expect(result.expense?.version).toBe(1)
  })
  it('reverses an overlapping double delete only once', async () => {
    const id = await seed()
    // Another expense makes a double deduction visible rather than floored to zero.
    await POST(request('POST', { item: 'Other', amount_inr: '500', category: 'Food', date: '2026-09-18', payment_method: 'credit_card' }))
    overlapReads()
    const responses = await Promise.all([DELETE(request('DELETE', { id, version: 0 })), DELETE(request('DELETE', { id, version: 0 }))])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 404])
    expect(await state(id)).toMatchObject({ expense: null, assigned: 500 })
  })
  it('keeps edit/delete races consistent regardless of the winner', async () => {
    const id = await seed()
    overlapReads()
    const [edit, remove] = await Promise.all([PUT(request('PUT', { id, version: 0, new_amount_inr: '200' })), DELETE(request('DELETE', { id, version: 0 }))])
    const result = await state(id)
    if (edit.status === 200) {
      expect(remove.status).toBe(409)
      expect(result).toMatchObject({ expense: { version: 1, amount_inr: '200' }, assigned: 200 })
    } else {
      expect(edit.status).toBe(404)
      expect(remove.status).toBe(200)
      expect(result).toMatchObject({ expense: null, assigned: 0 })
    }
  })
  it.each(['PUT', 'DELETE'])('aborts %s without envelope effects when the conditional write misses', async (method) => {
    const id = await seed()
    controls.missWrite = true
    const response = await (method === 'PUT' ? PUT : DELETE)(request(method, { id, version: 0, new_amount_inr: '200' }))
    expect(response.status).toBe(409)
    expect(await state(id)).toMatchObject({ expense: { amount_inr: '100' }, assigned: 100 })
  })
})
