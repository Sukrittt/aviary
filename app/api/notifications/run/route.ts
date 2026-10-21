import { formatMoney } from '@/src/lib/currencies'
import { timingSafeEqual, createHash } from 'node:crypto'
import type { Db } from 'mongodb'
import { json, nowIn, getCollection } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { jobAuth, liveSpaces, spacesToRun } from '@/lib/spaces'
import { buildExpenseContext } from '@/lib/ai/expenseContext'
import { buildNotifications, prefsFor, weekRecapNotification, weekRecapTeaserNotification, wrappedNotification } from '@/lib/notifications/rules'
import { claim, claimAndSend, unclaim } from '@/lib/notifications/deliver'
import { currentEdition, editionStatus } from '@/lib/wrapped'
import type { UserDoc } from '@/lib/users'
import { hiddenFeatures } from '@/src/lib/features'
import { computeWeekRecap, learningDay, onboardedDate, recapDue, type RecapRow } from '@/lib/weekRecap'
import { EXPENSE_HEADERS, toRow } from '@/lib/models'
import { applyHoldingAction } from '@/lib/holdings'
import { isDueToday, isDueTomorrow, tomorrowOf } from '@/lib/holdingRecurrence'
import { isSubscriptionDueToday } from '@/lib/subscriptions'
import { applySubscriptionExpense } from '@/lib/subscriptionExpense'
import { occurrencesDue, isExpired, advance, paymentMethodOf } from '@/lib/recurringExpense'
import { runRecurringIncomes } from '@/lib/income'
import { createExpense } from '@/lib/createExpense'
import { expenseInputError } from '@/lib/inputValidation'
import { notifyThresholdCrossed } from '@/lib/notifications/instant'
import { sendPushNotification } from '@/lib/push'
import { recordCronRun, triggerOf } from '@/lib/cronRuns'

export const dynamic = 'force-dynamic'

/** Constant-time comparison, normalizing length via SHA-256. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

async function runForUser(db: Db, user: UserDoc): Promise<number> {
  const prefs = prefsFor(user)
  if (prefs.cadence === 'off') return 0

  const auth = jobAuth(user._id)
  const { facts, meta, envelopes, subscriptions, categories, highlights } = await buildExpenseContext(auth)
  const { date: today } = nowIn(user.timezone)

  const notifications = buildNotifications({
    pace: highlights.pace,
    envelopes,
    subscriptions,
    categories,
    meta,
    prefs,
    today,
    month: today.slice(0, 7),
  })

  let sent = 0
  for (const notification of notifications) {
    if (await claimAndSend(db, user._id, notification, facts)) sent++
  }

  return sent
}

/**
 * Separate pass, not folded into `runForUser`: that function bails out entirely
 * for `cadence === 'off'` users before doing anything, which would silently
 * swallow the one notification meant to re-engage exactly them. It also builds
 * the full AI expense context (envelopes, subscriptions, categories) per user —
 * wrapped only needs a transaction count, so running it inside that path would
 * do the expensive work for the entire user base daily instead of once a month.
 *
 * ponytail: one count per user. Upgrade to a single grouped aggregation over
 * `expenses` if the user base grows large enough for N queries to matter.
 */
async function runWrappedForUser(db: Db, user: UserDoc): Promise<number> {
  // A hidden Wrapped also hides its notification switch in the app, so the push has to stop with it.
  if (hiddenFeatures(user).includes('wrapped')) return 0
  const prefs = prefsFor(user)
  const month = currentEdition(nowIn(user.timezone).date)
  const notification = wrappedNotification(month, prefs)
  if (!notification) return 0

  const auth = jobAuth(user._id)
  const status = await editionStatus(auth, month)
  if (!status.available) return 0

  return (await claimAndSend(db, user._id, notification, '')) ? 1 : 0
}


/**
 * Auto-applies today's due monthly contributions (SIP/PF) and sends a
 * day-before reminder for tomorrow's — both keyed off the holding's own
 * `recurring_day`/`recurring_last_run`, not `notifyCadence` (a user who
 * turned off the digest may still have a recurring investment running).
 * Runs for every user rather than a cadence-filtered subset for that reason.
 */
/**
 * Claim keys live in the owner's send log, and one owner can run several
 * budgets: a "Rent" in two of them must not share a key. The personal budget
 * keeps the bare keys it always had, so a deploy re-sends nothing.
 */
function claimPrefix(userId: string, spaceId: string): string {
  return spaceId === userId ? '' : `${spaceId}:`
}

async function runRecurringInvestmentsForSpace(db: Db, user: UserDoc, spaceId: string, today: string): Promise<number> {
  const money = (n: number) => formatMoney(Math.round(n), user.currencyCode)
  const auth = jobAuth(user._id, spaceId)
  const key = claimPrefix(user._id, spaceId)
  const holdingsColl = await getCollection('holdings', auth)
  const recurring = await holdingsColl.find({ is_recurring: 'true' }).toArray()

  let sent = 0
  for (const holding of recurring) {
    const name = String(holding.name)
    const amount = Number(holding.recurring_amount) || 0
    if (amount <= 0) continue
    const recurrence = {
      is_recurring: String(holding.is_recurring),
      recurring_day: String(holding.recurring_day),
      recurring_last_run: String(holding.recurring_last_run),
    }

    if (isDueToday(recurrence, today)) {
      const result = await applyHoldingAction(auth, { name, action: 'contribution', amount })
      if (result.ok) {
        await holdingsColl.updateOne({ name }, { $set: { recurring_last_run: today.slice(0, 7) } })
        if (await claim(db, user._id, `${key}invest:${name}:${today}`)) {
          try {
            await sendPushNotification({
              userId: user._id,
              title: 'SIP added',
              body: `${money(amount)} added to ${name}.`,
              data: { route: '/investments' },
            })
            sent++
          } catch (err) {
            console.error('notifications/run: investment push failed for', user._id, name, err)
            await unclaim(db, user._id, `${key}invest:${name}:${today}`)
          }
        }
      }
    }

    if (isDueTomorrow(recurrence, today)) {
      const tomorrow = tomorrowOf(today)
      if (await claim(db, user._id, `${key}invest-reminder:${name}:${tomorrow}`)) {
        try {
          await sendPushNotification({
            userId: user._id,
            title: 'SIP tomorrow',
            body: `${money(amount)} will be added to ${name} tomorrow.`,
            data: { route: '/investments' },
          })
          sent++
        } catch (err) {
          console.error('notifications/run: investment reminder failed for', user._id, name, err)
          await unclaim(db, user._id, `${key}invest-reminder:${name}:${tomorrow}`)
        }
      }
    }
  }

  return sent
}

/**
 * Auto-adds an expense for each active, non-one-time subscription due today
 * that has a linked category (a subscription with no category is skipped —
 * nothing to file the expense under). Runs for every user, not a
 * cadence-filtered subset: like recurring investments, this isn't a digest
 * preference — it's the subscription's own due date.
 */
async function runSubscriptionExpensesForSpace(db: Db, user: UserDoc, spaceId: string, today: string): Promise<number> {
  const money = (n: number) => formatMoney(Math.round(n), user.currencyCode)
  const auth = jobAuth(user._id, spaceId)
  const key = claimPrefix(user._id, spaceId)
  const subsColl = await getCollection('subscriptions', auth)
  const subs = await subsColl.find({}).toArray()

  let sent = 0
  for (const sub of subs) {
    const service = String(sub.service)
    const dueInput = {
      nextDueDate: String(sub.next_due_date ?? ''),
      billingCycle: String(sub.billing_cycle ?? ''),
      renewalOrEndMonth: sub.renewal_or_end_month ? String(sub.renewal_or_end_month) : undefined,
      timestamp: String(sub.timestamp ?? ''),
      status: sub.status ? String(sub.status) : undefined,
    }
    if (!isSubscriptionDueToday(dueInput, today)) continue

    const result = await applySubscriptionExpense(auth, {
      service,
      amount_inr: String(sub.amount_inr),
      category: String(sub.category ?? ''),
      notes: sub.notes ? String(sub.notes) : undefined,
    })
    if (!result.ok) continue

    const claimKey = `${key}sub-expense:${service}:${today}`
    if (!(await claim(db, user._id, claimKey))) continue

    try {
      await sendPushNotification({
        userId: user._id,
        title: `${service} charged`,
        body: `${money(Number(sub.amount_inr) || 0)} auto-added for ${service}.`,
        data: { route: '/activity', category: String(sub.category ?? '') },
      })
      sent++
    } catch (err) {
      console.error('notifications/run: subscription expense push failed for', user._id, service, err)
      await unclaim(db, user._id, claimKey)
    }
  }

  return sent
}

/**
 * Auto-adds an expense for every occurrence a user's recurring expenses owe as
 * of today, then advances each one's schedule. Like subscriptions and
 * recurring investments, this runs for every user rather than a
 * cadence-filtered subset — a recurrence's own date isn't a digest preference.
 *
 * Unlike either of them, this **backfills**: `occurrencesDue` returns every
 * date from `next_run_date` through today, so a run the cron missed still gets
 * logged, on its true date rather than today's. Two consequences that shape
 * the order below:
 *
 * - Idempotency comes from the `client_id` unique index on `expenses`
 *   (`scripts/ensure-indexes.mjs`), not from `claim` — the notification log
 *   has a 90-day TTL, so a claim key for an older backfilled date would expire
 *   and let that date be logged a second time. `client_id` has no TTL.
 * - The expense is inserted *before* `next_run_date` advances. The
 *   subscription pass claims first (see `runSubscriptionExpensesForUser`), so
 *   a crash between claim and insert drops that day for good. Inserting first
 *   means a crash just leaves the schedule unadvanced and the next run retries
 *   — which `client_id` makes safe.
 */
async function runRecurringExpensesForSpace(db: Db, user: UserDoc, spaceId: string, today: string): Promise<number> {
  const money = (n: number) => formatMoney(Math.round(n), user.currencyCode)
  const auth = jobAuth(user._id, spaceId)
  const key = claimPrefix(user._id, spaceId)
  const coll = await getCollection('recurring_expenses', auth)
  const recurrences = await coll.find({ status: 'active' }).toArray()

  let sent = 0
  for (const rec of recurrences) {
    const id = String(rec._id)
    try {
      const schedule = {
        frequency: String(rec.frequency ?? ''),
        start_date: String(rec.start_date ?? ''),
        end_date: String(rec.end_date ?? ''),
        next_run_date: String(rec.next_run_date ?? ''),
        status: String(rec.status ?? ''),
      }

      const due = occurrencesDue(schedule, today)
      if (due.length === 0) {
        // Nothing owed, but a lapsed end date still needs retiring so the row
        // stops being scanned every night.
        if (isExpired(schedule, today)) {
          await coll.updateOne({ _id: rec._id }, { $set: { status: 'ended' } })
        }
        continue
      }

      const category = String(rec.category ?? '')
      const amount = String(rec.amount_inr ?? '')
      // No category means nothing to file the expense under — same skip as the
      // subscription pass. Leave the schedule untouched so it starts working
      // the moment the user picks one, rather than silently losing those dates.
      if (!category) continue

      const input = (occurrence: string) => ({
        item: String(rec.item ?? ''),
        amount_inr: amount,
        category,
        notes: rec.notes ? `Auto-added from recurring expense · ${String(rec.notes)}` : 'Auto-added from recurring expense',
        date: occurrence,
        payment_method: paymentMethodOf(rec.payment_method),
        source: 'recurring',
        client_id: `recur:${id}:${occurrence}`,
        // One threshold check after the whole backfill, not one per
        // occurrence — it rebuilds the entire AI expense context per call.
        notify: false,
      })

      // A row createExpense will always reject (a zero amount, an empty item)
      // used to throw here every night, with the schedule never advancing and
      // the user never told. Pause it instead, which the Recurring screen
      // shows, and say so once.
      const invalid = expenseInputError(input(due[0]))
      if (invalid) {
        console.warn('notifications/run: pausing recurring expense', user._id, id, invalid)
        await coll.updateOne({ _id: rec._id }, { $set: { status: 'paused' } })
        if (await claim(db, user._id, `${key}recur-paused:${id}:${today}`)) {
          try {
            await sendPushNotification({
              userId: user._id,
              title: `${String(rec.item || 'A recurring expense')} is paused`,
              body: "We couldn't add it automatically. Check its details, then turn it back on.",
              data: { route: '/account/recurring' },
            })
            sent++
          } catch (err) {
            console.error('notifications/run: recurring pause push failed for', user._id, id, err)
            await unclaim(db, user._id, `${key}recur-paused:${id}:${today}`)
          }
        }
        continue
      }

      let logged = 0

      for (const occurrence of due) {
        const result = await createExpense(auth, input(occurrence))
        if (!result.duplicate) logged++
      }

      // Advance past the last occurrence logged, and retire the row once its
      // end date is behind us so it stops being scanned every night.
      const anchorDay = Number(schedule.start_date.slice(8, 10)) || undefined
      const nextRun = advance(due[due.length - 1], schedule.frequency, anchorDay)
      const ended = Boolean(schedule.end_date) && nextRun > schedule.end_date
      await coll.updateOne(
        { _id: rec._id },
        { $set: { next_run_date: nextRun, ...(ended ? { status: 'ended' } : {}) } },
      )

      if (logged === 0) continue

      await notifyThresholdCrossed(auth, category)

      if (await claim(db, user._id, `${key}recur-expense:${id}:${today}`)) {
        try {
          const label = String(rec.item ?? 'recurring expense')
          await sendPushNotification({
            userId: user._id,
            title: `${label} added`,
            body:
              logged === 1
                ? `${money(Number(amount) || 0)} auto-added for ${label}.`
                : `${money((Number(amount) || 0) * logged)} auto-added for ${label} (${logged} missed dates).`,
            data: { route: '/activity', category },
          })
          sent++
        } catch (err) {
          console.error('notifications/run: recurring expense push failed for', user._id, id, err)
          await unclaim(db, user._id, `${key}recur-expense:${id}:${today}`)
        }
      }
    } catch (err) {
      console.error('notifications/run: recurring expense failed for', user._id, id, err)
    }
  }

  return sent
}
/**
 * First-week recap pushes: the day 3 and day 5 teasers, then the "it's
 * ready" push once it's due. Rides the Wrapped pass and its opt-out. Only
 * the teasers read expenses, and only on those two days.
 */
async function runWeekRecapForUser(db: Db, user: UserDoc): Promise<number> {
  const start = onboardedDate(user)
  const today = nowIn(user.timezone).date
  const prefs = prefsFor(user)
  if (recapDue(start, user.weekRecapSeenAt, today)) {
    const notification = weekRecapNotification(prefs)
    return notification && (await claimAndSend(db, user._id, notification, '')) ? 1 : 0
  }
  const day = learningDay(start, today)
  if (!start || (day !== 3 && day !== 5) || !prefs.wrapped) return 0
  const auth = jobAuth(user._id)
  const docs = await (await getCollection('expenses', auth)).find({ date: { $gte: start, $lte: today } }).toArray()
  const { daysLogged } = computeWeekRecap(docs.map((d) => toRow(EXPENSE_HEADERS, d) as RecapRow), start)
  const notification = weekRecapTeaserNotification(day, daysLogged, prefs)
  return notification && (await claimAndSend(db, user._id, notification, '')) ? 1 : 0
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization')
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await recordCronRun('notifications', triggerOf(req), runAll)
  return json({ ok: true, ...result })
}

async function runAll(): Promise<{ sent: number }> {
  const db = await getDb()
  const users = await db
    .collection<UserDoc>('users')
    .find({ notifyCadence: { $in: ['weekly', 'daily'] }, deleted_at: null })
    .toArray()

  let sent = 0
  for (const user of users) {
    try {
      sent += await runForUser(db, user)
    } catch (err) {
      console.error('notifications/run: failed for', user._id, err)
    }
  }

  const wrappedUsers = await db
    .collection<UserDoc>('users')
    .find({ notifyWrapped: { $ne: false }, deleted_at: null })
    .toArray()

  for (const user of wrappedUsers) {
    try {
      sent += await runWrappedForUser(db, user)
    } catch (err) {
      console.error('notifications/run: wrapped failed for', user._id, err)
    }
    try {
      sent += await runWeekRecapForUser(db, user)
    } catch (err) {
      console.error('notifications/run: week recap failed for', user._id, err)
    }
  }

  // Not filtered by notifyCadence: a recurring investment, a subscription's
  // or a recurrence's own due date isn't a digest preference. Money jobs run
  // per budget, never per member, or a shared rent would log once per person.
  const allUsers = await db.collection<UserDoc>('users').find({ deleted_at: null }).toArray()
  const spaces = await liveSpaces(db)
  const spaceCurrency = new Map(spaces.map((s) => [s._id, s.currencyCode]))
  for (const { owner, spaceId } of spacesToRun(allUsers, spaces)) {
    // A shared budget's pushes speak its own currency, not its owner's.
    const user = spaceId === owner._id ? owner : { ...owner, currencyCode: spaceCurrency.get(spaceId) ?? owner.currencyCode }
    const today = nowIn(user.timezone).date
    try {
      sent += await runRecurringInvestmentsForSpace(db, user, spaceId, today)
    } catch (err) {
      console.error('notifications/run: investments failed for', spaceId, err)
    }
    try {
      sent += await runSubscriptionExpensesForSpace(db, user, spaceId, today)
    } catch (err) {
      console.error('notifications/run: subscription expenses failed for', spaceId, err)
    }
    try {
      sent += await runRecurringExpensesForSpace(db, user, spaceId, today)
    } catch (err) {
      console.error('notifications/run: recurring expenses failed for', spaceId, err)
    }
    // Paydays post quietly: no push, the Income screen and Activity show them.
    try {
      await runRecurringIncomes(jobAuth(user._id, spaceId), today)
    } catch (err) {
      console.error('notifications/run: recurring incomes failed for', spaceId, err)
    }
  }

  return { sent }
}
