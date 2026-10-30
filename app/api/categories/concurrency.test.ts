import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { randomBytes } from 'node:crypto'

const USER = 'category-concurrency-test'

const controls = vi.hoisted(() => ({
  afterRead: null as null | (() => Promise<void>),
  failCascade: null as null | string,
  failBulkHalfway: false,
}))
vi.mock('@/lib/access', () => ({
  getAuth: async () => ({ userId: 'category-concurrency-test', readOnly: false, sessionId: null, spaceId: 'category-concurrency-test', spaceOwnerId: 'category-concurrency-test', spaceRole: 'owner' as const }),
  readOnlyGuard: () => null,
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))
// The expenses route imports lib/users, which drags in the server-only WorkOS client.
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('@/lib/categoryMap', () => ({ invalidateCategoryMap: vi.fn() }))
vi.mock('@/lib/notifications/instant', () => ({
  notifyThresholdCrossed: vi.fn(),
  reconcileThresholdLevels: vi.fn(),
}))
// Real scoped/encrypted collections and real Mongo transactions. The barrier
// schedules both reads before either write; the fault injectors simulate a
// crash partway through a multi-write handler.
vi.mock('@/lib/http', async (original) => {
  const actual = await original<typeof import('@/lib/http')>()
  return { ...actual, getCollection: async (...args: Parameters<typeof actual.getCollection>) => {
    const coll = await actual.getCollection(...args)
    const name = args[0]
    return { ...coll,
      findOne: async (...params: Parameters<typeof coll.findOne>) => {
        const row = await coll.findOne(...params)
        if (name === 'categories') await controls.afterRead?.()
        return row
      },
      updateMany: (...params: Parameters<typeof coll.updateMany>) => {
        if (controls.failCascade === name) throw new Error(`injected ${name} failure`)
        return coll.updateMany(...params)
      },
      bulkWrite: async (...params: Parameters<typeof coll.bulkWrite>) => {
        if (!controls.failBulkHalfway) return coll.bulkWrite(...params)
        const [ops, options] = params
        await coll.bulkWrite(ops.slice(0, 1), options)
        throw new Error('injected bulkWrite failure')
      },
    }
  } }
})
import { getDb, getClient } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { POST as createCategory, PUT as renameCategory } from './route'
import { POST as moveCategory } from './move/route'
import { POST as logExpense } from '../expenses/route'
import { PUT as assignBudget } from '../budgets/route'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
  vi.stubEnv('MONGODB_URI', server.getUri('categoryconcurrency'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
  const db = await getDb()
  await db.collection('categories').createIndex({ user_id: 1, name: 1 }, { unique: true, partialFilterExpression: { deleted_at: null } })
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  controls.afterRead = null
  controls.failCascade = null
  controls.failBulkHalfway = false
  const db = await getDb()
  await db.collection('categories').deleteMany({})
  await db.collection('groups').deleteMany({})
  await scoped(db.collection('groups'), USER).insertMany([{ name: 'Home', order: 0 }, { name: 'Fun', order: 1 }])
  await db.collection('budgets').deleteMany({})
  await db.collection('expenses').deleteMany({})
  await db.collection('recurring_expenses').deleteMany({})
  await db.collection('bill_scans').deleteMany({})
  await db.collection('category_map_overrides').deleteMany({})
  await scoped(db.collection('categories'), USER).insertMany([
    { name: 'Rent', group: 'Home', order: 0 },
    { name: 'Food', group: 'Home', order: 1 },
    { name: 'Fuel', group: 'Home', order: 2 },
  ])
  await scoped(db.collection('budgets'), USER).insertOne({ month: '2026-09', category: 'Food', assigned: '500' })
  await scoped(db.collection('expenses'), USER).insertOne({
    item: 'Lunch', amount_inr: '100', category: 'Food', date: '2026-09-18', version: 0,
  })
  await scoped(db.collection('recurring_expenses'), USER).insertOne({
    item: 'Groceries', amount_inr: '2000', category: 'Food', status: 'active', next_run_date: '2026-10-01',
  })
  await scoped(db.collection('bill_scans'), USER).insertOne({ merchant: 'Cafe', total: '300', category: 'Food', date: '2026-09-18' })
  await scoped(db.collection('category_map_overrides'), USER).insertOne({ word: 'lunch', category: 'Food' })
})

function request(path: string, body: object, method = 'PUT') {
  return new Request(`http://localhost/api/categories${path}`, { method, body: JSON.stringify(body) })
}
async function state() {
  const db = await getDb()
  return {
    categories: await scoped(db.collection('categories'), USER).find({}).sort({ order: 1 }).toArray(),
    budget: await scoped(db.collection('budgets'), USER).findOne({ month: '2026-09' }),
    expense: await scoped(db.collection('expenses'), USER).findOne({}),
    recurring: await scoped(db.collection('recurring_expenses'), USER).findOne({}),
    scan: await scoped(db.collection('bill_scans'), USER).findOne({}),
    override: await scoped(db.collection('category_map_overrides'), USER).findOne({}),
  }
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

describe('category rename and move on a real replica set', () => {
  it('renames the category, its budgets and its expenses together', async () => {
    expect((await renameCategory(request('', { name: 'Food', newName: 'Dining' }))).status).toBe(200)
    const after = await state()
    expect(after.categories.map((c) => c.name)).toEqual(['Rent', 'Dining', 'Fuel'])
    expect(after.budget).toMatchObject({ category: 'Dining' })
    expect(after.expense).toMatchObject({ category: 'Dining', version: 1 })
  })

  it('rolls the rename back completely when the expense cascade fails', async () => {
    controls.failCascade = 'expenses'
    await expect(renameCategory(request('', { name: 'Food', newName: 'Dining' }))).rejects.toThrow()
    const after = await state()
    expect(after.categories.map((c) => c.name)).toEqual(['Rent', 'Food', 'Fuel'])
    expect(after.budget).toMatchObject({ category: 'Food' })
    expect(after.expense).toMatchObject({ category: 'Food', version: 0 })
  })

  it('lets only one of two overlapping renames to the same name win', async () => {
    overlapReads()
    const responses = await Promise.all([
      renameCategory(request('', { name: 'Rent', newName: 'Dining' })),
      renameCategory(request('', { name: 'Food', newName: 'Dining' })),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const names = (await state()).categories.map((c) => c.name)
    expect(names.filter((n) => n === 'Dining')).toHaveLength(1)
  })

  it('rejects a create that races another create of the same name', async () => {
    overlapReads()
    const responses = await Promise.all([
      createCategory(request('', { name: 'Travel' }, 'POST')),
      createCategory(request('', { name: 'Travel' }, 'POST')),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const names = (await state()).categories.map((c) => c.name)
    expect(names.filter((n) => n === 'Travel')).toHaveLength(1)
  })

  it('leaves every order untouched when a move fails partway', async () => {
    controls.failBulkHalfway = true
    await expect(moveCategory(request('/move', { name: 'Fuel', toIndex: 0 }, 'POST'))).rejects.toThrow()
    const after = await state()
    expect(after.categories.map((c) => [c.name, c.order])).toEqual([['Rent', 0], ['Food', 1], ['Fuel', 2]])
  })

  it('keeps order values unique when two moves overlap', async () => {
    overlapReads()
    await Promise.all([
      moveCategory(request('/move', { name: 'Fuel', toIndex: 0 }, 'POST')),
      moveCategory(request('/move', { name: 'Rent', toIndex: 2 }, 'POST')),
    ])
    const orders = (await state()).categories.map((c) => c.order)
    expect(new Set(orders).size).toBe(orders.length)
    expect([...orders].sort()).toEqual([0, 1, 2])
  })
})

describe('moving a category to another group', () => {
  const move = (body: object) => moveCategory(request('/move', body, 'POST'))
  const rows = async () => (await state()).categories.map((c) => [c.name, c.group, c.order])

  beforeEach(async () => {
    const db = await getDb()
    await scoped(db.collection('categories'), USER).insertMany([
      { name: 'Movies', group: 'Fun', order: 5 },
      { name: 'Games', group: 'Fun', order: 6 },
    ])
  })

  it('lands at the dropped position and renumbers the destination', async () => {
    expect((await move({ name: 'Food', toIndex: 1, group: 'Fun' })).status).toBe(200)
    const after = await rows()
    expect(after).toContainEqual(['Movies', 'Fun', 5])
    expect(after).toContainEqual(['Food', 'Fun', 6])
    expect(after).toContainEqual(['Games', 'Fun', 7])
    expect(after).toContainEqual(['Rent', 'Home', 0])
    expect(after).toContainEqual(['Fuel', 'Home', 2])
  })

  it('accepts the slot just past the last row of the destination', async () => {
    expect((await move({ name: 'Food', toIndex: 2, group: 'Fun' })).status).toBe(200)
    expect(await rows()).toContainEqual(['Food', 'Fun', 7])
  })

  it('moves into a group with nothing in it', async () => {
    const db = await getDb()
    await scoped(db.collection('groups'), USER).insertOne({ name: 'Empty', order: 2 })
    expect((await move({ name: 'Food', toIndex: 0, group: 'Empty' })).status).toBe(200)
    expect(await rows()).toContainEqual(['Food', 'Empty', 0])
  })

  it('moves out to the ungrouped bucket', async () => {
    expect((await move({ name: 'Food', toIndex: 0, group: '' })).status).toBe(200)
    expect(await rows()).toContainEqual(['Food', '', 0])
  })

  it('refuses a group that does not exist, and a slot past the end', async () => {
    expect((await move({ name: 'Food', toIndex: 0, group: 'Nope' })).status).toBe(404)
    expect((await move({ name: 'Food', toIndex: 3, group: 'Fun' })).status).toBe(400)
    expect(await rows()).toContainEqual(['Food', 'Home', 1])
  })

  it('still rejects a same-group slot past the end', async () => {
    expect((await move({ name: 'Food', toIndex: 3 })).status).toBe(400)
    expect((await move({ name: 'Food', toIndex: 3, group: 'Home' })).status).toBe(400)
  })

  it('leaves the category where it was when the write fails partway', async () => {
    controls.failBulkHalfway = true
    await expect(move({ name: 'Food', toIndex: 0, group: 'Fun' })).rejects.toThrow()
    expect(await rows()).toContainEqual(['Food', 'Home', 1])
    expect(await rows()).toContainEqual(['Movies', 'Fun', 5])
  })
})

describe('category rename cascade and stale references', () => {
  it('carries a rename into every collection that stores the category name', async () => {
    expect((await renameCategory(request('', { name: 'Food', newName: 'Dining' }))).status).toBe(200)
    const after = await state()
    expect(after.budget).toMatchObject({ category: 'Dining' })
    expect(after.expense).toMatchObject({ category: 'Dining' })
    expect(after.recurring).toMatchObject({ category: 'Dining' })
    expect(after.scan).toMatchObject({ category: 'Dining' })
    expect(after.override).toMatchObject({ word: 'lunch', category: 'Dining' })
  })

  it('rolls every cascade back when one of them fails', async () => {
    controls.failCascade = 'category_map_overrides'
    await expect(renameCategory(request('', { name: 'Food', newName: 'Dining' }))).rejects.toThrow()
    const after = await state()
    expect(after.categories.map((c) => c.name)).toEqual(['Rent', 'Food', 'Fuel'])
    expect(after.recurring).toMatchObject({ category: 'Food' })
    expect(after.scan).toMatchObject({ category: 'Food' })
    expect(after.override).toMatchObject({ category: 'Food' })
  })

  it('records the old name so a client that never saw the rename still lands in the right envelope', async () => {
    await renameCategory(request('', { name: 'Food', newName: 'Dining' }))
    const logged = await logExpense(new Request('http://localhost/api/expenses', {
      method: 'POST',
      body: JSON.stringify({ item: 'Coffee', amount_inr: '80', category: 'Food', date: '2026-09-19' }),
    }))
    expect(logged.status).toBe(200)
    // The client asked for 'Food' and got 'Dining'; it has to be told, or its
    // success screen looks the expense up under a category that has no envelope.
    expect(await logged.json()).toMatchObject({ category: 'Dining' })
    const db = await getDb()
    const rows = await scoped(db.collection('expenses'), USER).find({ date: '2026-09-19' }).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ category: 'Dining' })
  })

  it('assigns a budget posted against the old name to the renamed category', async () => {
    await renameCategory(request('', { name: 'Food', newName: 'Dining' }))
    const response = await assignBudget(new Request('http://localhost/api/budgets', {
      method: 'PUT',
      body: JSON.stringify({ month: '2026-10', category: 'Food', assigned: '900', version: 0 }),
    }))
    expect(response.status).toBe(200)
    const db = await getDb()
    const rows = await scoped(db.collection('budgets'), USER).find({ month: '2026-10' }).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ category: 'Dining', assigned: '900', version: 1 })
  })

  it('prefers a live category over an alias when the freed name is reused', async () => {
    await renameCategory(request('', { name: 'Food', newName: 'Dining' }))
    expect((await createCategory(request('', { name: 'Food' }, 'POST'))).status).toBe(200)
    await logExpense(new Request('http://localhost/api/expenses', {
      method: 'POST',
      body: JSON.stringify({ item: 'Coffee', amount_inr: '80', category: 'Food', date: '2026-09-19' }),
    }))
    const db = await getDb()
    const rows = await scoped(db.collection('expenses'), USER).find({ date: '2026-09-19' }).toArray()
    expect(rows[0]).toMatchObject({ category: 'Food' })
  })
})
