// One-off repair: recurring_expenses rows whose payment_method isn't one the
// route accepts ('bank' or 'credit_card'). A local seed script inserted
// 'Debit Card' and 'Bank Transfer' straight into prod on 2026-09-09, past the
// route's check, and the nightly cron failed on them every run from the first
// due date. The cron now reads such labels as 'bank' (paymentMethodOf in
// lib/recurringExpense.ts), but the app's edit screen sends the stored value
// back and PUT rejects it, so those rows can't be edited until repaired.
//
// Same mapping as paymentMethodOf: a credit card label becomes 'credit_card',
// anything else 'bank'. Only payment_method changes, and it isn't encrypted.
//
// Usage (.env.local points at dev, so name the database):
//   node scripts/repair-recurring-payment-methods.mjs --db expenses
//   node scripts/repair-recurring-payment-methods.mjs --db expenses --apply
import { MongoClient } from 'mongodb'
import { loadEnv, args } from './lib/env.mjs'

loadEnv()
const argv = args()
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set')
if (typeof argv.db !== 'string') throw new Error('--db <database name> is required')

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
try {
  const coll = client.db(argv.db).collection('recurring_expenses')
  const rows = await coll
    .find({ payment_method: { $exists: true, $nin: ['bank', 'credit_card'] } }, { projection: { user_id: 1, payment_method: 1, status: 1 } })
    .toArray()
  console.log(`${argv.apply ? 'Repairing' : 'Would repair'} ${rows.length} row(s) in ${argv.db}.recurring_expenses`)
  for (const row of rows) {
    const to = /^credit[\s_-]*card$/i.test(String(row.payment_method ?? '').trim()) ? 'credit_card' : 'bank'
    console.log(`  ${row._id} ${row.user_id} ${row.status}: ${JSON.stringify(row.payment_method)} -> ${to}`)
    // Filtered on the old value too, so a row edited since the read is left alone.
    if (argv.apply) await coll.updateOne({ _id: row._id, payment_method: row.payment_method }, { $set: { payment_method: to } })
  }
  if (!argv.apply) console.log('Dry run. Re-run with --apply to write.')
} finally {
  await client.close()
}
