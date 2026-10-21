import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { randomBytes } from 'node:crypto'

const who = vi.hoisted(() => ({ userId: 'user_a', spaceId: 'user_a' }))
vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: who.userId, readOnly: false, sessionId: null, spaceId: who.spaceId, spaceOwnerId: who.userId, spaceRole: 'owner' as const }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null, requireOwnPlan: async () => null, ownerLapsed: async (id: string) => id === 'user_lapsed' }))

import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { GET, POST } from './route'
import { PATCH } from './[id]/route'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
  vi.stubEnv('MONGODB_URI', server.getUri('spaces'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})

beforeEach(async () => {
  const db = await getDb()
  for (const name of ['users', 'spaces', 'space_members', 'categories', 'groups', 'budgets']) await db.collection(name).deleteMany({})
  who.userId = 'user_a'
  who.spaceId = 'user_a'
  await db.collection('users').insertMany([
    { _id: 'user_a' as never, name: 'Priya', currencyCode: 'INR' },
    { _id: 'user_b' as never, name: 'Rahul', currencyCode: 'USD' },
  ])
  await scoped(db.collection('groups'), 'user_a').insertOne({ name: 'Needs', order: 1 })
  await scoped(db.collection('categories'), 'user_a').insertMany([{ name: 'Rent', group: 'Needs', order: 1, icon: 'house' }, { name: 'Food', group: 'Needs', order: 2 }])
  await scoped(db.collection('budgets'), 'user_a').insertOne({ month: '2026-10', category: 'Rent', assigned: '20000' })
})

const list = async () => (await GET(new Request('http://x/api/spaces'))).json()
const create = (body: object) => POST(new Request('http://x/api/spaces', { method: 'POST', body: JSON.stringify({ name: 'Trip', emoji: '✈️', currencyCode: 'EUR', ...body }) }))

describe('/api/spaces', () => {
  it('describes a one-budget account from the user doc alone', async () => {
    const body = await list()
    expect(body).toMatchObject({ count: 1, limit: 5, activeId: 'user_a' })
    expect(body.budgets).toEqual([expect.objectContaining({ id: 'user_a', name: 'Personal', personal: true, role: 'owner', currencyCode: 'INR' })])
    // Nothing written for it.
    expect(await (await getDb()).collection('spaces').countDocuments()).toBe(0)
  })

  it('creates a budget with a copy of the current categories, and no money', async () => {
    const res = await create({})
    expect(res.status).toBe(201)
    const budget = await res.json()
    expect(budget).toMatchObject({ name: 'Trip', emoji: '✈️', currencyCode: 'EUR', role: 'owner', personal: false })
    const db = await getDb()
    const cats = await scoped(db.collection('categories'), budget.id).find({}).sort({ order: 1 }).toArray()
    expect(cats.map((c) => [c.name, c.group, c.icon])).toEqual([['Rent', 'Needs', 'house'], ['Food', 'Needs', undefined]])
    expect(await scoped(db.collection('groups'), budget.id).countDocuments({})).toBe(1)
    expect(await scoped(db.collection('budgets'), budget.id).countDocuments({})).toBe(0)
    expect((await list()).budgets.map((b: { name: string }) => b.name)).toEqual(['Personal', 'Trip'])
  })

  it("makes the first own budget of someone who only joined their personal one, set up from scratch", async () => {
    const db = await getDb()
    await db.collection('users').updateOne({ _id: 'user_b' as never }, { $set: { noPersonalBudget: true } })
    who.userId = 'user_b'
    who.spaceId = 'user_b'
    const budget = await (await create({})).json()
    expect(budget).toMatchObject({ id: 'user_b', name: 'Trip', personal: true, currencyCode: 'EUR' })
    expect(await db.collection('categories').countDocuments({ user_id: 'user_b' })).toBe(0)
    expect((await db.collection('users').findOne({ _id: 'user_b' as never }))?.noPersonalBudget).toBeUndefined()
  })

  it("opens the first budget it has for someone with no personal one, and flags a lapsed owner's as read-only", async () => {
    const db = await getDb()
    const now = new Date().toISOString()
    await db.collection('users').updateOne({ _id: 'user_b' as never }, { $set: { noPersonalBudget: true } })
    await db.collection('spaces').insertOne({ _id: 'sp_x' as never, name: 'Flat', emoji: '🏠', owner_id: 'user_lapsed', deleted_at: null, created_at: now })
    await db.collection('space_members').insertMany([
      { space_id: 'sp_x', user_id: 'user_lapsed', role: 'owner', joined_at: now },
      { space_id: 'sp_x', user_id: 'user_b', role: 'member', joined_at: now },
    ])
    who.userId = 'user_b'
    who.spaceId = 'user_b'
    const body = await list()
    expect(body.activeId).toBe('sp_x')
    expect(body.budgets).toEqual([expect.objectContaining({ id: 'sp_x', readOnly: true })])
  })

  it('starts a budget to import into empty and not yet set up', async () => {
    const budget = await (await create({ import: true })).json()
    const db = await getDb()
    expect(await db.collection('categories').countDocuments({ user_id: budget.id })).toBe(0)
    expect((await db.collection('spaces').findOne({ _id: budget.id }))?.onboardedAt).toBeNull()
  })

  it('starts empty when asked not to copy', async () => {
    const budget = await (await create({ copyCategories: false })).json()
    expect(await scoped((await getDb()).collection('categories'), budget.id).countDocuments({})).toBe(0)
  })

  it('stops at 5 budgets, owned and joined together', async () => {
    const db = await getDb()
    await db.collection('spaces').insertOne({ _id: 'sp_joined' as never, name: 'Home', emoji: '🏠', owner_id: 'user_b', deleted_at: null, created_at: '' })
    await db.collection('space_members').insertOne({ space_id: 'sp_joined', user_id: 'user_a', role: 'member', joined_at: '2026-10-01', notify_others: false })
    for (const name of ['One', 'Two', 'Three']) expect((await create({ name })).status).toBe(201)
    expect((await list()).count).toBe(5)
    const res = await create({ name: 'Six' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'LIMIT_REACHED' })
  })

  it('lets an admin-raised limit through', async () => {
    await (await getDb()).collection('users').updateOne({ _id: 'user_a' as never }, { $set: { budgetLimit: 6 } })
    for (const name of ['One', 'Two', 'Three', 'Four', 'Five']) expect((await create({ name })).status).toBe(201)
    expect((await create({ name: 'Seven' })).status).toBe(409)
  })

  it('picks an icon from our set, keeping an emoji for older app builds', async () => {
    const budget = await (await create({ emoji: undefined, icon: 'Airplane' })).json()
    expect(budget).toMatchObject({ icon: 'Airplane', emoji: '✈️' })
    expect((await create({ emoji: undefined, icon: 'NotAnIcon' })).status).toBe(400)
    const patch = PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ icon: 'House' }) }), { params: Promise.resolve({ id: budget.id }) })
    expect(await (await patch).json()).toMatchObject({ icon: 'House' })
  })

  it('gives older budgets, and older apps sending an emoji, the matching icon', async () => {
    expect(await (await create({})).json()).toMatchObject({ icon: 'Airplane', emoji: '✈️' })
    expect((await list()).budgets[0]).toMatchObject({ personal: true, icon: 'Bird' })
  })

  it('rejects a missing name, a non-emoji and an unknown currency', async () => {
    expect((await create({ name: ' ' })).status).toBe(400)
    expect((await create({ emoji: 'ab' })).status).toBe(400)
    expect((await create({ currencyCode: 'XXX' })).status).toBe(400)
  })

  it('renames a budget for its owner only', async () => {
    const budget = await (await create({})).json()
    const patch = (body: object) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: budget.id }) })
    expect(await (await patch({ name: 'Goa trip' })).json()).toMatchObject({ name: 'Goa trip' })
    await (await getDb()).collection('space_members').insertOne({ space_id: budget.id, user_id: 'user_b', role: 'member', joined_at: '', notify_others: false })
    who.userId = 'user_b'
    expect((await patch({ name: 'Mine now' })).status).toBe(403)
  })

  it('renames the personal budget by giving it a doc, keeping its currency on the user', async () => {
    const patch = (body: object) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'user_a' }) })
    expect(await (await patch({ name: 'Me', currencyCode: 'GBP' })).json()).toMatchObject({ id: 'user_a', name: 'Me', personal: true, currencyCode: 'GBP' })
    const db = await getDb()
    expect(await db.collection('users').findOne({ _id: 'user_a' as never })).toMatchObject({ currencyCode: 'GBP' })
    expect(await db.collection('space_members').findOne({ space_id: 'user_a' })).toMatchObject({ user_id: 'user_a', role: 'owner' })
  })
})
