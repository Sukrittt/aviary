// Grants every existing onboarded user one fresh 30-day trial at the public
// subscriptions launch instant.
//
// Not counted from account creation, from the deploy, or from an old
// `onboardedAt` — pricing.md promises existing users a *fresh* 30 days, and
// anchoring to any historical date would hand some of them an already-dead
// trial on day one.
//
// Two cohorts, both ending up with the same fresh window:
//
//   1. Onboarded users with no billing account at all — granted a trial.
//   2. Users who onboarded *after the backend shipped but before launch*.
//      Their clock started at onboarding, weeks before subscriptions existed
//      as a product, so some of them would arrive at launch with a trial that
//      has already run out and be locked out on day one. Their window is
//      moved to the launch instant.
//
// Both are idempotent, and neither can restart a clock that legitimately ran:
// case 1 uses `$setOnInsert`, and case 2 is selected by `trialCohort:
// 'onboarding-v1' or 'onboarding-v2'` plus a start date before launch, then stamped
// 'legacy-launch-v1' — so a rerun matches nothing. A trial granted after the
// launch instant is never touched.
//
// Usage:
//   node scripts/billing-launch-migration.mjs --at 2026-10-01T00:00:00Z --dry-run
//   node scripts/billing-launch-migration.mjs --at 2026-10-01T00:00:00Z
//
// Run the dry run first and check the count against the admin user list.
// Run this BEFORE flipping system_settings.billing.enforced — with
// enforcement on and this unrun, every existing user is locked out.
import { MongoClient } from 'mongodb'
import { loadEnv, args } from './lib/env.mjs'

loadEnv()
const argv = args()
const DRY = Boolean(argv['dry-run'])
const TRIAL_DAYS = 30
const COHORT = 'legacy-launch-v1'

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set')
if (!argv.at) throw new Error('--at <ISO instant> is required — the launch instant every legacy trial starts from')
const startedAt = new Date(argv.at)
if (Number.isNaN(startedAt.getTime())) throw new Error(`--at is not a valid instant: ${argv.at}`)
const endsAt = new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
try {
  const db = client.db()
  // Deleted accounts are excluded: they are in a grace window awaiting purge,
  // and granting them a trial would resurrect billing state for a user who
  // asked to leave. Un-onboarded accounts are excluded too — completing
  // onboarding is what starts their clock, the normal way.
  const cohort = await db
    .collection('users')
    .find({ deleted_at: null, onboardedAt: { $nin: [null, undefined] } }, { projection: { _id: 1 } })
    .toArray()

  const existing = new Set(
    (await db.collection('billing_accounts').find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id),
  )
  const toGrant = cohort.filter((u) => !existing.has(u._id))

  // Trials that started before subscriptions were a product. See the header.
  // Both onboarding cohorts: a v2 (30-day) trial started before launch needs the same reset.
  const prelaunchFilter = { trialCohort: { $in: ['onboarding-v1', 'onboarding-v2'] }, trialStartedAt: { $lt: startedAt } }
  const toReset = await db.collection('billing_accounts').countDocuments(prelaunchFilter)

  console.log(`cohort: ${cohort.length} onboarded live user(s); ${existing.size} already have a billing account`)
  console.log(`trial window: ${startedAt.toISOString()} → ${endsAt.toISOString()} (${TRIAL_DAYS} days, cohort ${COHORT})`)

  if (DRY) {
    console.log(`would grant a fresh trial to ${toGrant.length} user(s)`)
    for (const u of toGrant.slice(0, 20)) console.log(`  ${u._id}`)
    if (toGrant.length > 20) console.log(`  … and ${toGrant.length - 20} more`)
    console.log(`would move ${toReset} pre-launch trial(s) onto the launch window`)
  } else if (toGrant.length > 0 || toReset > 0) {
    const now = new Date()
    if (toReset > 0) {
      const reset = await db
        .collection('billing_accounts')
        .updateMany(prelaunchFilter, { $set: { trialStartedAt: startedAt, trialEndsAt: endsAt, trialCohort: COHORT } })
      console.log(`moved ${reset.modifiedCount} pre-launch trial(s) onto the launch window`)
    }
    if (toGrant.length === 0) {
      console.log('no new trials to grant')
    } else {
    const result = await db.collection('billing_accounts').bulkWrite(
      toGrant.map((u) => ({
        updateOne: {
          filter: { _id: u._id },
          update: {
            $setOnInsert: {
              _id: u._id,
              trialStartedAt: startedAt,
              trialEndsAt: endsAt,
              trialCohort: COHORT,
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    )
    console.log(`granted ${result.upsertedCount} trial(s); ${toGrant.length - result.upsertedCount} already existed`)
    }
  } else {
    console.log('nothing to grant')
  }
} finally {
  await client.close()
}
