import { transactionalTemplate } from './transactionalTemplate'
import type { BillingProvider } from '@/lib/billing/records'

export type SubscriptionEmailKind = 'paid' | 'failed' | 'cancelled'
export function subscriptionEmailKind(provider: BillingProvider, type: string, period?: string, reason?: string, price?: number): SubscriptionEmailKind | null {
  if (provider === 'razorpay') {
    if (type === 'subscription.charged') return 'paid'
    if (type === 'subscription.pending' || type === 'subscription.halted') return 'failed'
    if (type === 'subscription.cancelled') return 'cancelled'
  } else if (provider === 'paypal') {
    if (type === 'PAYMENT.SALE.COMPLETED') return 'paid'
    if (type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' || type === 'BILLING.SUBSCRIPTION.SUSPENDED') return 'failed'
    if (type === 'BILLING.SUBSCRIPTION.CANCELLED') return 'cancelled'
  } else {
    if (['INITIAL_PURCHASE', 'RENEWAL'].includes(type) && period !== 'TRIAL' && (price === undefined || price > 0)) return 'paid'
    if (type === 'BILLING_ISSUE') return 'failed'
    if (type === 'CANCELLATION' && ['UNSUBSCRIBE', 'DEVELOPER_INITIATED'].includes(reason ?? '')) return 'cancelled'
  }
  return null
}

export function subscriptionTemplate(kind: SubscriptionEmailKind, name: string | null, store: 'play' | 'web', expiresAt: Date | null, via: BillingProvider = store === 'play' ? 'revenuecat' : 'razorpay') {
  const provider = store === 'play' ? 'Google Play' : via === 'paypal' ? 'PayPal' : 'Razorpay'
  const expiry = expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt.toISOString().slice(0, 10) + ' (UTC)' : null
  // A note from Sukrit like the other emails, but the facts stay up front: what happened, the dates, where to manage it.
  const content = {
    paid: {
      subject: 'Payment received for Aviary',
      paragraphs: [`Your Aviary payment came through ${provider}. Thank you, genuinely. It keeps Aviary going.`, store === 'play' ? 'Your receipt is in Google Play, where you can also manage the subscription.' : 'You can see your plan and change renewal settings in your Aviary account.', 'P.S. If there’s one thing you wish Aviary did, reply and tell me. I read every one.'],
      details: [['Paid via', provider], ...(expiry ? [['Paid through', expiry]] : [])] as [string, string][],
    },
    failed: {
      subject: 'Your Aviary payment didn’t go through',
      paragraphs: [`${provider} couldn’t collect your latest Aviary payment.`, 'Could you check the payment method on your subscription? The payment may be retried automatically, and your current access is shown in Aviary.', 'Already updated it? You can confirm the status in your subscription settings.', 'Stuck? Just reply and I’ll help.'],
    },
    cancelled: {
      subject: 'Your Aviary subscription won’t renew',
      paragraphs: ['Auto-renewal for your Aviary subscription is now off.', ...(expiry && expiresAt!.getTime() > Date.now() ? [`You keep access until ${expiry}.`] : ['You can check your current access in Aviary.']), 'This isn’t a refund. You can manage your subscription anytime from your subscription settings.', 'P.S. If Aviary let you down somewhere, reply and tell me what. It’s the most useful thing I hear.'],
    },
  }[kind]
  return transactionalTemplate({ ...content, name, note: true, signature: 'Sukrit', cta: 'Manage subscription', url: store === 'play' ? 'https://play.google.com/store/account/subscriptions' : 'https://useaviary.com/account', reason: 'You’re getting this because you have an Aviary subscription.' })
}
