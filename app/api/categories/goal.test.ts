import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { getClient, getDb } from '@/lib/mongodb'
import type { Auth } from '@/lib/access'

// Real Mongo and the real scoped() layer, so the goal's encryption and every
// write path that could drop it are exercised as they run in production.
const auth: Auth = { userId: 'owner', readOnly: false, sessionId: null, spaceId: 'sp_home', spaceOwnerId: 'owner', spaceRole: 'owner' }
let as: Auth = auth

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => as), readOnlyGuard: vi.fn(() => null) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/cache', () => ({ invalidate: vi.fn() }))

const { GET, POST, PUT } = await import('./route')
const { POST: MOVE } = await import('./move/route')

const send = (handler: (req: Request) => Promise<Response>, method: string, body: Record<string, unknown>) =>
  handler(new Request('https://example.com/api/categories', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const list = async () => (await (await GET(new Request('https://example.com/api/categories'))).json()) as { name: string; goal?: unknown }[]
const goalOf = async (name: string) => (await list()).find((c) => c.name === name)?.goal

const DIWALI = { amount: 30000, by: '2026-11', repeat: 'yearly' }

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
  vi.stubEnv('MONGODB_URI', server.getUri('goals'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  as = auth
  const db = await getDb()
  for (const name of ['categories', 'budgets', 'expenses']) await db.collection(name).deleteMany({})
  expect((await send(POST, 'POST', { name: 'Diwali', group: 'Saving', goal: DIWALI })).status).toBe(200)
  expect((await send(POST, 'POST', { name: 'Rent', group: 'Saving' })).status).toBe(200)
})

describe('category goals', () => {
  it('stores a goal from a new category and reads it back', async () => {
    expect(await goalOf('Diwali')).toEqual(DIWALI)
    expect(await goalOf('Rent')).toBeUndefined()
  })

  it('keeps the target out of the database in plaintext', async () => {
    const raw = await (await getDb()).collection('categories').findOne({ name: 'Diwali' })
    expect(typeof raw?.goal).toBe('string')
    expect(raw?.goal).not.toContain('30000')
  })

  it('sets, changes and removes a goal', async () => {
    expect((await send(PUT, 'PUT', { name: 'Rent', goal: { amount: '12000' } })).status).toBe(200)
    expect(await goalOf('Rent')).toEqual({ amount: 12000 })
    expect((await send(PUT, 'PUT', { name: 'Rent', goal: null })).status).toBe(200)
    expect(await goalOf('Rent')).toBeUndefined()
  })

  // Mobile doesn't know about goals yet. Each of these is a body it sends today
  // (aviary-mobile src/api/categories.ts), none naming `goal`.
  it.each([
    ['a rename', { newName: 'Festivals' }],
    ['a group change', { group: 'Fun' }],
    ['new alert thresholds', { alertPcts: [50, 90] }],
    ['cleared alert thresholds', { alertPcts: null }],
    ['an icon and colour', { icon: 'Gift', color: 'mint' }],
    ['weekly pacing', { weeklySince: '2026-10-26' }],
  ])('keeps the goal through %s', async (_label, updates) => {
    expect((await send(PUT, 'PUT', { name: 'Diwali', ...updates })).status).toBe(200)
    const name = 'newName' in updates ? String(updates.newName) : 'Diwali'
    expect(await goalOf(name)).toEqual(DIWALI)
  })

  it('keeps the goal through a reorder', async () => {
    expect((await MOVE(new Request('https://example.com/api/categories/move', { method: 'POST', body: JSON.stringify({ name: 'Diwali', toIndex: 1 }) }))).status).toBe(200)
    expect(await goalOf('Diwali')).toEqual(DIWALI)
  })

  it.each([
    ['no amount', { by: '2026-11' }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['a bad month', { amount: 100, by: '2026-13' }],
    ['a yearly repeat with no month', { amount: 100, repeat: 'yearly' }],
    ['an unknown repeat', { amount: 100, by: '2026-11', repeat: 'weekly' }],
    ['not an object', 'lots'],
  ])('rejects a goal with %s', async (_label, goal) => {
    expect((await send(PUT, 'PUT', { name: 'Rent', goal })).status).toBe(400)
    expect((await send(POST, 'POST', { name: 'Gifts', goal })).status).toBe(400)
    expect(await goalOf('Rent')).toBeUndefined()
  })

  it('shows a shared budget\'s goal to every member', async () => {
    as = { ...auth, userId: 'partner', spaceRole: 'member' }
    expect(await goalOf('Diwali')).toEqual(DIWALI)
    // And not to anyone else's budget.
    as = { ...auth, userId: 'stranger', spaceId: 'stranger' }
    expect(await list()).toEqual([])
  })
})
