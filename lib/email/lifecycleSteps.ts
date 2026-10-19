import type { AccessMode } from '@/lib/billing/access'

/**
 * Which lifecycle email a person gets next. Pure: callers pass the facts and
 * the instant, so every window and skip is testable without a database.
 *
 * One email per person per decision, and only the furthest step that's due
 * (someone first seen on day 9 gets the day-7 email, not day 2 and day 7).
 * Steps have closed windows, so an account that's past one simply skips it.
 */

const DAY = 86_400_000
/** At least this long between any two lifecycle emails, except the trial-end notice. */
const GAP = 2 * DAY
/** "Let it run": one evergreen email this long after the previous lifecycle email. */
const EVERGREEN_EVERY = 6 * DAY

/**
 * The evergreen library, in send order. Append new emails (and their copy in
 * lifecycleTemplate.ts); everyone who's run out gets the new one next. Never
 * rename an id: it's what records that a person already got that email.
 */
export const EVERGREEN = ['tip-day-four', 'tip-pay-then-log', 'tip-money-home', 'tip-swipe-is-spent'] as const

export type UserStep = 'setup-1' | 'setup-2' | 'trial-d2' | 'trial-d7' | 'trial-end' | (typeof EVERGREEN)[number]
export type LeadStep = 'plan' | 'lead-d3' | 'lead-d7' | (typeof EVERGREEN)[number]

export interface UserState {
  now: Date
  createdAt: Date
  mode: AccessMode
  /** Whether billing would actually end this trial. */
  enforced: boolean
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  /** Live expenses logged. Only read for trial accounts. */
  spends: number
  optedOut: boolean
  /** Steps already queued for this person. */
  sent: string[]
  /** When the last lifecycle email was queued. */
  lastAt: Date | null
}

export interface LeadState {
  now: Date
  createdAt: Date
  /** Clicked the link in the plan email. Nothing follows the plan without it. */
  confirmed: boolean
  optedOut: boolean
  sent: string[]
  lastAt: Date | null
}

const since = (now: Date, at: Date | null) => (at ? now.getTime() - at.getTime() : Infinity)
const within = (age: number, from: number, to: number) => age >= from * DAY && age < to * DAY

function nextEvergreen(now: Date, sent: string[], lastAt: Date | null) {
  if (since(now, lastAt) < EVERGREEN_EVERY) return null
  return EVERGREEN.find(id => !sent.includes(id)) ?? null
}

export function nextUserStep(s: UserState): UserStep | null {
  const has = (step: string) => s.sent.includes(step)
  // An account notice, not a nudge: sent even to people who turned the tips off.
  if (s.mode === 'trial' && s.enforced && s.trialEndsAt && !has('trial-end')) {
    const left = s.trialEndsAt.getTime() - s.now.getTime()
    if (left > 0 && left <= 5 * DAY) return 'trial-end'
  }
  if (s.optedOut || since(s.now, s.lastAt) < GAP) return null
  const age = since(s.now, s.createdAt)

  if (s.mode === 'setup_incomplete') {
    if (within(age, 4, 10)) return has('setup-2') ? null : 'setup-2'
    if (within(age, 1, 4)) return has('setup-1') ? null : 'setup-1'
    if (age < 10 * DAY) return null
  }
  if (s.mode === 'trial' && s.trialStartedAt) {
    const day = since(s.now, s.trialStartedAt)
    if (within(day, 7, 14) && !has('trial-d7')) return 'trial-d7'
    if (within(day, 2, 7) && !has('trial-d2') && s.spends === 0) return 'trial-d2'
    if (day < 7 * DAY) return null
  }
  if (age < 7 * DAY) return null
  return nextEvergreen(s.now, s.sent, s.lastAt)
}

export function nextLeadStep(s: LeadState): LeadStep | null {
  if (!s.confirmed || s.optedOut || since(s.now, s.lastAt) < GAP) return null
  const has = (step: string) => s.sent.includes(step)
  const age = since(s.now, s.createdAt)
  if (within(age, 7, 14) && !has('lead-d7')) return 'lead-d7'
  if (within(age, 3, 7) && !has('lead-d3')) return 'lead-d3'
  if (age < 7 * DAY) return null
  return nextEvergreen(s.now, s.sent, s.lastAt)
}
