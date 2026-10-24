/**
 * Referrals: every user gets a short code; a new account that arrives with
 * one (link, install referrer, or typed in during its first 7 days) is
 * "pending" until it's activated (setup finished plus expenses logged on 3
 * different days within 30 days of signup). Then both sides get their months
 * of Pro through lib/billing/reward.ts. Creator codes are the same thing made
 * by hand in admin, with their own months and landing line.
 *
 * Two collections: `referral_codes` (`_id` is the code, so a clash is a
 * duplicate key) and `referrals` (`_id` is the new account, so one referrer
 * per account is a duplicate key too).
 */
import { randomInt } from 'node:crypto'
import { after } from 'next/server'
import { ObjectId, type Db } from 'mongodb'
import { getDb } from './mongodb'
import { REFERRAL_CODE } from './attribution'
import { captureServer } from './posthogServer'
import type { RewardResult } from './billing/reward'
import type { UserDoc } from './users'

export const REFERRAL_CODES = 'referral_codes'
export const REFERRALS = 'referrals'

/** No 0/O, 1/I/L: a code read off a screen or said out loud survives. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
export const APPLY_WINDOW_DAYS = 7
export const ACTIVATION_DAYS = 3
export const ACTIVATION_WINDOW_DAYS = 30
/** Months a referrer can earn per calendar month (UTC). */
export const REFERRER_MONTHLY_CAP = 3
const DAY_MS = 86_400_000

export interface ReferralCodeDoc {
  _id: string
  kind: 'user' | 'creator'
  ownerId: string | null
  /** Creator codes: who it's for, shown in admin. */
  label: string | null
  refereeMonths: number
  referrerMonths: number
  /** Creator codes: the landing headline. */
  offer: string | null
  active: boolean
  createdAt: Date
}

type SideReward = (RewardResult & { at: Date }) | { kind: 'capped'; at: Date }

export interface ReferralDoc {
  _id: string
  code: string
  kind: ReferralCodeDoc['kind']
  referrerId: string | null
  status: 'pending' | 'activated' | 'blocked' | 'expired'
  reason?: 'self' | 'unverified' | 'disposable'
  via: 'link' | 'install' | 'manual'
  appliedAt: Date
  activatedAt?: Date
  referee?: SideReward
  referrer?: SideReward
}

export type ApplyOutcome = 'applied' | 'not_found' | 'inactive' | 'own_code' | 'already_referred' | 'too_late' | 'blocked'

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return REFERRAL_CODE.test(code) ? code : null
}

/** `a.b+x@googlemail.com` and `ab@gmail.com` are the same inbox. */
export function canonicalEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@')
  const base = local.split('+')[0]
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${base.replace(/\./g, '')}@gmail.com`
  return `${base}@${domain}`
}

// ponytail: the common throwaway domains only; a maintained list is a package and a chore.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempail.com', 'throwawaymail.com', 'yopmail.com', 'yopmail.net',
  'getnada.com', 'nada.email', 'trashmail.com', 'trashmail.de', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com',
  'fakeinbox.com', 'emailondeck.com', 'mohmal.com', 'mailcatch.com', 'spamgourmet.com', 'tempinbox.com', 'burnermail.io',
  'discard.email', 'moakt.com', 'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'inboxkitten.com', 'mail.tm', 'emailfake.com', 'fexpost.com', 'mailpoof.com',
])
export function isDisposable(email: string): boolean {
  return DISPOSABLE.has(email.trim().toLowerCase().split('@')[1] ?? '')
}

const codes = (db: Db) => db.collection<ReferralCodeDoc>(REFERRAL_CODES)
const referrals = (db: Db) => db.collection<ReferralDoc>(REFERRALS)
const isDuplicate = (err: unknown) => (err as { code?: number })?.code === 11000

function randomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
}

/** This user's own code, made the first time it's asked for. */
export async function userCode(userId: string): Promise<string> {
  const db = await getDb()
  const existing = await codes(db).findOne({ ownerId: userId, kind: 'user' })
  if (existing) return existing._id
  for (let tries = 0; tries < 5; tries++) {
    try {
      const doc: ReferralCodeDoc = { _id: randomCode(), kind: 'user', ownerId: userId, label: null, refereeMonths: 1, referrerMonths: 1, offer: null, active: true, createdAt: new Date() }
      await codes(db).insertOne(doc)
      return doc._id
    } catch (err) {
      if (!isDuplicate(err)) throw err
      // Either the code clashed (try another) or a parallel request just made this user's code.
      const raced = await codes(db).findOne({ ownerId: userId, kind: 'user' })
      if (raced) return raced._id
    }
  }
  throw new Error('referrals: could not find a free code')
}

export async function findCode(raw: unknown): Promise<ReferralCodeDoc | null> {
  const code = normalizeCode(raw)
  if (!code) return null
  return codes(await getDb()).findOne({ _id: code })
}

/**
 * Tie a new account to a code. `link`/`install` come from signup; `manual` is
 * a code typed in, allowed for the first 7 days. Blocked referrals are kept
 * (admin sees them) but never rewarded.
 */
export async function applyReferral(userId: string, raw: unknown, via: ReferralDoc['via'], now = new Date()): Promise<ApplyOutcome> {
  const db = await getDb()
  const code = await findCode(raw)
  if (!code) return 'not_found'
  if (!code.active) return 'inactive'
  if (code.ownerId === userId) return 'own_code'
  const [user, owner, existing] = await Promise.all([
    db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { email: 1, emailVerified: 1, createdAt: 1 } }),
    code.ownerId ? db.collection<UserDoc>('users').findOne({ _id: code.ownerId }, { projection: { email: 1 } }) : null,
    referrals(db).findOne({ _id: userId }, { projection: { _id: 1 } }),
  ])
  if (!user) return 'not_found'
  if (existing) return 'already_referred'
  if (via === 'manual' && now.getTime() - user.createdAt.getTime() > APPLY_WINDOW_DAYS * DAY_MS) return 'too_late'

  const reason: ReferralDoc['reason'] | undefined =
    owner && canonicalEmail(owner.email) === canonicalEmail(user.email) ? 'self'
    : user.emailVerified === false ? 'unverified'
    : isDisposable(user.email) ? 'disposable'
    : undefined
  const doc: ReferralDoc = { _id: userId, code: code._id, kind: code.kind, referrerId: code.ownerId, status: reason ? 'blocked' : 'pending', ...(reason ? { reason } : {}), via, appliedAt: now }
  try {
    await referrals(db).insertOne(doc)
  } catch (err) {
    if (isDuplicate(err)) return 'already_referred'
    throw err
  }
  await captureServer(userId, 'referral_code_applied', { code: code._id, kind: code.kind, via, blocked: reason ?? null })
  if (reason) return 'blocked'
  // A code typed in on day 6 may find the account already active.
  await maybeActivate(userId, now)
  return 'applied'
}

/** Distinct local days (the user's zone) with an expense they logged themselves since signup. */
async function loggedDays(db: Db, userId: string, since: Date, timezone: string | undefined): Promise<number> {
  const rows = await db.collection('expenses').find(
    {
      $or: [{ created_by: userId }, { user_id: userId, created_by: { $exists: false } }],
      deleted_at: null,
      // An import writes years of history in seconds, and recurring rows and
      // subscriptions log themselves; none of it says anything about a habit.
      source: { $nin: ['import', 'recurring', 'subscription'] },
      _id: { $gte: ObjectId.createFromTime(Math.floor(since.getTime() / 1000)) },
    },
    { projection: { _id: 1 } },
  ).limit(500).toArray()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'Asia/Kolkata' })
  // Server time from the ObjectId, never the expense's own (backdatable) date.
  return new Set(rows.map((r) => day.format((r._id as ObjectId).getTimestamp()))).size
}

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * Activate a pending referral once its account qualifies, then reward both
 * sides. Safe to call on every expense: it's one `_id` lookup when there's
 * nothing pending, and the status flip is conditional so a retry or a race
 * grants once.
 */
export async function maybeActivate(userId: string, now = new Date()): Promise<boolean> {
  const db = await getDb()
  const ref = await referrals(db).findOne({ _id: userId, status: 'pending' })
  if (!ref) return false
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { onboardedAt: 1, createdAt: 1, timezone: 1 } })
  if (!user) return false
  if (now.getTime() - user.createdAt.getTime() > ACTIVATION_WINDOW_DAYS * DAY_MS) {
    await referrals(db).updateOne({ _id: userId, status: 'pending' }, { $set: { status: 'expired' } })
    return false
  }
  if (!user.onboardedAt) return false
  if ((await loggedDays(db, userId, user.createdAt, user.timezone)) < ACTIVATION_DAYS) return false

  const flipped = await referrals(db).updateOne({ _id: userId, status: 'pending' }, { $set: { status: 'activated', activatedAt: now } })
  if (!flipped.modifiedCount) return false
  await captureServer(userId, 'referral_activated', { code: ref.code, kind: ref.kind })

  // Imported here so lib/referrals stays light for the routes that only schedule activation.
  const { grantReward } = await import('./billing/reward')
  const code = await codes(db).findOne({ _id: ref.code })
  const months = { referee: code?.refereeMonths ?? 1, referrer: code?.referrerMonths ?? 1 }
  const set: Partial<ReferralDoc> = {}
  if (months.referee > 0) {
    set.referee = { ...(await grantReward(userId, months.referee, `referral:${ref.code}`)), at: now }
    await captureServer(userId, 'referral_rewarded', { side: 'referee', kind: set.referee.kind, code: ref.code, months: months.referee })
  }
  if (ref.referrerId && months.referrer > 0) {
    // ponytail: two activations racing at the cap can both pass; a per-referrer counter doc if that ever matters.
    const earned = await referrals(db).countDocuments({ referrerId: ref.referrerId, 'referrer.at': { $gte: monthStartUtc(now) }, 'referrer.kind': { $ne: 'capped' } })
    set.referrer = earned >= REFERRER_MONTHLY_CAP
      ? { kind: 'capped', at: now }
      : { ...(await grantReward(ref.referrerId, months.referrer, `referral:${ref.code}`)), at: now }
    await captureServer(ref.referrerId, 'referral_rewarded', { side: 'referrer', kind: set.referrer.kind, code: ref.code, months: months.referrer })
  }
  await referrals(db).updateOne({ _id: userId }, { $set: set })
  return true
}

/**
 * After the response: activation runs on expense writes and onboarding and
 * must never fail either. Finishing setup also hands over any months this
 * person earned as a referrer before they had a billing account.
 */
export function activateLater(userId: string, { onboarded = false } = {}): void {
  const run = async () => {
    try {
      if (onboarded) await grantHeld(userId)
      await maybeActivate(userId)
    } catch (err) {
      console.error('referrals: activation failed', userId, err)
    }
  }
  try {
    after(run)
  } catch {
    void run()
  }
}

/**
 * Rewards a referrer couldn't take yet because they hadn't finished setup
 * (no billing account). Called when they do.
 */
export async function grantHeld(userId: string, now = new Date()): Promise<number> {
  const db = await getDb()
  const held = await referrals(db).find({ referrerId: userId, 'referrer.kind': 'hold' }).toArray()
  const { grantReward } = await import('./billing/reward')
  for (const ref of held) {
    const code = await codes(db).findOne({ _id: ref.code })
    const result = await grantReward(userId, code?.referrerMonths ?? 1, `referral:${ref.code}`)
    if (result.kind === 'hold') break
    await referrals(db).updateOne({ _id: ref._id, 'referrer.kind': 'hold' }, { $set: { referrer: { ...result, at: now } } })
  }
  return held.length
}

export interface ReferralSummary {
  code: string
  link: string
  joined: number
  activated: number
  monthsEarned: number
  canEnterCode: boolean
  referredBy: string | null
}

export async function referralSummary(userId: string, origin: string, now = new Date()): Promise<ReferralSummary> {
  const db = await getDb()
  const code = await userCode(userId)
  const [mine, own, user] = await Promise.all([
    referrals(db).find({ referrerId: userId, status: { $ne: 'blocked' } }, { projection: { status: 1, referrer: 1 } }).toArray(),
    referrals(db).findOne({ _id: userId }, { projection: { code: 1 } }),
    db.collection<UserDoc>('users').findOne({ _id: userId }, { projection: { createdAt: 1 } }),
  ])
  const earned = mine.filter((r) => r.referrer && r.referrer.kind !== 'capped' && r.referrer.kind !== 'hold').length
  return {
    code,
    link: `${origin}/r/${code}`,
    joined: mine.length,
    activated: mine.filter((r) => r.status === 'activated').length,
    monthsEarned: earned,
    canEnterCode: !own && !!user && now.getTime() - user.createdAt.getTime() <= APPLY_WINDOW_DAYS * DAY_MS,
    referredBy: own?.code ?? null,
  }
}
