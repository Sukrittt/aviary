import { describe, it, expect } from 'vitest'
import { lockedReason, shouldWarnAboutTrial, trialRemainingLabel, formatDate, formatPrice, planSummary, storeLabel, yearlySavingsPercent } from './copy'
import type { BillingStatus } from '@/src/api/billing'

const base: BillingStatus = {
  mode: 'trial',
  allowed: true,
  enforced: true,
  trialStartedAt: '2026-09-01T00:00:00.000Z',
  trialEndsAt: '2026-10-16T00:00:00.000Z',
  trialDaysRemaining: 30,
  productId: null,
  basePlanId: null,
  paidExpiresAt: null,
  autoRenew: false,
  renewalState: null,
  retentionDeadline: null,
  purchaseEnabled: true,
}

describe('trial countdown visibility', () => {
  it('stays silent for most of the trial', () => {
    // A banner that is always there is one nobody reads on the day it matters.
    expect(shouldWarnAboutTrial({ ...base, trialDaysRemaining: 30 })).toBe(false)
    expect(shouldWarnAboutTrial({ ...base, trialDaysRemaining: 8 })).toBe(false)
  })

  it('appears from seven days out, and on the last day', () => {
    expect(shouldWarnAboutTrial({ ...base, trialDaysRemaining: 7 })).toBe(true)
    expect(shouldWarnAboutTrial({ ...base, trialDaysRemaining: 0 })).toBe(true)
  })

  it('says nothing to a paid or expired account', () => {
    expect(shouldWarnAboutTrial({ ...base, mode: 'paid', trialDaysRemaining: 0 })).toBe(false)
    expect(shouldWarnAboutTrial({ ...base, mode: 'expired', trialDaysRemaining: 0 })).toBe(false)
    expect(shouldWarnAboutTrial(undefined)).toBe(false)
  })
})

describe('trialRemainingLabel', () => {
  it.each([
    [7, '7 days left'],
    [1, '1 day left'],
    [0, 'Last day'],
  ])('%i → %s', (days, label) => {
    expect(trialRemainingLabel(days)).toBe(label)
  })
})

describe('lockedReason', () => {
  it('tells a user on hold what to actually do', () => {
    expect(lockedReason({ ...base, mode: 'expired', renewalState: 'on_hold' })).toContain('payment method')
  })

  it('tells a pending payer not to pay twice', () => {
    // Slow payment methods are common in India; "your payment failed" here
    // would send someone to buy the same subscription a second time.
    expect(lockedReason({ ...base, mode: 'expired', renewalState: 'pending' })).toContain('no need to pay again')
  })

  it('calls an ended trial a trial, not a subscription', () => {
    expect(lockedReason({ ...base, mode: 'expired', renewalState: null })).toContain('45-day free trial')
  })

  it('calls an ended subscription a subscription', () => {
    expect(lockedReason({ ...base, mode: 'expired', renewalState: 'expired', productId: 'envelope_individual' })).toContain(
      'subscription has ended',
    )
  })
})

describe('formatDate', () => {
  it('renders a missing date as an em dash rather than "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})

describe('planSummary', () => {
  it('summarises the plan for the account row', async () => {
    const { planSummary, billingVisible } = await import('./copy')
    expect(planSummary({ ...base, trialDaysRemaining: 3 })).toBe('Free trial · 3 days left')
    expect(planSummary({ ...base, mode: 'expired', productId: null })).toBe('Trial ended')
    expect(billingVisible({ ...base, enforced: false, purchaseEnabled: false })).toBe(false)
    expect(billingVisible(undefined)).toBe(false)
  })
})

describe('web subscriptions', () => {
  it('sends a web subscriber back to the plan picker, not to Google Play', () => {
    const onHold = lockedReason({ ...base, mode: 'expired', renewalState: 'on_hold', store: 'web' })
    expect(onHold).toContain('Pick a plan')
    expect(onHold).not.toContain('Google Play')
    expect(lockedReason({ ...base, mode: 'expired', renewalState: 'on_hold', store: 'play' })).toContain('Google Play')
  })

  it("doesn't point a web subscriber with a failed payment at Google Play", () => {
    expect(planSummary({ ...base, mode: 'paid', renewalState: 'grace', store: 'web' })).toBe('Payment issue · retrying')
    expect(planSummary({ ...base, mode: 'paid', renewalState: 'grace', store: 'play' })).toBe('Payment issue · fix in Google Play')
  })

  it('names where a purchase is managed', () => {
    expect(storeLabel({ store: 'web' })).toBe('your Aviary account')
    expect(storeLabel({ store: 'play' })).toBe('Google Play')
    expect(storeLabel(undefined)).toBe('Google Play')
  })
})

describe('formatPrice', () => {
  it('turns paise into rupees, dropping decimals only when whole', () => {
    expect(formatPrice(9900, 'INR')).toBe('₹99')
    expect(formatPrice(9950, 'INR')).toBe('₹99.50')
    expect(formatPrice(99900, 'INR')).toBe('₹999')
  })
})

describe('yearlySavingsPercent', () => {
  it('claims a saving only when there is one', () => {
    expect(yearlySavingsPercent(9900, 99900)).toBe(15)
    expect(yearlySavingsPercent(9900, 9900 * 12)).toBeNull()
    expect(yearlySavingsPercent(0, 100)).toBeNull()
  })
})
