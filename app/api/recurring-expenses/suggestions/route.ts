import { ObjectId } from 'mongodb'
import { getAuth, readOnlyGuard, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { error, getCollection, json, readBody } from '@/lib/http'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'
import { isRateLimited } from '@/lib/rateLimit'
import { getBudgetCurrency, nowForUser } from '@/lib/userCurrency'
import { buildCandidates, DETECTION_VERSION, fingerprint, nextSuggestedDate, normalizeItem, scanWindow, type DetectionDecision, type DetectionFrequency, type RecurringCandidate } from '@/lib/recurringDetection'
import { evaluateRecurring } from '@/lib/ai/recurringDetection'
import type { RecurringScan, RecurringSuggestion, ScanMonths } from '@/src/types/recurringSuggestions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const COLLECTION = 'recurring_detection'
const BATCH_SIZE = 12
const CONCURRENCY = 3
const MAX_ROWS = 10000
const EXPENSE_PROJECTION = { _id: 1, version: 1, date: 1, item: 1, description: 1, amount_inr: 1, amount: 1, category: 1, payment_method: 1, notes: 1, source: 1 }
// Built-in _id uniqueness provides a per-user, cross-instance lock without a migration.
const documentId = (auth: Auth, key: string) => new ObjectId(fingerprint([auth.spaceId, key]).slice(0, 24))
const snapshotId = (auth: Auth, months: ScanMonths) => documentId(auth, `snapshot:${DETECTION_VERSION}:${months}`)
const parseMonths = (value: unknown): ScanMonths | null => value === undefined || value === null ? 6 : value === 1 || value === 3 || value === 6 || value === 12 ? value : null
const isTrackedSubscription = (row: Record<string, unknown>) => !/^cancel/i.test(String(row.status ?? 'active'))

type Evidence = { id: string; version: number; date: string }
type Snapshot = { scan: RecurringScan; currency: string; evidence: Record<string, Evidence[]> }
type Cache = Awaited<ReturnType<typeof getCollection>>

async function loadHistory(auth: Auth, months: ScanMonths, cache: Cache) {
  const [{ date: today }, currency, expenses, recurring, subscriptions] = await Promise.all([
    nowForUser(auth.userId), getBudgetCurrency(auth), getCollection('expenses', auth),
    getCollection('recurring_expenses', auth), getCollection('subscriptions', auth),
  ])
  const windowStart = scanWindow(today, months)
  const [rows, schedules, services] = await Promise.all([
    expenses.find({ date: { $gte: windowStart, $lte: today } }, { projection: EXPENSE_PROJECTION }).limit(MAX_ROWS + 1).toArray(),
    recurring.find({}, { projection: { item: 1, suggestion_id: 1 } }).toArray(),
    subscriptions.find({}, { projection: { service: 1, suggestion_id: 1, status: 1 } }).toArray(),
  ])
  if (rows.length > MAX_ROWS) throw new Error('SCAN_TOO_LARGE')
  const trackedServices = services.filter(isTrackedSubscription)
  const candidates = buildCandidates(rows, [...schedules.map(r => String(r.item ?? '')), ...trackedServices.map(r => String(r.service ?? ''))], currency)
  const ids = candidates.map(c => documentId(auth, c.fingerprint))
  const saved = ids.length ? await cache.find({ _id: { $in: ids } }).toArray() : []
  return { today, windowStart, currency, candidates, results: new Map(saved.map(r => [String(r._id), r])), accepted: new Set([...schedules, ...trackedServices].map(r => String(r.suggestion_id ?? '')).filter(Boolean)) }
}

function makeSnapshot(ctx: Awaited<ReturnType<typeof loadHistory>>, auth: Auth, failed: number): Snapshot {
  const suggestions: RecurringSuggestion[] = []
  const evidence: Snapshot['evidence'] = {}
  let remaining = 0
  for (const candidate of ctx.candidates) {
    const id = String(documentId(auth, candidate.fingerprint))
    const saved = ctx.results.get(id)
    if (!saved) { remaining++; continue }
    if (saved.dismissed || ctx.accepted.has(id) || !saved.decision) continue
    const decision = saved.decision as NonNullable<DetectionDecision>
    const last = candidate.payments.at(-1)!
    suggestions.push({
      id, kind: decision.pattern, dates: candidate.payments.slice(-3).map(r => r.date), occurrences: candidate.payments.length,
      variableAmount: candidate.payments.some(r => r.amount !== last.amount),
      input: { item: last.item, amount_inr: String(last.amount), category: last.category, payment_method: last.paymentMethod,
        frequency: decision.frequency, start_date: nextSuggestedDate(last.date, decision.frequency, ctx.today) },
    })
    evidence[id] = candidate.payments.map(({ id, version, date }) => ({ id, version, date }))
  }
  return { currency: ctx.currency, evidence, scan: { suggestions, remaining, failed, scannedAt: new Date().toISOString(), windowStart: ctx.windowStart, windowEnd: ctx.today } }
}

// At most three requests in flight. A shared deadline leaves time to save partial
// results before the route timeout; unfinished patterns remain retryable.
async function evaluateBatch(work: RecurringCandidate[], run: (candidate: RecurringCandidate) => Promise<void>) {
  let cursor = 0
  let failed = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, async () => {
    while (cursor < work.length) {
      const candidate = work[cursor++]
      try { await run(candidate) } catch { failed++ }
    }
  }))
  return failed
}

function scanError(err: unknown) {
  if (err instanceof Error && err.message === 'SCAN_TOO_LARGE') {
    return error('More than 10,000 expenses in this period. Choose a shorter scan period and try again.', 422)
  }
  console.error('recurring suggestions failed', err)
  return error('Could not scan recurring expenses. Please try again.', 502)
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const value = new URL(req.url).searchParams.get('months')
  const months = parseMonths(value === null ? undefined : Number(value))
  if (!months) return error('Scan period must be 1, 3, 6 or 12 months')
  try {
    const [cache, { date: today }] = await Promise.all([getCollection(COLLECTION, auth), nowForUser(auth.userId)])
    const doc = await cache.findOne({ _id: snapshotId(auth, months) })
    if (typeof doc?.snapshot !== 'string') {
      return json({ suggestions: [], remaining: 0, scannedAt: null, windowStart: scanWindow(today, months), windowEnd: today } satisfies RecurringScan)
    }
    const snapshot: Snapshot = JSON.parse(doc.snapshot)
    if (!snapshot.scan.suggestions.length) return json(snapshot.scan)
    const [currency, expenses, recurring, subscriptions] = await Promise.all([
      getBudgetCurrency(auth), getCollection('expenses', auth), getCollection('recurring_expenses', auth), getCollection('subscriptions', auth),
    ])
    if (currency !== snapshot.currency) return json({ ...snapshot.scan, suggestions: [], stale: true })
    const ids = Object.values(snapshot.evidence).flat().map(e => new ObjectId(e.id))
    // Only ids/versions backing saved suggestions, not expense text or the whole history.
    const [rows, schedules, services, decisions] = await Promise.all([
      expenses.find({ _id: { $in: ids } }, { projection: { _id: 1, version: 1 } }).toArray(),
      recurring.find({}, { projection: { item: 1, suggestion_id: 1 } }).toArray(),
      subscriptions.find({}, { projection: { service: 1, suggestion_id: 1, status: 1 } }).toArray(),
      cache.find({ _id: { $in: snapshot.scan.suggestions.map(s => new ObjectId(s.id)) } }).toArray(),
    ])
    const versions = new Map(rows.map(r => [String(r._id), Number(r.version ?? 0)]))
    const trackedServices = services.filter(isTrackedSubscription)
    const tracked = new Set([...schedules.map(r => String(r.item ?? '')), ...trackedServices.map(r => String(r.service ?? ''))].map(normalizeItem))
    const accepted = new Set([...schedules, ...trackedServices].map(r => String(r.suggestion_id ?? '')).filter(Boolean))
    const dismissed = new Set(decisions.filter(r => r.dismissed).map(r => String(r._id)))
    let stale = false
    const suggestions = snapshot.scan.suggestions.filter(s => {
      if (dismissed.has(s.id) || accepted.has(s.id) || tracked.has(normalizeItem(s.input.item))) return false
      const evidence = snapshot.evidence[s.id]
      if (!evidence?.length || evidence.some(e => versions.get(e.id) !== e.version || e.date < scanWindow(today, months))) {
        stale = true
        return false
      }
      return true
    }).map(s => ({ ...s, input: { ...s.input, start_date: nextSuggestedDate(s.dates.at(-1)!, s.input.frequency as DetectionFrequency, today) } }))
    return json({ ...snapshot.scan, suggestions, stale })
  } catch (err) { return scanError(err) }
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard
  const months = parseMonths((await readBody(req)).months)
  if (!months) return error('Scan period must be 1, 3, 6 or 12 months')
  try {
    const cache = await getCollection(COLLECTION, auth)
    const lockId = documentId(auth, 'scan-meta')
    const token = new ObjectId().toHexString()
    try {
      await cache.updateOne({ _id: lockId, $or: [{ lockedUntil: { $lte: Date.now() } }, { lockedUntil: { $exists: false } }] },
        { $set: { lockedUntil: Date.now() + 90_000, token } }, { upsert: true })
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return error('A scan is already running. Try again shortly.', 409)
      throw err
    }
    try {
      // Exactly one history read, after taking the lease. No second read to build the response.
      const ctx = await loadHistory(auth, months, cache)
      const work = ctx.candidates.filter(c => !ctx.results.has(String(documentId(auth, c.fingerprint)))).slice(0, BATCH_SIZE)
      let failed = 0
      if (work.length) {
        const aiOff = await aiDisabledResponse()
        if (aiOff) return aiOff
        const allowance = await aiAllowanceResponse(auth)
        if (allowance) return allowance
        if (await isRateLimited(`recurring-scan:${auth.userId}`, [{ windowMs: 60_000, limit: 3 }, { windowMs: 3600_000, limit: 10 }])) return error('Too many scans. Please try again later.', 429)
        const deadline = AbortSignal.timeout(35_000)
        failed = await evaluateBatch(work, async candidate => {
          deadline.throwIfAborted()
          const decision = await evaluateRecurring(candidate, { userId: auth.userId, feature: 'suggest' }, deadline)
          const _id = documentId(auth, candidate.fingerprint)
          await cache.updateOne({ _id }, { $set: { decision, evaluatedAt: new Date().toISOString() } }, { upsert: true })
          ctx.results.set(String(_id), { _id, decision })
        })
      }
      // Refresh only small decision records, preserving dismissals made during this scan.
      const ids = ctx.candidates.map(c => documentId(auth, c.fingerprint))
      if (ids.length) {
        const records = await cache.find({ _id: { $in: ids } }).toArray()
        ctx.results = new Map(records.map(r => [String(r._id), r]))
      }
      const snapshot = makeSnapshot(ctx, auth, failed)
      await cache.updateOne({ _id: snapshotId(auth, months) }, { $set: { snapshot: JSON.stringify(snapshot) } }, { upsert: true })
      return json(snapshot.scan)
    } finally {
      await cache.updateOne({ _id: lockId, token }, { $set: { lockedUntil: 0 } })
    }
  } catch (err) { return scanError(err) }
}

export async function PATCH(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PATCH')
  if (guard) return guard
  const body = await readBody(req)
  if (typeof body.id !== 'string' || !ObjectId.isValid(body.id)) return error('Valid suggestion id required')
  const cache = await getCollection(COLLECTION, auth)
  const updated = await cache.updateOne({ _id: new ObjectId(body.id), decision: { $ne: null } }, { $set: { dismissed: true } })
  if (!updated.matchedCount) return error('Suggestion not found', 404)
  return json({ ok: true })
}
