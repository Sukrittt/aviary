import { ObjectId } from 'mongodb'
import type { Experimental_EvaluationQuestion } from 'ai'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import type { Auth } from '@/lib/access'
import { runJev } from './ai/jev'
import type { AiCaller } from './ai/usage'

/**
 * Double-entry detection. Code finds the candidates (same amount, same payment
 * method, logged within WINDOW_MS of each other) so the common case costs
 * nothing; only differently-named candidates go to Jev. A hit is stored as
 * `duplicate_of` on the newer row and surfaced for review; nothing is ever
 * deleted here.
 *
 * Runs on create only, which also covers Mobile's offline queue: those rows
 * carry the timestamp from when they were logged, not when they synced.
 */

const WINDOW_MS = 30 * 60_000
// Jev only sees the few closest candidates; beyond that it's noise.
const MAX_ASKED = 3
// Measured against Jev, 2026-09-24, on same-amount pairs: clear repeats ("Groceries - DMart" /
// "dmart", "Uber to office" / "uber") scored 0.87-0.96, clear non-repeats ("Zomato lunch" /
// "Swiggy lunch", "Chai" / "Samosa") 0.03-0.08, and near-synonyms ("Petrol" / "Fuel", "Coffee" /
// "Coffee at Starbucks") about 0.71. Those last ones are usually repeats given the matching amount
// and time, and a false flag costs one "Keep both" tap, so the bar sits below them. "Coffee" /
// "Latte" (0.32) and "Medicines" / "Apollo pharmacy" (0.44) stay unflagged.
const MIN_PROBABILITY = 0.65

export interface DuplicateExpense {
  id: string
  item: string
  amount_inr: string
  timestamp: string
  payment_method?: string
}

// Code has already matched amount, payment method and time, so Jev judges only the names.
const QUESTIONS = {
  same: {
    type: 'boolean',
    instructions:
      'Two expense entries in a personal budget app have the same amount and were logged minutes apart: `first` and `second`. ' +
      'Do both names describe the same purchase (same merchant, same item, or one is a shorter/longer way of writing the other)? ' +
      'Answer no when they name different merchants, different items, or different kinds of spending.',
  },
} satisfies Record<string, Experimental_EvaluationQuestion>

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function duplicateCandidates(added: DuplicateExpense, others: DuplicateExpense[]): DuplicateExpense[] {
  const at = Date.parse(added.timestamp)
  const amount = Number(added.amount_inr)
  if (Number.isNaN(at) || !amount) return []
  return others
    .map((e) => ({ e, gap: Math.abs(Date.parse(e.timestamp) - at) }))
    .filter(({ e, gap }) =>
      e.id !== added.id &&
      gap <= WINDOW_MS &&
      Number(e.amount_inr) === amount &&
      (e.payment_method ?? 'bank') === (added.payment_method ?? 'bank'))
    .sort((a, b) => a.gap - b.gap)
    .map(({ e }) => e)
}

/** The id of the expense `added` most likely double-logs, or null. Never throws. */
export async function findDuplicateOf(added: DuplicateExpense, others: DuplicateExpense[], caller: AiCaller): Promise<string | null> {
  const candidates = duplicateCandidates(added, others)
  const same = candidates.find((e) => normalize(e.item) === normalize(added.item))
  if (same) return same.id

  const asked = candidates.slice(0, MAX_ASKED)
  if (asked.length === 0) return null

  // One request per candidate, each seeing only its own pair: that is the shape
  // the threshold was measured on (batching pairs into one state blurred them).
  const probabilities = await Promise.all(asked.map(async (e) => {
    try {
      const answers = await runJev({ first: e.item, second: added.item }, QUESTIONS, caller, 4_000)
      return answers.same.type === 'boolean' ? answers.same.probability : 0
    } catch (err) {
      console.warn('[duplicates] Jev unavailable, not flagging:', (err as Error).message)
      return 0
    }
  }))

  let bestId: string | null = null
  let bestP = MIN_PROBABILITY
  for (const [i, e] of asked.entries()) {
    if (probabilities[i] >= bestP) [bestId, bestP] = [e.id, probabilities[i]]
  }
  return bestId
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const toDuplicateExpense = (d: Record<string, unknown>): DuplicateExpense => ({
  id: String(d._id),
  item: String(d.item ?? ''),
  amount_inr: String(d.amount_inr ?? ''),
  timestamp: String(d.timestamp ?? ''),
  payment_method: String(d.payment_method ?? 'bank'),
})

/** Checks a just-created expense and stores `duplicate_of` on it when it double-logs another. Never throws. */
export async function flagIfDuplicate(auth: Auth, added: DuplicateExpense & { date: string }): Promise<string | null> {
  try {
    const coll = await getCollection('expenses', auth)
    const nearby = await coll
      .find({ date: { $in: [shiftDay(added.date, -1), added.date, shiftDay(added.date, 1)] } })
      .toArray()
    const duplicateOf = await findDuplicateOf(added, nearby.map(toDuplicateExpense), { userId: auth.userId, feature: 'duplicate' })
    if (!duplicateOf) return null
    // No version bump: this is a review marker, not an edit a client could conflict with.
    await coll.updateOne({ _id: new ObjectId(added.id) }, { $set: { duplicate_of: duplicateOf } })
    invalidate('expenses', auth.spaceId)
    return duplicateOf
  } catch (err) {
    console.warn('[duplicates] check failed:', (err as Error).message)
    return null
  }
}
