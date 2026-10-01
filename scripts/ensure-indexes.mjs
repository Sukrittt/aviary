// Creates the per-user indexes the multi-user data model needs. Idempotent —
// createIndex is a no-op when the index already exists.
//
// Run AFTER backfill-user-id.mjs: the unique compound indexes would fail on
// documents that still have no user_id. Run BEFORE a second user exists: they
// are what make the app's duplicate checks (one holding named X, one budget row
// per month+category) correct per-account rather than globally.
//
// Usage: node scripts/ensure-indexes.mjs
//
// Note: createIndex() only creates a NEW index — it errors (caught, logged as
// FAILED below) rather than reshaping an existing index whose options changed,
// e.g. the LIVE_ONLY partial filter added below. On a DB that already has the
// old plain-unique versions of budgets/categories/groups/holdings, drop them
// first (`db.<collection>.dropIndex(<name>)`) so this script can recreate them
// as partial indexes.
import { MongoClient } from 'mongodb'
import { loadEnv } from './lib/env.mjs'

loadEnv()

// Unique-except-archived: a soft-deleted row (lib/scoped.ts sets `deleted_at`
// instead of removing it, see PLAN.md "Soft Delete with Garbage Collection")
// must not hold its slot in a uniqueness check forever — a `partialFilterExpression`
// scopes the constraint to live rows only, so recreating a budget/category/
// group/holding after archiving the old one doesn't throw E11000.
const LIVE_ONLY = { partialFilterExpression: { deleted_at: null } }

const INDEXES = {
  expenses: [
    [{ user_id: 1, date: -1 }, {}],
    // Offline-created expenses carry a client-minted `client_id`; this makes a
    // retried create idempotent. Partial (not sparse) on purpose: every row has
    // user_id, so a sparse compound index would still index every legacy row
    // as client_id: null and the second one would violate uniqueness.
    [{ user_id: 1, client_id: 1 }, { unique: true, partialFilterExpression: { client_id: { $type: 'string' } } }],
  ],
  budgets: [[{ user_id: 1, month: 1, category: 1 }, { unique: true, ...LIVE_ONLY }]],
  categories: [
    [{ user_id: 1, name: 1 }, { unique: true, ...LIVE_ONLY }],
    [{ user_id: 1, group: 1, order: 1 }, {}],
  ],
  groups: [[{ user_id: 1, name: 1 }, { unique: true, ...LIVE_ONLY }]],
  holdings: [[{ user_id: 1, name: 1 }, { unique: true, ...LIVE_ONLY }]],
  holding_events: [[{ user_id: 1, timestamp: -1 }, {}]],
  subscriptions: [[{ user_id: 1, service: 1 }, {}]],
  // The nightly cron's query: every active recurrence whose next occurrence is
  // on or before today. No index on `item` — it's encrypted, so it can't be a
  // filter key; rows are addressed by `_id`.
  recurring_expenses: [[{ user_id: 1, status: 1, next_run_date: 1 }, {}]],
  push_tokens: [
    [{ token: 1 }, { unique: true }],
    [{ user_id: 1 }, {}],
  ],
  category_map_overrides: [[{ user_id: 1, word: 1 }, { unique: true }]],
  chat_sessions: [[{ user_id: 1, updatedAt: -1 }, {}]],
  // Weekly balance checks: the latest one is read on every Home load.
  balance_checks: [[{ user_id: 1, timestamp: -1 }, {}]],
  // TTL index: hits older than an hour (the longest window lib/rateLimit.ts
  // checks against) are garbage-collected automatically. Correctness never
  // depends on this running promptly — every check bounds by its own cutoff.
  // Cached money briefs. Looked up by _id, cleared by user_id whenever that
  // user writes an expense, budget, category, group, subscription or holding
  // (lib/ai/briefCache.ts). The TTL only reclaims documents for users who
  // stopped writing; correctness never waits on it.
  ai_brief: [
    [{ user_id: 1 }, {}],
    [{ builtAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 2 }],
  ],
  rate_limit_hits: [
    [{ key: 1, ts: -1 }, {}],
    [{ ts: 1 }, { expireAfterSeconds: 3600 }],
  ],
  // Send-log dedupe for Smart Notifications: the unique compound index is
  // what makes a repeat `insertOne` throw E11000 for an already-sent key.
  // The TTL index reclaims rows after 90 days — well past any lead-day or
  // digest window, so nothing correctness-relevant depends on its timing.
  notification_log: [
    [{ user_id: 1, key: 1 }, { unique: true }],
    [{ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }],
  ],
  // Current crossed-threshold level per user+month+category for Smart
  // Notifications — replaces "claimed forever" dedupe for threshold/overspend
  // pushes with a level that can drop (spending edited down) and rise again
  // (re-fires), see lib/notifications/thresholdState.ts.
  notification_threshold_state: [[{ user_id: 1, month: 1, category: 1 }, { unique: true }]],
  // User-visible export records — no TTL, these are a download history, not
  // a rate-limit ledger. One index for the monthly-quota count, one for the
  // past-exports list.
  exports: [
    [{ user_id: 1, month: 1, status: 1 }, {}],
    [{ user_id: 1, created_at: -1 }, {}],
  ],
  // Future scan-history screen's list query, plus a lookup from an expense
  // back to the scan it came from.
  // Admin page (app/admin): audit trail, newest first overall and per target user.
  admin_audit: [
    [{ at: -1 }, {}],
    [{ targetUserId: 1, at: -1 }, {}],
  ],
  // Per-call Gemini usage for /admin/ai; calls older than 180 days expire.
  ai_usage: [
    [{ user_id: 1, at: -1 }, {}],
    [{ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }],
  ],
  // Cron run history for /admin/jobs; runs older than 180 days expire.
  cron_runs: [
    [{ job: 1, startedAt: -1 }, {}],
    [{ startedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }],
  ],
  // Admin user list sorts and activity counts.
  users: [
    [{ createdAt: -1 }, {}],
    [{ lastSeenAt: -1 }, {}],
  ],
  bill_scans: [
    [{ user_id: 1, created_at: -1 }, {}],
    [{ user_id: 1, expense_id: 1 }, {}],
  ],
  // Selling access to Envelope (lib/billing/*). Note these are NOT the
  // `subscriptions` collection above — that one is a user's own recurring
  // expenses. `billing_accounts._id` is the WorkOS user id, so one trial per
  // identity is already enforced by the primary key.
  billing_accounts: [
    // The reminder job's query: trials ending inside the next few days.
    [{ trialEndsAt: 1 }, {}],
    // The retention job's query, sparse because most accounts have no deadline.
    [{ retentionDeadline: 1 }, { partialFilterExpression: { retentionDeadline: { $type: 'date' } } }],
  ],
  billing_subscriptions: [
    [{ userId: 1 }, {}],
    // One store purchase entitles exactly one account. Without this, a
    // restore on a second account would silently duplicate the entitlement.
    [{ provider: 1, environment: 1, storeTransactionId: 1 }, { unique: true }],
    // Reconciliation sweeps entitlements that have lapsed or are about to.
    [{ expiresAt: 1 }, {}],
  ],
  billing_events: [
    // Idempotent ingest: a duplicate webhook delivery throws E11000 instead
    // of applying a second state change.
    [{ provider: 1, environment: 1, eventId: 1 }, { unique: true }],
    [{ state: 1, receivedAt: 1 }, {}],
    // Reclaimed after 90 days — far past any provider retry window, so the
    // dedupe guarantee above still covers every delivery that can arrive.
    [{ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }],
  ],
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set')

  const client = new MongoClient(uri)
  await client.connect()
  try {
    const db = client.db()
    for (const [name, specs] of Object.entries(INDEXES)) {
      for (const [keys, options] of specs) {
        try {
          const created = await db.collection(name).createIndex(keys, options)
          console.log(`${name.padEnd(24)} ${created}`)
        } catch (err) {
          console.error(`${name.padEnd(24)} FAILED ${JSON.stringify(keys)}: ${err.message}`)
        }
      }
    }
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
