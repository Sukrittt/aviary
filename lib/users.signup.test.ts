// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { MongoClient, type Db } from 'mongodb'
import type { MongoMemoryServer } from 'mongodb-memory-server'
import { startMongo } from '@/src/test-utils/mongo'
import type { UserDoc } from '@/lib/users'

let db: Db
let server: MongoMemoryServer
let client: MongoClient
vi.mock('@/lib/mongodb', () => ({ getDb: async () => db }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: () => ({ userManagement: { getUser: async (id: string) => ({ id, email: `${id}@example.com` }) } }) }))
vi.mock('@/lib/posthogServer', () => ({ captureLater: vi.fn() }))

const { ensureUser, ensureUserById } = await import('@/lib/users')
const { captureLater } = await import('@/lib/posthogServer')

beforeAll(async () => {
  server = await startMongo()
  client = await MongoClient.connect(server.getUri())
  db = client.db('signup_test')
}, 120_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => { await db.dropDatabase(); vi.clearAllMocks() })

const users = () => db.collection<UserDoc>('users')

it('stores the source on the new account and reports the signup once', async () => {
  const source = { utm_source: 'reddit', utm_campaign: 'r/x', platform: 'web' as const }
  expect(await ensureUser({ id: 'u1', email: 'a@example.com' }, source, 'google')).toEqual({ inserted: true })
  expect((await users().findOne({ _id: 'u1' }))?.signupSource).toEqual(source)
  expect(captureLater).toHaveBeenCalledWith('u1', 'user_signed_up', expect.objectContaining({
    utm_source: 'reddit', source: 'reddit', method: 'google', platform: 'web',
    $set_once: expect.objectContaining({ signup_source: 'reddit', signup_platform: 'web' }),
  }))

  // Signing in again from somewhere else changes nothing.
  expect(await ensureUser({ id: 'u1', email: 'a@example.com' }, { utm_source: 'instagram', platform: 'android' }, 'email')).toEqual({ inserted: false })
  expect((await users().findOne({ _id: 'u1' }))?.signupSource).toEqual(source)
  expect(captureLater).toHaveBeenCalledTimes(1)
})

it('reports a signup with no source as direct', async () => {
  await ensureUser({ id: 'u2', email: 'b@example.com' })
  expect(captureLater).toHaveBeenCalledWith('u2', 'user_signed_up', expect.objectContaining({ source: 'direct', method: 'jit', platform: 'web' }))
})

it('passes the source through the app\'s first-request path', async () => {
  await ensureUserById('u3', { utm_source: 'google-play', utm_medium: 'organic', platform: 'android' })
  expect((await users().findOne({ _id: 'u3' }))?.signupSource).toMatchObject({ utm_source: 'google-play', platform: 'android' })
})
