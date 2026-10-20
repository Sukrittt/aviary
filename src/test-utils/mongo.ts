import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server'

// Shared settings for every Mongo-backed test file. mongod's default 10s
// launch timeout trips when a full run boots many instances at once (seen as
// "Instance failed to start within 10000ms"), so give it 60s. Keep the
// beforeAll hook timeouts in the test files above this.
const binary = { version: '8.2.6' }
const instance = { launchTimeout: 60_000 }

// The library picks a free port, then mongod binds it; another mongod can take
// it in between ('Port "…" already in use'). That fails fast, so retry once.
async function retryOnPortClash<T>(start: () => Promise<T>): Promise<T> {
  try {
    return await start()
  } catch (e) {
    if (!(e instanceof Error && /already in use/.test(e.message))) throw e
    return start()
  }
}

export const startMongo = () => retryOnPortClash(() => MongoMemoryServer.create({ binary, instance }))

export const startMongoReplSet = () =>
  retryOnPortClash(() => MongoMemoryReplSet.create({ binary, replSet: { count: 1 }, instanceOpts: [instance] }))
