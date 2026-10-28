import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { getClient, getDb } from '@/lib/mongodb'
import type { Auth } from '@/lib/access'

// Real Mongo and the real scoped() layer, so the note's encryption and every
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
const list = async () => (await (await GET(new Request('https://example.com/api/categories'))).json()) as { name: string; note?: unknown }[]
const noteOf = async (name: string) => (await list()).find((c) => c.name === name)?.note

const NOTE = 'Policy no. 88231\n- renew by 15 Nov\n[x] book train'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
  vi.stubEnv('MONGODB_URI', server.getUri('notes'))
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
  expect((await send(POST, 'POST', { name: 'Insurance', group: 'Bills' })).status).toBe(200)
  expect((await send(POST, 'POST', { name: 'Rent', group: 'Bills' })).status).toBe(200)
  expect((await send(PUT, 'PUT', { name: 'Insurance', note: NOTE })).status).toBe(200)
})

describe('category notes', () => {
  it('sets a note and reads it back', async () => {
    expect(await noteOf('Insurance')).toBe(NOTE)
    expect(await noteOf('Rent')).toBeUndefined()
  })

  it('trims a note', async () => {
    expect((await send(PUT, 'PUT', { name: 'Rent', note: '  due on the 5th \n' })).status).toBe(200)
    expect(await noteOf('Rent')).toBe('due on the 5th')
  })

  it.each([['null', null], ['an empty string', ''], ['whitespace', '  \n ']])('clears a note with %s', async (_label, note) => {
    expect((await send(PUT, 'PUT', { name: 'Insurance', note })).status).toBe(200)
    expect(await noteOf('Insurance')).toBeUndefined()
  })

  it('keeps the note out of the database in plaintext', async () => {
    const raw = await (await getDb()).collection('categories').findOne({ name: 'Insurance' })
    expect(typeof raw?.note).toBe('string')
    expect(raw?.note).not.toContain('88231')
  })

  it('takes 3000 characters and rejects 3001', async () => {
    expect((await send(PUT, 'PUT', { name: 'Rent', note: 'a'.repeat(3000) })).status).toBe(200)
    expect(await noteOf('Rent')).toBe('a'.repeat(3000))
    expect((await send(PUT, 'PUT', { name: 'Rent', note: 'b'.repeat(3001) })).status).toBe(400)
    expect(await noteOf('Rent')).toBe('a'.repeat(3000))
  })

  it('ticks a full 2000-character note, though the tick makes it longer', async () => {
    const full = '- x\n'.repeat(499) + '- x'
    expect(full.length).toBe(1999)
    expect((await send(PUT, 'PUT', { name: 'Rent', note: full })).status).toBe(200)
    const ticked = full.replaceAll('- x', '[x] x')
    expect((await send(PUT, 'PUT', { name: 'Rent', note: ticked, prevNote: full })).status).toBe(200)
    expect(await noteOf('Rent')).toBe(ticked)
  })

  it('refuses a write made from an older copy of the note, so nobody\'s edit is lost', async () => {
    // A ticks from the copy they opened; B changed the note meanwhile.
    expect((await send(PUT, 'PUT', { name: 'Insurance', note: NOTE + '\n- call agent', prevNote: NOTE })).status).toBe(200)
    expect((await send(PUT, 'PUT', { name: 'Insurance', note: NOTE.replace('- renew', '[x] renew'), prevNote: NOTE })).status).toBe(409)
    expect(await noteOf('Insurance')).toBe(NOTE + '\n- call agent')
  })

  it('treats a missing note as the empty copy', async () => {
    expect((await send(PUT, 'PUT', { name: 'Rent', note: 'first', prevNote: '' })).status).toBe(200)
    expect((await send(PUT, 'PUT', { name: 'Rent', note: 'second', prevNote: '' })).status).toBe(409)
    expect(await noteOf('Rent')).toBe('first')
  })

  it('rejects a prevNote that is not text', async () => {
    expect((await send(PUT, 'PUT', { name: 'Insurance', note: 'x', prevNote: 42 })).status).toBe(400)
    expect(await noteOf('Insurance')).toBe(NOTE)
  })

  it('rejects a note that is not text', async () => {
    expect((await send(PUT, 'PUT', { name: 'Insurance', note: 42 })).status).toBe(400)
    expect(await noteOf('Insurance')).toBe(NOTE)
  })

  it.each([
    ['a rename', { newName: 'Cover' }],
    ['a group change', { group: 'Fun' }],
    ['a goal set', { goal: { amount: 6000 } }],
    ['a goal clear', { goal: null }],
    ['new alert thresholds', { alertPcts: [50, 90] }],
    ['an icon and colour', { icon: 'Gift', color: 'mint' }],
  ])('keeps the note through %s', async (_label, updates) => {
    expect((await send(PUT, 'PUT', { name: 'Insurance', ...updates })).status).toBe(200)
    const name = 'newName' in updates ? String(updates.newName) : 'Insurance'
    expect(await noteOf(name)).toBe(NOTE)
  })

  it('keeps the note through a reorder', async () => {
    expect((await MOVE(new Request('https://example.com/api/categories/move', { method: 'POST', body: JSON.stringify({ name: 'Insurance', toIndex: 1 }) }))).status).toBe(200)
    expect(await noteOf('Insurance')).toBe(NOTE)
  })

  it('shows a shared budget\'s note to every member, who can edit it', async () => {
    as = { ...auth, userId: 'partner', spaceRole: 'member' }
    expect(await noteOf('Insurance')).toBe(NOTE)
    expect((await send(PUT, 'PUT', { name: 'Insurance', note: 'paid ✅' })).status).toBe(200)
    as = auth
    expect(await noteOf('Insurance')).toBe('paid ✅')
    // And not to anyone else's budget.
    as = { ...auth, userId: 'stranger', spaceId: 'stranger' }
    expect(await list()).toEqual([])
  })
})
