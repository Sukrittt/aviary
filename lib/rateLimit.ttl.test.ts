// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { MongoClient, type Db } from 'mongodb'
import type { MongoMemoryServer } from 'mongodb-memory-server'
import { startMongo } from '@/src/test-utils/mongo'

// Real Mongo with the real TTL index from scripts/ensure-indexes.mjs, so a
// day-long window is checked against what the TTL monitor actually leaves behind.
let db: Db, client: MongoClient, server: MongoMemoryServer
vi.mock('./mongodb', () => ({ getDb: async () => db }))
const { isRateLimited } = await import('./rateLimit')

const HOUR = 3_600_000
const DAY_TIER = { windowMs: 24 * HOUR, limit: 1 }

beforeAll(async () => {
  server = await startMongo()
  client = await MongoClient.connect(server.getUri())
  db = client.db('rate_limit_ttl_test')
  await client.db('admin').command({ setParameter: 1, ttlMonitorSleepSecs: 1 })
  await db.collection('rate_limit_hits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
}, 120_000)
afterAll(async () => { await client?.close(); await server?.stop() })

async function hitAt(key: string, msAgo: number) {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() - msAgo })
  try { await isRateLimited(key, DAY_TIER) } finally { vi.useRealTimers() }
}

it('keeps a 2h-old hit counting toward a 24h window, and reaps it once the day is up (#211)', async () => {
  await hitAt('recent', 2 * HOUR)
  await hitAt('stale', 25 * HOUR)
  const hits = db.collection('rate_limit_hits')
  await vi.waitFor(async () => expect(await hits.countDocuments({ key: 'stale' })).toBe(0), { timeout: 10_000, interval: 250 })
  expect(await hits.countDocuments({ key: 'recent' })).toBe(1)
  expect(await isRateLimited('recent', DAY_TIER)).toBe(true)
}, 30_000)
