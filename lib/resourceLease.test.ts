import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { getDb, getClient } from './mongodb'
import { acquireLease } from './resourceLease'
let server: MongoMemoryServer
beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.2.6' } })
  vi.stubEnv('MONGODB_URI', server.getUri('leases'))
}, 120000)
afterAll(async () => { await (await getClient()).close(); await server.stop(); vi.unstubAllEnvs() })
it('admits one concurrent worker and prevents a stale release from unlocking its successor', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => acquireLease('same')))
  const release = results.find(Boolean)!
  expect(results.filter(Boolean)).toHaveLength(1)
  await (await getDb()).collection('resource_leases').updateOne({ _id: 'same' as never }, { $set: { expiresAt: new Date(0) } })
  const successor = await acquireLease('same')
  expect(successor).not.toBeNull()
  await release()
  expect(await acquireLease('same')).toBeNull()
  await successor!()
  expect(await acquireLease('same')).not.toBeNull()
})
