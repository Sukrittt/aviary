import { NextResponse } from 'next/server'
import type { Auth } from '../access'
import { getDb } from '../mongodb'
import { getSystemSettings } from '../systemSettings'
import { AI_USAGE, type AiUsageDoc } from './usage'

/** Stable code clients can branch on, distinct from the burst rate limiter's plain 429. */
export const AI_ALLOWANCE_EXCEEDED = 'AI_ALLOWANCE_EXCEEDED'

const CACHE_MS = 60_000
// ponytail: per-instance 60s cache of each user's month-to-date spend, so a
// chatty user costs one aggregation a minute rather than one per request. The
// cap can overshoot by a minute of usage; per-call atomic accounting if it must not.
const spendCache = new Map<string, { usd: number; at: number }>()

/** First instant of the current calendar month, UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

async function monthlySpendUsd(userId: string, now: Date): Promise<number> {
  const hit = spendCache.get(userId)
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.usd
  const db = await getDb()
  const [row] = await db
    .collection<AiUsageDoc>(AI_USAGE)
    .aggregate<{ total: number }>([
      // Habit nudge copy is written for the user unasked, a few times ever: it
      // shouldn't eat into what they can spend on chat and scans.
      { $match: { user_id: userId, at: { $gte: monthStart(now) }, feature: { $ne: 'nudge' } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$costUsd', 0] } } } },
    ])
    .toArray()
  const usd = row?.total ?? 0
  spendCache.set(userId, { usd, at: now.getTime() })
  return usd
}

/**
 * 429 once a signed-in user has spent this month's AI allowance, else null.
 * Call after the kill-switch check in every Gemini-backed route.
 *
 * Applies to every account (trial and paid alike) — it is a cost control, not
 * a paywall — and never to the shared demo user, whose usage is one bucket for
 * all visitors and already has its own tighter rate limit.
 */
export async function aiAllowanceResponse(auth: Auth, now: Date = new Date()): Promise<NextResponse | null> {
  if (auth.readOnly) return null
  const cap = (await getSystemSettings()).aiMonthlyCostUsd
  if (cap === null) return null
  if ((await monthlySpendUsd(auth.userId, now)) < cap) return null
  return NextResponse.json(
    { error: "You've used this month's AI allowance. It resets on the 1st.", code: AI_ALLOWANCE_EXCEEDED },
    { status: 429 },
  )
}
