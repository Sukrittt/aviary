import { vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { describe, expect, it } from 'vitest'
import { planReward } from './reward'
import type { BillingAccountDoc, BillingSubscriptionDoc, SubscriptionStatus } from './records'

const NOW = new Date('2026-10-24T12:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const account = (o: Partial<BillingAccountDoc> = {}): BillingAccountDoc => ({
  _id: 'u', trialStartedAt: day(-10), trialEndsAt: day(20), trialCohort: 'onboarding-v2', createdAt: day(-10), ...o,
})
const sub = (status: SubscriptionStatus, expiresAt: Date, o: Partial<BillingSubscriptionDoc> = {}): BillingSubscriptionDoc => ({
  _id: undefined as never, userId: 'u', provider: 'revenuecat', environment: 'production', store: 'play',
  productId: 'envelope_individual', basePlanId: 'monthly', storeTransactionId: 'GPA.1', status,
  autoRenew: status === 'active', expiresAt, verifiedAt: NOW, providerRefs: {}, createdAt: NOW, updatedAt: NOW, ...o,
})
const plan = (a: BillingAccountDoc | null, s: BillingSubscriptionDoc | null = null) => planReward({ now: NOW, account: a, subscription: s, months: 1 })

describe('planReward', () => {
  it('waits for a billing account (setup not finished)', () => {
    expect(plan(null)).toEqual({ kind: 'hold' })
  })

  it('pushes a live trial out a month, so a web subscription made later still starts charging at its end', () => {
    expect(plan(account())).toEqual({ kind: 'extend_trial', until: new Date('2026-12-13T12:00:00.000Z') })
  })

  it('clamps to the month\'s last day', () => {
    const end = new Date('2027-01-31T00:00:00.000Z')
    expect(plan(account({ trialEndsAt: end }))).toEqual({ kind: 'extend_trial', until: new Date('2027-02-28T00:00:00.000Z') })
  })

  it('stacks on a running gift', () => {
    const comp = { until: day(40), reason: 'x', grantedBy: 'a', grantedAt: NOW }
    expect(plan(account({ trialEndsAt: day(-5), comp }))).toEqual({ kind: 'comp', from: day(40), until: new Date('2027-01-03T12:00:00.000Z') })
  })

  it('starts a gift after a trial that outlasts the running gift', () => {
    const comp = { until: day(5), reason: 'x', grantedBy: 'a', grantedAt: NOW }
    expect(plan(account({ trialEndsAt: day(20), comp }))).toEqual({ kind: 'comp', from: day(20), until: new Date('2026-12-13T12:00:00.000Z') })
  })

  it('gives a lapsed account a month from today', () => {
    expect(plan(account({ trialEndsAt: day(-5) }))).toEqual({ kind: 'comp', from: NOW, until: new Date('2026-11-24T12:00:00.000Z') })
  })

  it('moves a renewing Play subscription\'s next charge back a month', () => {
    expect(plan(account({ trialEndsAt: day(-40) }), sub('active', day(10), { productId: 'envelope_individual:monthly' }))).toEqual({
      kind: 'play_defer', subscriptionId: 'envelope_individual', from: day(10), until: new Date('2026-12-03T12:00:00.000Z'),
    })
  })

  it('adds the month after the paid period when the plan won\'t renew', () => {
    expect(plan(account({ trialEndsAt: day(-40) }), sub('cancelled', day(10)))).toEqual({ kind: 'comp', from: day(10), until: new Date('2026-12-03T12:00:00.000Z') })
  })

  it('banks the month after a renewing web subscription\'s paid period (no refunds)', () => {
    const web = sub('active', day(10), { provider: 'razorpay', store: 'web' })
    expect(plan(account({ trialEndsAt: day(-40) }), web)).toEqual({ kind: 'comp', from: day(10), until: new Date('2026-12-03T12:00:00.000Z') })
    // Subscribed mid-trial: the first charge is still to come at its expiresAt.
    expect(plan(account(), sub('scheduled', day(20), { provider: 'razorpay', store: 'web' }))).toEqual({ kind: 'comp', from: day(20), until: new Date('2026-12-13T12:00:00.000Z') })
  })

  it('starts after whichever is later, the gift or the paid period', () => {
    const comp = { until: day(30), reason: 'x', grantedBy: 'a', grantedAt: NOW }
    expect(plan(account({ trialEndsAt: day(-40), comp }), sub('cancelled', day(10)))).toEqual({ kind: 'comp', from: day(30), until: new Date('2026-12-23T12:00:00.000Z') })
  })

  it('ignores a sandbox purchase', () => {
    expect(plan(account(), sub('active', day(10), { environment: 'sandbox' }))).toEqual({ kind: 'extend_trial', until: new Date('2026-12-13T12:00:00.000Z') })
  })
})
