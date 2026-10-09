import { describe, it, expect } from 'vitest'
import { addPeriod, projectPayPalSubscription } from './paypalProjection'
import type { PpSubscription } from './paypal'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

const sub = (over: Partial<PpSubscription> = {}, billing: PpSubscription['billing_info'] = {}): PpSubscription => ({
  id: 'I-1',
  plan_id: 'P-MONTH',
  status: 'ACTIVE',
  custom_id: 'user_a',
  billing_info: { last_payment: { time: at(-10) }, next_billing_time: at(20), failed_payments_count: 0, ...billing },
  ...over,
})
const project = (s: PpSubscription, period: 'monthly' | 'yearly' | null = 'monthly') =>
  projectPayPalSubscription({ subscription: s, period, environment: 'production', fetchedAt: NOW })

describe('projectPayPalSubscription', () => {
  it('entitles an active plan to the end of the cycle the last payment bought', () => {
    const row = project(sub())
    expect(row).toMatchObject({ provider: 'paypal', store: 'web', status: 'active', autoRenew: true, storeTransactionId: 'I-1', basePlanId: 'monthly' })
    expect(row.expiresAt).toEqual(addPeriod(new Date(at(-10)), 'monthly'))
  })

  it('runs a yearly plan a year from its payment', () => {
    expect(project(sub(), 'yearly').expiresAt).toEqual(new Date('2027-09-29T12:00:00.000Z'))
  })

  it('keeps a cancelled plan entitled until its paid cycle ends, even with no next billing time', () => {
    const row = project(sub({ status: 'CANCELLED' }, { next_billing_time: undefined }))
    expect(row).toMatchObject({ status: 'cancelled', autoRenew: false })
    expect(row.expiresAt!.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('expires a cancelled plan once the paid cycle is over', () => {
    expect(project(sub({ status: 'CANCELLED' }, { last_payment: { time: at(-40) } })).status).toBe('expired')
  })

  it('schedules a plan bought mid-trial until its first charge', () => {
    const row = project(sub({}, { last_payment: undefined, next_billing_time: at(12) }))
    expect(row).toMatchObject({ status: 'scheduled', autoRenew: true })
    expect(row.expiresAt).toEqual(new Date(at(12)))
  })

  it('schedules an approved plan whose first charge waits for the trial to end', () => {
    const row = project(sub({ status: 'APPROVED', start_time: at(12) }, { last_payment: undefined, next_billing_time: undefined }))
    expect(row).toMatchObject({ status: 'scheduled', autoRenew: true })
    expect(row.expiresAt).toEqual(new Date(at(12)))
  })

  it('grants a bounded grace while PayPal retries a failed renewal', () => {
    const row = project(sub({}, { last_payment: { time: at(-31) }, failed_payments_count: 1 }))
    expect(row.status).toBe('grace')
    expect(row.expiresAt!.getTime()).toBe(addPeriod(new Date(at(-31)), 'monthly').getTime() + 7 * DAY)
  })

  it('grants nothing before approval or on suspension', () => {
    expect(project(sub({ status: 'APPROVAL_PENDING' }, { last_payment: undefined })).status).toBe('pending')
    expect(project(sub({ status: 'APPROVED' }, { last_payment: undefined })).status).toBe('pending')
    expect(project(sub({ status: 'SUSPENDED' })).status).toBe('on_hold')
    expect(project(sub({ status: 'EXPIRED' })).status).toBe('expired')
  })

  it("trusts PayPal's next billing time for a plan we don't sell", () => {
    expect(project(sub(), null).expiresAt).toEqual(new Date(at(20)))
  })
})

describe('addPeriod', () => {
  it('adds calendar months and years in UTC', () => {
    expect(addPeriod(new Date('2026-01-15T00:00:00Z'), 'monthly')).toEqual(new Date('2026-02-15T00:00:00Z'))
    expect(addPeriod(new Date('2026-01-15T00:00:00Z'), 'yearly')).toEqual(new Date('2027-01-15T00:00:00Z'))
  })

  it("stops at the end of a shorter month instead of spilling into the next", () => {
    expect(addPeriod(new Date('2026-01-31T10:00:00Z'), 'monthly')).toEqual(new Date('2026-02-28T10:00:00Z'))
    expect(addPeriod(new Date('2028-02-29T10:00:00Z'), 'yearly')).toEqual(new Date('2029-02-28T10:00:00Z'))
  })
})
