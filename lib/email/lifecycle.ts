import { createHash } from 'node:crypto'
import { after } from 'next/server'
import type { Db } from 'mongodb'
import { getDb } from '@/lib/mongodb'
import { displayName, type UserDoc } from '@/lib/users'
import { getAccess } from '@/lib/billing/service'
import { getPlanPrices } from '@/lib/billing/razorpay'
import { getSystemSettings } from '@/lib/systemSettings'
import { formatPrice } from '@/src/components/billing/copy'
import type { EmailMessage } from './resend'
import { SUPPORT_EMAIL } from './transactionalTemplate'
import { EMAIL_OUTBOX, LEADS, sendOutbox, type LeadDoc, type OutboxEmail } from './outbox'
import { EVERGREEN, nextLeadStep, nextUserStep, type LeadStep } from './lifecycleSteps'
import { leadEmail, userEmail, type UserEmailContext } from './lifecycleTemplate'
import { confirmUrl, preferencesUrl, unsubscribeHeaders } from './links'

/**
 * Trial nudges, lead follow-ups and the evergreen "let it run" emails, queued
 * into `email_outbox` just before the same cron run sends them. The outbox
 * rows are the history: `_id` is `lifecycle/<user>/<step>` or
 * `lead/<lead>/<step>`, so each step can only ever be queued once per person.
 */

const DAY = 86_400_000

/** "Sukrit from Aviary <hello@…>": same address as every other email, a person's name on it. */
function lifecycleFrom(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || 'Aviary <hello@useaviary.com>'
  const address = from.match(/<([^>]+)>/)?.[1] ?? from
  return `Sukrit from Aviary <${address}>`
}

function message(to: string, content: { subject: string; html: string; text: string }, headers?: Record<string, string>): EmailMessage {
  return { from: lifecycleFrom(), to: [to], reply_to: process.env.RESEND_REPLY_TO?.trim() || SUPPORT_EMAIL, ...content, ...(headers && { headers }) }
}

async function queue(db: Db, { _id, ...row }: Omit<OutboxEmail, 'delivery' | 'kind'>, msg: EmailMessage, now: Date) {
  await db.collection<OutboxEmail>(EMAIL_OUTBOX).updateOne({ _id }, { $setOnInsert: {
    ...row, kind: 'lifecycle',
    delivery: { state: 'pending', queuedAt: now, nextAttemptAt: now, attempts: 0, message: msg },
  } }, { upsert: true })
}

const isTip = (step: string) => (EVERGREEN as readonly string[]).includes(step)

async function rupeePrices(): Promise<UserEmailContext['prices']> {
  try {
    const plans = await getPlanPrices()
    const monthly = plans?.find(p => p.period === 'monthly'), yearly = plans?.find(p => p.period === 'yearly')
    if (!monthly || !yearly || monthly.currency !== 'INR') return null
    const saving = monthly.amount * 12 - yearly.amount
    return { monthly: formatPrice(monthly.amount, 'INR'), yearly: formatPrice(yearly.amount, 'INR'), saving: saving > 0 ? formatPrice(saving, 'INR') : null }
  } catch {
    return null
  }
}

/**
 * Decide and freeze up to `limit` lifecycle emails, trial-end notices first
 * and evergreen last, so a backlog of tips never holds up a deadline.
 *
 * ponytail: scans every live account and reads its access each run. Fine
 * for a few thousand accounts; past that, store the next-due instant on the
 * user and query by it.
 */
export async function prepareLifecycleEmails(db: Db, now: Date, limit: number): Promise<number> {
  const outbox = db.collection<OutboxEmail>(EMAIL_OUTBOX)
  const room = limit - await outbox.countDocuments({ kind: 'lifecycle', 'delivery.state': { $in: ['pending', 'sending'] } })
  if (room <= 0) return 0

  const history = new Map<string, { sent: string[]; lastAt: Date | null }>()
  const rows = outbox.aggregate<{ _id: string; sent: string[]; lastAt: Date }>([
    { $match: { kind: 'lifecycle' } },
    { $group: { _id: { $ifNull: ['$user_id', { $concat: ['lead:', '$lead_id'] }] }, sent: { $push: '$step' }, lastAt: { $max: '$delivery.queuedAt' } } },
  ])
  for await (const row of rows) history.set(row._id, row)
  const past = (id: string) => history.get(id) ?? { sent: [], lastAt: null }

  const due: { priority: number; build: () => Promise<void> }[] = []
  const users = await db.collection<UserDoc>('users').find({ deleted_at: null, emailVerified: { $ne: false } }, {
    projection: { email: 1, name: 1, firstName: 1, lastName: 1, createdAt: 1, timezone: 1, currencyCode: 1, emailOptOutAt: 1 },
  }).toArray()
  const expenses = db.collection('expenses')
  for (const user of users) {
    const { sent, lastAt } = past(user._id)
    // Opted out and already told about the trial end: there's nothing left to send.
    if (user.emailOptOutAt && sent.includes('trial-end')) continue
    const access = await getAccess(user._id, now)
    const live = { user_id: user._id, deleted_at: null }
    const spends = access.mode === 'trial' ? await expenses.countDocuments(live) : 0
    const step = nextUserStep({
      now, createdAt: user.createdAt ?? new Date(0), mode: access.mode, enforced: access.enforced,
      trialStartedAt: access.trialStartedAt ? new Date(access.trialStartedAt) : null,
      trialEndsAt: access.trialEndsAt ? new Date(access.trialEndsAt) : null,
      spends, optedOut: Boolean(user.emailOptOutAt), sent, lastAt,
    })
    if (!step) continue
    due.push({ priority: step === 'trial-end' ? 0 : isTip(step) ? 2 : 1, build: async () => {
      const recentSpend = step === 'trial-end' && Boolean(await expenses.findOne({ ...live, date: { $gte: new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10) } }, { projection: { _id: 1 } }))
      const inRupees = (user.currencyCode ?? 'INR') === 'INR'
      const content = userEmail(step, {
        name: displayName(user), mode: access.mode, spends, recentSpend, timezone: user.timezone,
        trialEndsAt: access.trialEndsAt ? new Date(access.trialEndsAt) : null,
        prices: step === 'trial-end' && inRupees ? await rupeePrices() : null,
        firstTip: isTip(step) && !sent.some(isTip),
        unsubscribeUrl: preferencesUrl(`u:${user._id}`),
      })
      await queue(db, { _id: `lifecycle/${user._id}/${step}`, user_id: user._id, step }, message(user.email, content, step === 'trial-end' ? undefined : unsubscribeHeaders(`u:${user._id}`)), now)
    } })
  }

  // Someone who signed up with their lead email gets the account emails instead.
  const accounts = new Set(users.map(u => u.email.toLowerCase()))
  const leads = await db.collection<LeadDoc>(LEADS).find({ confirmedAt: { $ne: null }, optedOutAt: null }).toArray()
  for (const lead of leads) {
    if (accounts.has(lead.email)) continue
    const { sent, lastAt } = past(`lead:${lead._id}`)
    const step = nextLeadStep({ now, createdAt: lead.createdAt, confirmed: true, optedOut: false, sent, lastAt })
    if (!step) continue
    due.push({ priority: isTip(step) ? 2 : 1, build: () => queueLead(db, lead, step, sent, now) })
  }

  const chosen = due.sort((a, b) => a.priority - b.priority).slice(0, room)
  for (const item of chosen) await item.build()
  return chosen.length
}

async function queueLead(db: Db, lead: LeadDoc, step: LeadStep, sent: string[], now: Date, id = `lead/${lead._id}/${step}`) {
  const content = leadEmail(step, {
    plan: lead.plan, firstTip: isTip(step) && !sent.some(isTip),
    confirmUrl: confirmUrl(lead._id), unsubscribeUrl: preferencesUrl(`l:${lead._id}`),
  })
  await queue(db, { _id: id, lead_id: lead._id, step }, message(lead.email, content, unsubscribeHeaders(`l:${lead._id}`)), now)
}

export const leadId = (email: string) => createHash('sha256').update(email).digest('hex').slice(0, 32)

/**
 * Record a salary-planner lead and queue the plan they asked for. At most one
 * plan email per address per day, so the public form can't be used to flood
 * someone. Nothing else follows until they click the link inside it.
 */
export async function queueLeadPlan(db: Db, email: string, plan: LeadDoc['plan'], now = new Date()): Promise<string> {
  const _id = leadId(email)
  const leads = db.collection<LeadDoc>(LEADS)
  await leads.updateOne({ _id }, {
    $setOnInsert: { email, source: 'salary-planner', createdAt: now, confirmedAt: null, optedOutAt: null },
    $set: { plan },
  }, { upsert: true })
  const lead = (await leads.findOne({ _id }))!
  const rowId = `lead/${_id}/plan/${now.toISOString().slice(0, 10)}`
  await queueLead(db, lead, 'plan', [], now, rowId)
  return rowId
}

/** Send one just-queued row after the response, like the subscription emails. The cron retries anything this misses. */
export function scheduleOutboxSend(rowId: string): void {
  try {
    after(async () => {
      try { await sendOutbox(await getDb(), { _id: rowId }, 1) } catch { console.error('[lifecycle-email] worker failed; cron will retry') }
    })
  } catch { console.error('[lifecycle-email] scheduling failed; cron will retry') }
}

/** The cron's lifecycle bucket: queue what's due (when switched on), then send. */
export async function retryLifecycleEmails(limit = 15) {
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.CRON_SECRET)
  if (!configured) return { sent: 0, skipped: 0, failed: 0, needs_review: 0, queued: 0, configured }
  const db = await getDb()
  const queued = (await getSystemSettings()).lifecycleEmails ? await prepareLifecycleEmails(db, new Date(), limit) : 0
  // Deadline notices go first, so a backlog of retried tips can't push one to tomorrow.
  const notices = await sendOutbox(db, { kind: 'lifecycle', step: 'trial-end' }, limit)
  const rest = await sendOutbox(db, { kind: 'lifecycle', step: { $ne: 'trial-end' } }, Math.max(0, limit - notices.sent - notices.failed - notices.skipped))
  return { sent: notices.sent + rest.sent, skipped: notices.skipped + rest.skipped, failed: notices.failed + rest.failed, needs_review: notices.needs_review + rest.needs_review, queued, configured }
}
