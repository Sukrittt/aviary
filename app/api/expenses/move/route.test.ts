import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { ObjectId } from 'mongodb'
import { randomBytes } from 'node:crypto'

const ME = 'user_a'
vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: ME, readOnly: false, sessionId: null, spaceId: ME, spaceOwnerId: ME, spaceRole: 'owner' as const }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({ notifyThresholdCrossed: vi.fn() }))
const { moveExpensePhoto } = vi.hoisted(() => ({ moveExpensePhoto: vi.fn(async (..._args: unknown[]) => {}) }))
vi.mock('@/lib/expensePhoto', () => ({ moveExpensePhoto }))

import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { forgetMembership } from '@/lib/spaces'
import { POST } from './route'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
  vi.stubEnv('MONGODB_URI', server.getUri('move'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  const db = await getDb()
  await db.collection('budgets').createIndex({ user_id: 1, month: 1, category: 1 }, { unique: true, partialFilterExpression: { deleted_at: null } })
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})

const coll = async (name: string, space: string) => scoped((await getDb()).collection(name), space)
let id: string

beforeEach(async () => {
  const db = await getDb()
  for (const name of ['expenses', 'budgets', 'categories', 'spaces', 'space_members']) await db.collection(name).deleteMany({})
  await db.collection('spaces').insertOne({ _id: 'sp_home' as never, name: 'Home', emoji: '🏠', owner_id: 'user_b', deleted_at: null, created_at: '' })
  await db.collection('space_members').insertMany([
    { space_id: 'sp_home', user_id: 'user_b', role: 'owner', joined_at: '', notify_others: false },
    { space_id: 'sp_home', user_id: ME, role: 'member', joined_at: '', notify_others: false },
  ])
  await (await coll('categories', 'sp_home')).insertOne({ name: 'Groceries', group: 'Needs', order: 1 })
  await (await coll('budgets', ME)).insertOne({ month: '2026-09', category: '__credit_card__', assigned: '500' })
  await (await coll('budgets', 'sp_home')).insertOne({ month: '2026-09', category: '__credit_card__', assigned: '0' })
  const { insertedId } = await (await coll('expenses', ME)).insertOne({
    item: 'Milk', amount_inr: '120', category: 'Food', date: '2026-09-18', payment_method: 'credit_card',
    timestamp: '2026-09-18T10:00:00+05:30', version: 2, created_by: ME, photo_file: 'abc.jpg',
  })
  id = insertedId.toString()
  moveExpensePhoto.mockClear()
  forgetMembership('sp_home')
})

const move = (body: object) => POST(new Request('http://localhost/api/expenses/move', { method: 'POST', body: JSON.stringify({ id, version: 2, to: 'sp_home', category: 'Groceries', ...body }) }))
const cc = async (space: string) => Number((await (await coll('budgets', space)).findOne({ month: '2026-09', category: '__credit_card__' }))?.assigned)

describe('POST /api/expenses/move', () => {
  it('moves an expense into another budget, under a category that budget has', async () => {
    const res = await move({})
    expect(res.status).toBe(200)
    expect(await (await coll('expenses', ME)).findOne({ _id: new ObjectId(id) }, undefined, { includeDeleted: true })).toBeNull()
    const moved = await (await coll('expenses', 'sp_home')).findOne({ _id: new ObjectId(id) })
    // Re-encrypted for its new budget: it decrypts there.
    expect(moved).toMatchObject({ item: 'Milk', amount_inr: '120', category: 'Groceries', created_by: ME, version: 3 })
    expect(moveExpensePhoto).toHaveBeenCalledWith(ME, 'sp_home', id, 'abc.jpg')
  })

  it('carries a card spend’s envelope funding with it', async () => {
    await move({})
    expect(await cc(ME)).toBe(380)
    expect(await cc('sp_home')).toBe(120)
  })

  it('refuses a stale version and moves nothing', async () => {
    expect((await move({ version: 1 })).status).toBe(409)
    expect(await (await coll('expenses', ME)).findOne({ _id: new ObjectId(id) })).not.toBeNull()
    expect(await cc(ME)).toBe(500)
  })

  it('refuses a budget the person is not in', async () => {
    await (await getDb()).collection('space_members').deleteOne({ space_id: 'sp_home', user_id: ME })
    forgetMembership('sp_home')
    expect((await move({})).status).toBe(403)
    expect(await (await coll('expenses', ME)).findOne({ _id: new ObjectId(id) })).not.toBeNull()
  })

  it('refuses a category the other budget does not have', async () => {
    expect((await move({ category: 'Food' })).status).toBe(400)
    expect(await (await coll('expenses', ME)).findOne({ _id: new ObjectId(id) })).not.toBeNull()
  })

  it('refuses a move to the budget it is already in', async () => {
    expect((await move({ to: ME })).status).toBe(400)
  })
})
