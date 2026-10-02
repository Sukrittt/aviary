'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { audit } from '@/lib/adminAudit'
import { getDb } from '@/lib/mongodb'
import type { UserDoc } from '@/lib/users'
import { extendTrialEnd } from '@/lib/billing/access'
import { addMonthsUtc } from '@/lib/billing/lifecycle'
import { BILLING_ACCOUNTS, type BillingAccountDoc } from '@/lib/billing/records'
import { refreshFromProvider } from '@/lib/billing/service'
import type { ActionResult } from '../ActionForm'

const MAX_EXTEND_DAYS = 365
const MAX_GIFT_MONTHS = 120
const REASON_MAX = 140

/** Every action here writes `billing_accounts` or the tester flag — never `billing_subscriptions`, which is the provider's to own. */
async function accounts() {
  return (await getDb()).collection<BillingAccountDoc>(BILLING_ACCOUNTS)
}

function done(userId: string, message: string): ActionResult {
  revalidatePath('/admin/subscriptions')
  revalidatePath(`/admin/users/${encodeURIComponent(userId)}`)
  return { ok: true, message }
}

const NO_ACCOUNT = 'No billing account yet — this user has not completed onboarding, so there is no trial clock to change.'

export async function extendTrialAction(userId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const days = Number(form.get('days'))
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXTEND_DAYS) return { ok: false, message: `Days must be a whole number between 1 and ${MAX_EXTEND_DAYS}` }

  const coll = await accounts()
  const account = await coll.findOne({ _id: userId })
  if (!account) return { ok: false, message: NO_ACCOUNT }

  const trialEndsAt = extendTrialEnd(account.trialEndsAt, days, new Date())
  // The retention clock is cleared too: an account being given more trial is
  // in use again, and leaving a deletion deadline behind would delete data we
  // just told the user they could keep using.
  await coll.updateOne({ _id: userId }, { $set: { trialEndsAt, retentionDeadline: null } })
  await audit(adminId, 'billing.extend_trial', userId, { days, from: account.trialEndsAt, to: trialEndsAt })
  return done(userId, `Trial now ends ${trialEndsAt.toISOString().slice(0, 10)}`)
}

export async function grantGiftAction(userId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const months = Number(form.get('months'))
  const reason = String(form.get('reason') ?? '').trim().slice(0, REASON_MAX)
  if (!Number.isInteger(months) || months < 1 || months > MAX_GIFT_MONTHS) return { ok: false, message: `Months must be a whole number between 1 and ${MAX_GIFT_MONTHS}` }
  if (!reason) return { ok: false, message: 'Say why this plan is being gifted — the audit entry is the only record of it' }

  const coll = await accounts()
  const account = await coll.findOne({ _id: userId })
  if (!account) return { ok: false, message: NO_ACCOUNT }

  const now = new Date()
  // Gifting twice stacks rather than replaces, same as extending a live
  // trial: "another 3 months" means three more, not three from today.
  const live = account.comp && account.comp.until.getTime() > now.getTime() ? account.comp.until : now
  const until = addMonthsUtc(live, months)
  await coll.updateOne({ _id: userId }, { $set: { comp: { until, reason, grantedBy: adminId, grantedAt: now }, retentionDeadline: null } })
  await audit(adminId, 'billing.gift_grant', userId, { months, until, reason, stacked: live !== now })
  return done(userId, `Gifted plan until ${until.toISOString().slice(0, 10)}`)
}

export async function revokeGiftAction(userId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const coll = await accounts()
  const account = await coll.findOne({ _id: userId })
  if (!account?.comp) return { ok: false, message: 'This account has no gifted plan' }

  await coll.updateOne({ _id: userId }, { $set: { comp: null } })
  await audit(adminId, 'billing.gift_revoke', userId, { until: account.comp.until, reason: account.comp.reason })
  return done(userId, 'Gifted plan revoked')
}

/** Puts the account inside the testers-only audience, so the billing switches apply to it. The UI half of scripts/grant-billing-tester.mjs. */
export async function toggleTesterAction(userId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const db = await getDb()
  const users = db.collection<UserDoc>('users')
  const user = await users.findOne({ _id: userId }, { projection: { billingTester: 1 } })
  if (!user) return { ok: false, message: 'User not found' }

  const billingTester = !user.billingTester
  await users.updateOne({ _id: userId }, { $set: { billingTester } })
  await audit(adminId, 'billing.tester', userId, { billingTester })
  return done(userId, billingTester ? 'Added to billing testers' : 'Removed from billing testers')
}

/** Re-verify one account against RevenueCat and Razorpay now — for a purchase a missed webhook left behind. */
export async function resyncAction(userId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  try {
    const access = await refreshFromProvider(userId)
    await audit(adminId, 'billing.resync', userId, { mode: access.mode, renewalState: access.renewalState })
    return done(userId, `Re-verified · ${access.mode}${access.renewalState ? ` (${access.renewalState})` : ''}`)
  } catch (err) {
    // An unreachable provider is an outage, not a cancellation. `refreshFromProvider`
    // wrote nothing, so the existing projection stands.
    return { ok: false, message: `Payment provider unreachable, nothing changed: ${(err as Error).message}` }
  }
}
