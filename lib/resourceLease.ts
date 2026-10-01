import { randomUUID } from 'node:crypto'
import { getDb } from './mongodb'

type Lease = { _id: string; token: string; expiresAt: Date }
/** Unique _id arbitrates races across serverless instances. Expired workers
 * cannot release a newer worker's lease. TTL exceeds the route's maxDuration. */
export async function acquireLease(key: string, ttlMs = 15 * 60_000): Promise<(() => Promise<void>) | null> {
  const coll = (await getDb()).collection<Lease>('resource_leases')
  const token = randomUUID()
  const now = new Date()
  try {
    await coll.updateOne(
      { _id: key, expiresAt: { $lte: now } },
      { $set: { token, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    )
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null
    throw err
  }
  return async () => { await coll.deleteOne({ _id: key, token }) }
}
