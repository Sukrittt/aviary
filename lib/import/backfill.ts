import { ObjectId } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { createExpense } from '@/lib/createExpense'
import { addIncome } from '@/lib/income'
import { sendPushNotification } from '@/lib/push'
import { sendEmail } from '@/lib/email/resend'
import { transactionalTemplate } from '@/lib/email/transactionalTemplate'
import { displayName, type UserDoc } from '@/lib/users'
import type { AppId } from './presets'
import { importsCollection, loadImport, type BookingRow, type ImportDoc } from './service'

/**
 * Books a committed import's rows, oldest first, through the same paths a
 * user's own logging takes, so the Credit Card envelope and each month's
 * income row move as they would have. Runs in passes that fit a serverless
 * request: the commit's `after()`, `/api/import/continue` from the banner's
 * poll, and the hourly sweep. One pass at a time per import, by a lease on
 * the doc (same shape as the recurring scan's lock); `client_id` per row
 * means a pass that dies mid-chunk can be rerun without doubling a row.
 */

const CHUNK = 50
/** Outlives a 60 s `maxDuration`, so a pass killed at its ceiling frees the import within seconds of it. */
const LEASE_MS = 70_000
const FAILED_CHUNKS_TO_STOP = 3

export type PassResult = 'leased' | 'progress' | 'done' | 'failed'

const APP_NAMES: Record<AppId, string> = {
  moneymanager: 'Money Manager', monefy: 'Monefy', wallet: 'Wallet', spendee: 'Spendee',
  ynab: 'YNAB', goodbudget: 'Goodbudget', generic: 'your file',
}

async function bookRow(auth: Auth, importId: string, row: BookingRow, index: number): Promise<void> {
  const common = { client_id: `import:${importId}:${index}`, import_id: importId, account_id: row.account_id }
  if (row.kind === 'expense') {
    await createExpense(auth, {
      ...common, item: row.item, amount_inr: String(row.amount), category: row.category, notes: row.notes, date: row.date,
      source: 'import', notify: false,
    })
  } else {
    await addIncome(auth, {
      ...common, date: row.date, amount: row.amount, label: row.item, notes: row.notes, source: 'import', counted: row.counted ?? 'extra',
    })
  }
}

function describe(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500)
}

/** Runs chunks until `deadlineMs`, then stops cleanly. `'leased'` when another pass holds the import or it isn't importing. */
export async function runImportPass(auth: Auth, importId: string, deadlineMs: number): Promise<PassResult> {
  const coll = await importsCollection(auth)
  const _id = new ObjectId(importId)
  const token = new ObjectId().toHexString()
  const now = Date.now()
  const taken = await coll.updateOne(
    { _id, status: 'importing', $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }] },
    { $set: { lockedUntil: now + LEASE_MS, token } },
  )
  if (taken.matchedCount !== 1) return 'leased'
  try {
    const doc = await loadImport(auth, importId)
    const rows = JSON.parse(doc.rows) as BookingRow[]
    let { cursor, failed, streak, streak_start: streakStart } = doc
    while (cursor < rows.length && Date.now() < deadlineMs) {
      const chunk = rows.slice(cursor, cursor + CHUNK)
      let chunkFailed = 0
      let lastError: unknown = null
      for (const [i, row] of chunk.entries()) {
        try {
          await bookRow(auth, importId, row, cursor + i)
        } catch (err) {
          chunkFailed++
          lastError = err
        }
      }
      if (chunkFailed === chunk.length) {
        if (streak === 0) streakStart = cursor
        streak++
      } else {
        streak = 0
      }
      cursor += chunk.length
      failed += chunkFailed
      const set: Partial<ImportDoc> = { cursor, done: cursor, failed, streak, streak_start: streakStart, lockedUntil: Date.now() + LEASE_MS }
      if (lastError) {
        set.last_error = describe(lastError)
        console.error('import: rows failed for', auth.userId, importId, lastError)
      }
      if (streak >= FAILED_CHUNKS_TO_STOP) {
        await coll.updateOne({ _id, token }, { $set: { ...set, status: 'failed', finished_at: new Date() } })
        await notifyOnce(auth, { ...doc, ...set }, 'failed')
        return 'failed'
      }
      const kept = await coll.updateOne({ _id, token }, { $set: set })
      if (kept.matchedCount !== 1) return 'leased'
    }
    if (cursor < rows.length) return 'progress'
    await coll.updateOne({ _id, token }, { $set: { status: 'done', finished_at: new Date() } })
    if (rows.length > 0) await notifyOnce(auth, { ...doc, cursor, done: cursor, failed }, 'done')
    return 'done'
  } finally {
    await coll.updateOne({ _id, token }, { $set: { lockedUntil: 0 } })
  }
}

/**
 * Starts a failed import again from where its run of failing chunks began.
 * Rows before that stay; rows in it are retried, and `client_id` keeps any
 * that did land from doubling.
 */
export async function retryImport(auth: Auth, importId: string): Promise<boolean> {
  const doc = await loadImport(auth, importId)
  if (doc.status !== 'failed') return false
  const rewound = doc.cursor - doc.streak_start
  const result = await (await importsCollection(auth)).updateOne(
    { _id: doc._id, status: 'failed' },
    { $set: { status: 'importing', cursor: doc.streak_start, done: doc.streak_start, failed: Math.max(0, doc.failed - rewound), streak: 0, lockedUntil: 0, notified_at: null } },
  )
  return result.matchedCount === 1
}

function copyFor(doc: Pick<ImportDoc, 'app' | 'total' | 'failed'>, outcome: 'done' | 'failed') {
  const app = APP_NAMES[doc.app] ?? APP_NAMES.generic
  if (outcome === 'failed') {
    return { subject: 'Your history didn’t all make it in', body: 'We couldn’t bring in all of your history. Check your connection and try again.' }
  }
  const booked = doc.total - doc.failed
  const n = (x: number) => x.toLocaleString('en-US')
  return {
    subject: 'Your history’s in',
    body: doc.failed
      ? `${n(booked)} of your ${n(doc.total)} spends and paydays from ${app} are in Aviary. Open the app to pick up where you left off.`
      : `All ${n(doc.total)} spends and paydays from ${app} are in Aviary. Open the app to pick up where you left off.`,
  }
}

/** Tells the user once, guarded by `notified_at`: a push when they have a device, an email either way. */
async function notifyOnce(auth: Auth, doc: ImportDoc, outcome: 'done' | 'failed'): Promise<void> {
  const claimed = await (await importsCollection(auth)).updateOne({ _id: doc._id, notified_at: null }, { $set: { notified_at: new Date() } })
  if (claimed.matchedCount !== 1) return
  const { subject, body } = copyFor(doc, outcome)
  await sendPushNotification({ userId: auth.userId, title: subject, body, data: { url: '/expense' } }).catch((err) => {
    console.error('import: push failed for', auth.userId, err)
  })
  const user = await (await getDb()).collection<UserDoc>('users').findOne({ _id: auth.userId }, { projection: { email: 1, name: 1, firstName: 1, lastName: 1 } })
  if (!user?.email) return
  const mail = transactionalTemplate({
    subject, name: displayName(user), paragraphs: [body], cta: 'Open Aviary', url: 'https://useaviary.com/expense',
    reason: 'You’re getting this because you brought your history into Aviary.',
  })
  await sendEmail(
    { from: process.env.RESEND_FROM_EMAIL?.trim() || 'Aviary <hello@useaviary.com>', to: [user.email], ...mail },
    `import-${outcome}:${String(doc._id)}`,
  ).catch((err) => console.error('import: email failed for', auth.userId, err))
}

/**
 * This deployment's own address, from what Vercel sets, never from a request:
 * a forged Host would otherwise receive the cron secret. Null off Vercel,
 * where the banner and the sweep carry an import instead.
 */
function selfOrigin(): string | null {
  const host = process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL
  return host ? `https://${host}` : null
}

/**
 * Asks this deployment to run the next pass in a fresh invocation, so an
 * import keeps going with no tab open instead of waiting for the hourly
 * sweep. Never throws: a broken chain just leaves the sweep to pick it up.
 */
export async function chainPass(userId: string, importId: string): Promise<void> {
  const secret = process.env.CRON_SECRET
  const origin = selfOrigin()
  if (!secret || !origin) return
  try {
    await fetch(`${origin}/api/cron/import-pass`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, importId }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch (err) {
    console.error('import: chaining the next pass failed for', userId, importId, err)
  }
}

/** One pass, then the next one queued if this one ran out of time. For `after()` callbacks. */
export async function passAndChain(auth: Auth, importId: string, deadlineMs: number): Promise<void> {
  try {
    if ((await runImportPass(auth, importId, deadlineMs)) === 'progress') await chainPass(auth.userId, importId)
  } catch (err) {
    console.error('import: pass failed for', auth.userId, importId, err)
  }
}

/**
 * The hourly sweep, for imports whose chain broke (a pass died, a deploy
 * landed): a pass for each import whose lease ran out. Cross-tenant on
 * purpose, like the other crons; each pass itself runs scoped to its user.
 * With a cron secret each one starts its own chain, so they don't queue
 * behind each other in this one invocation.
 */
export async function sweepImports(deadlineMs: number): Promise<number> {
  const stale = await (await getDb()).collection('imports')
    .find({ status: 'importing', lockedUntil: { $lte: Date.now() }, deleted_at: null }, { projection: { _id: 1, user_id: 1 } })
    .limit(20)
    .toArray()
  let passes = 0
  for (const doc of stale) {
    if (Date.now() >= deadlineMs) break
    const auth = { userId: String(doc.user_id), readOnly: false, sessionId: null }
    try {
      if (process.env.CRON_SECRET && selfOrigin()) {
        await chainPass(auth.userId, String(doc._id))
        passes++
      } else if ((await runImportPass(auth, String(doc._id), deadlineMs)) !== 'leased') passes++
    } catch (err) {
      console.error('import: sweep pass failed for', doc.user_id, doc._id, err)
    }
  }
  return passes
}
