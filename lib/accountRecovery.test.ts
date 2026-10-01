import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
vi.mock('./workosClient', () => ({ getWorkOSClient: () => ({ userManagement: { deleteUser: vi.fn() } }) }))
vi.mock('./cache', () => ({ invalidate: vi.fn() }))
vi.mock('./ai/briefCache', () => ({ BRIEF_SOURCES: new Set(), invalidateBrief: vi.fn(async () => {}) }))
import { getDb, getClient } from './mongodb'
import { softDeleteAccount, restoreAccount } from './accountLifecycle'
let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } })
  vi.stubEnv('MONGODB_URI', server.getUri('recovery'))
}, 120000)
afterAll(async () => { await (await getClient()).close(); await server.stop(); vi.unstubAllEnvs() })
it('restores all account-deleted rows, preserving earlier archives and other users', async () => {
  const db = await getDb()
  await db.collection('users').insertOne({ _id: 'a' as never, deleted_at: null })
  await db.collection('expenses').insertMany([
    { user_id: 'a', item: 'one', deleted_at: null },
    { user_id: 'a', item: 'two', deleted_at: null },
    { user_id: 'a', item: 'old archive', deleted_at: '2020-01-01T00:00:00Z' },
    { user_id: 'b', item: 'other', deleted_at: null },
  ])
  await softDeleteAccount(db, 'a')
  await softDeleteAccount(db, 'a') // retries must preserve the original batch
  await restoreAccount(db, 'a')
  expect(await db.collection('expenses').countDocuments({ user_id: 'a', deleted_at: null })).toBe(2)
  expect(await db.collection('expenses').findOne({ item: 'old archive' })).toMatchObject({ deleted_at: '2020-01-01T00:00:00Z' })
  expect(await db.collection('expenses').findOne({ user_id: 'b' })).toMatchObject({ deleted_at: null })
})

it('does not report a legacy deletion as restored without knowing its archived batch', async () => {
  const db = await getDb()
  await db.collection('users').insertOne({ _id: 'legacy' as never, deleted_at: '2026-01-01T00:00:00+05:30' })
  await expect(restoreAccount(db, 'legacy')).rejects.toThrow('support')
  expect((await db.collection('users').findOne({ _id: 'legacy' as never }))?.deleted_at).not.toBeNull()
})
