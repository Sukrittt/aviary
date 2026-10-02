import { describe, it, expect } from 'vitest'
import { projectRazorpaySubscription, RETRY_GRACE_DAYS } from './razorpayProjection'
import type { RzpSubscription } from './razorpay'
import { resolveAccess } from './access'
import type { BillingSubscriptionDoc } from './records'

const NOW = new Date('2026-09-18T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const secs = (offsetDays: number) => Math.floor((NOW.getTime() + offsetDays * DAY) / 1000)

function sub(over: Partial<RzpSubscription> = {}): RzpSubscription {
  return {
    id: 'sub_1',
    plan_id: 'plan_month',
    customer_id: 'cust_1',
    status: 'active',
    current_start: secs(-10),
    current_end: secs(20),
    ended_at: null,
    paid_count: 1,
    notes: { userId: 'user_a' },
    ...over,
  }
}

const project = (s: RzpSubscription, cancelAtPeriodEnd = false) =>
  projectRazorpaySubscription({ subscription: s, period: 'monthly', environment: 'production', cancelAtPeriodEnd, fetchedAt: NOW })

/** Would this row let the user in right now? Goes through the real resolver. */
function entitles(s: RzpSubscription, cancelAtPeriodEnd = false): boolean {
  const row = { ...project(s, cancelAtPeriodEnd), userId: 'user_a' } as unknown as BillingSubscriptionDoc
  return resolveAccess({ now: NOW, account: null, subscription: row, enforced: true }).allowed
}

describe('projectRazorpaySubscription', () => {
  it('maps a live subscription to an active web purchase that runs to the end of the paid cycle', () => {
    expect(project(sub())).toMatchObject({
      provider: 'razorpay',
      store: 'web',
      status: 'active',
      autoRenew: true,
      productId: 'plan_month',
      basePlanId: 'monthly',
      storeTransactionId: 'sub_1',
      expiresAt: new Date(secs(20) * 1000),
      providerRefs: { customerId: 'cust_1' },
    })
    expect(entitles(sub())).toBe(true)
  })

  it('keeps access but stops renewing once the user cancelled with us', () => {
    expect(project(sub(), true)).toMatchObject({ status: 'cancelled', autoRenew: false })
    expect(entitles(sub(), true)).toBe(true)
  })

  it('grants nothing for a checkout that has not settled', () => {
    for (const status of ['created', 'authenticated'] as const) {
      expect(project(sub({ status, current_end: null }))).toMatchObject({ status: 'pending', expiresAt: null })
      expect(entitles(sub({ status, current_end: null }))).toBe(false)
    }
  })

  it('gives a failed renewal a bounded grace while Razorpay retries', () => {
    const failed = sub({ status: 'pending', current_end: secs(-1) })
    expect(project(failed)).toMatchObject({ status: 'grace', autoRenew: true })
    expect(project(failed).expiresAt).toEqual(new Date(secs(-1) * 1000 + RETRY_GRACE_DAYS * DAY))
    expect(entitles(failed)).toBe(true)
    expect(entitles(sub({ status: 'pending', current_end: secs(-RETRY_GRACE_DAYS - 1) }))).toBe(false)
  })

  it('locks a halted subscription', () => {
    expect(project(sub({ status: 'halted', current_end: secs(-3) }))).toMatchObject({ status: 'on_hold', autoRenew: false })
    expect(entitles(sub({ status: 'halted', current_end: secs(-3) }))).toBe(false)
  })

  it('honours the paid cycle after a mandate is revoked, then expires', () => {
    expect(project(sub({ status: 'cancelled' }))).toMatchObject({ status: 'cancelled', autoRenew: false })
    expect(entitles(sub({ status: 'cancelled' }))).toBe(true)
    expect(project(sub({ status: 'cancelled', current_end: secs(-1) }))).toMatchObject({ status: 'expired' })
    expect(entitles(sub({ status: 'cancelled', current_end: secs(-1) }))).toBe(false)
  })

  it('reads completed and expired as over', () => {
    expect(project(sub({ status: 'completed', current_end: secs(-1) })).status).toBe('expired')
    expect(project(sub({ status: 'expired', current_end: secs(-1) })).status).toBe('expired')
  })

  it('reports a paused subscription as paused', () => {
    expect(project(sub({ status: 'paused' })).status).toBe('paused')
    expect(entitles(sub({ status: 'paused' }))).toBe(false)
  })
})

it('preserves cancellation through a pending renewal refresh without extending unpaid grace', () => {
  const pending = sub({ status: 'pending', current_end: secs(1) })
  expect(project(pending, true)).toMatchObject({ status: 'cancelled', autoRenew: false, expiresAt: new Date(secs(1) * 1000) })
  expect(entitles(sub({ status: 'pending', current_end: secs(-1) }), true)).toBe(false)
})
