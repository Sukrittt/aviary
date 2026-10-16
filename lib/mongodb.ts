import { MongoClient, type Db, type ClientSession } from 'mongodb'

const globalWithMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>
}

/**
 * Return a cached MongoClient connected to MONGODB_URI.
 *
 * The client is cached on `globalThis` so hot-reloads (dev) and repeated
 * route-handler invocations reuse a single connection pool. The connection is
 * created lazily so `next build` does not require MONGODB_URI to be present.
 * A failed connect is dropped rather than cached, so the next request retries:
 * a warm instance keeps serving long after the blip that failed its first
 * connect.
 */
export async function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not defined. Set it in .env.local or the deployment environment.')
  }
  if (!globalWithMongo._mongoClientPromise) {
    const client = new MongoClient(uri)
    const connecting = client.connect().catch((err: unknown) => {
      if (globalWithMongo._mongoClientPromise === connecting) globalWithMongo._mongoClientPromise = undefined
      void client.close().catch(() => {})
      throw err
    })
    globalWithMongo._mongoClientPromise = connecting
  }
  return globalWithMongo._mongoClientPromise
}

export async function getDb(): Promise<Db> {
  const client = await getClient()
  return client.db()
}

const afterCommit = new WeakMap<ClientSession, Map<string, () => Promise<void>>>()

/**
 * Queues `task` to run once the session's transaction commits, and returns
 * true. Returns false when the session isn't mid-transaction, so the caller
 * should run `task` itself. `key` dedupes: withTransaction may retry the
 * callback, and the same side effect must run once.
 */
export function deferUntilCommit(session: ClientSession | undefined, key: string, task: () => Promise<void>): boolean {
  if (!session?.inTransaction()) return false
  let tasks = afterCommit.get(session)
  if (!tasks) afterCommit.set(session, (tasks = new Map()))
  tasks.set(key, task)
  return true
}

/**
 * Runs `fn` inside a multi-document transaction. `withTransaction` retries
 * the whole callback on a transient error (e.g. write conflict), so `fn`
 * must be pure DB writes — no push notifications, nothing with a side effect
 * outside Mongo. Run those after this resolves. (Scoped writes to brief
 * sources queue their cache invalidation via deferUntilCommit.)
 */
export async function withTx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getClient()
  const session = client.startSession()
  try {
    let result: T
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    // Committed, so readers now see the writes: safe to invalidate caches.
    // Awaited so a write's response never precedes its cache invalidation.
    const tasks = afterCommit.get(session)
    if (tasks) await Promise.all([...tasks.values()].map((task) => task()))
    return result!
  } finally {
    await session.endSession()
  }
}
