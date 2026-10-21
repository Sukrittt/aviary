import { getDb } from './mongodb'

const RATE_LIMIT_COLLECTION = 'rate_limit_hits'

type RateLimitHit = { key: string; ts: Date; expiresAt: Date }

export type RateLimitTier = { windowMs: number; limit: number }

/**
 * Sliding-window rate limiter backed by Mongo, so it survives cold starts and
 * is shared across serverless instances — unlike a per-instance in-memory Map
 * (the shape app/api/ai/chat/route.ts used before this existed).
 *
 * One document per hit rather than an array-per-key: each hit carries its own
 * `expiresAt` (now + the longest tier it was checked against), and a TTL index
 * on it (see scripts/ensure-indexes.mjs) garbage-collects old hits, so a 24h
 * window never loses hits to a shorter global TTL (#211),
 * so there's no pruning logic here — `countDocuments` with a `$gte` cutoff is
 * always correct regardless of how stale the TTL cleanup is running behind.
 *
 * `opts` accepts one tier or several checked against the same hit log (e.g. a
 * short burst window plus a longer hourly one) — every hit is one real event,
 * so all tiers share a single insert rather than each tier maintaining its
 * own count and multiplying the insert rate.
 *
 * Not perfectly atomic under concurrent requests for the same key (a count
 * then an insert, not a single atomic op) — a burst of parallel requests can
 * overshoot the limit by a few. Accepted: this is an abuse-rate control on a
 * low-traffic personal app, not a hard billing quota.
 */
export async function isRateLimited(key: string, opts: RateLimitTier | RateLimitTier[]): Promise<boolean> {
  const db = await getDb()
  const coll = db.collection<RateLimitHit>(RATE_LIMIT_COLLECTION)
  const tiers = Array.isArray(opts) ? opts : [opts]
  const now = new Date()

  // Tiers are counted in parallel: one database round trip instead of one per tier.
  const counts = await Promise.all(
    tiers.map((tier) => coll.countDocuments({ key, ts: { $gte: new Date(now.getTime() - tier.windowMs) } })),
  )
  if (tiers.some((tier, i) => counts[i] >= tier.limit)) return true

  await coll.insertOne({ key, ts: now, expiresAt: new Date(now.getTime() + Math.max(...tiers.map((t) => t.windowMs))) })
  return false
}

/**
 * Best-effort client IP for rate-limit keys on routes with no session (e.g.
 * magic-auth) — Vercel sets x-forwarded-for; falls back to a shared bucket
 * key when absent (local dev, or a proxy that strips it) rather than throwing.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
