import { describe, expect, it } from 'vitest'
import { subscriptionEmailKind, subscriptionTemplate } from './subscriptionTemplate'

describe('subscription email mapping', () => {
  it.each([
    ['razorpay', 'subscription.charged', 'paid'], ['razorpay', 'subscription.pending', 'failed'],
    ['razorpay', 'subscription.halted', 'failed'], ['razorpay', 'subscription.cancelled', 'cancelled'],
    ['revenuecat', 'RENEWAL', 'paid'], ['revenuecat', 'BILLING_ISSUE', 'failed'],
  ] as const)('maps %s %s', (provider, event, kind) => expect(subscriptionEmailKind(provider, event)).toBe(kind))
  it('does not call trials, free purchases, refunds or billing-error cancellations paid/user cancellations', () => {
    expect(subscriptionEmailKind('revenuecat', 'INITIAL_PURCHASE', 'TRIAL')).toBeNull()
    expect(subscriptionEmailKind('revenuecat', 'RENEWAL', 'NORMAL', undefined, 0)).toBeNull()
    expect(subscriptionEmailKind('revenuecat', 'CANCELLATION', undefined, 'CUSTOMER_SUPPORT')).toBeNull()
    expect(subscriptionEmailKind('revenuecat', 'CANCELLATION', undefined, 'BILLING_ERROR')).toBeNull()
    expect(subscriptionEmailKind('revenuecat', 'CANCELLATION', undefined, 'UNSUBSCRIBE')).toBe('cancelled')
  })
  it('uses store-specific management, escapes names and avoids claiming lost access on failed payment', () => {
    const email = subscriptionTemplate('failed', '<Alex>', 'play', null)
    expect(email.html).toContain('&lt;Alex&gt;')
    expect(email.text).toContain('https://play.google.com/store/account/subscriptions')
    expect(email.text).toContain('your current access is shown in Aviary')
    expect(subscriptionTemplate('paid', null, 'web', null).text).toContain('https://useaviary.com/account')
  })
})
