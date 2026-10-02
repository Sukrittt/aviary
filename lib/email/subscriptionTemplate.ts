import { transactionalTemplate } from './transactionalTemplate'

export type SubscriptionEmailKind = 'paid' | 'failed' | 'cancelled'
export function subscriptionEmailKind(provider: 'razorpay' | 'revenuecat', type: string, period?: string, reason?: string, price?: number): SubscriptionEmailKind | null {
  if (provider === 'razorpay') {
    if (type === 'subscription.charged') return 'paid'
    if (type === 'subscription.pending' || type === 'subscription.halted') return 'failed'
    if (type === 'subscription.cancelled') return 'cancelled'
  } else {
    if (['INITIAL_PURCHASE', 'RENEWAL'].includes(type) && period !== 'TRIAL' && (price === undefined || price > 0)) return 'paid'
    if (type === 'BILLING_ISSUE') return 'failed'
    if (type === 'CANCELLATION' && ['UNSUBSCRIBE', 'DEVELOPER_INITIATED'].includes(reason ?? '')) return 'cancelled'
  }
  return null
}

export function subscriptionTemplate(kind: SubscriptionEmailKind, name: string | null, store: 'play' | 'web', expiresAt: Date | null) {
  const provider = store === 'play' ? 'Google Play' : 'Razorpay'
  const expiry = expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt.toISOString().slice(0, 10) + ' (UTC)' : null
  const content = {
    paid: {
      subject: 'Payment received for Aviary',
      paragraphs: [`We got your Aviary payment through ${provider}. Thanks for supporting the app.`, ...(expiry ? [`Your subscription is paid through ${expiry}.`] : []), store === 'play' ? 'Your receipt is in Google Play, where you can also manage the subscription.' : 'You can see your plan and change renewal settings in your Aviary account.'],
    },
    failed: {
      subject: 'Your Aviary payment didn’t go through',
      paragraphs: [`${provider} couldn’t collect your latest Aviary payment.`, 'Please check the payment method on your subscription. The payment may be retried automatically, and your current access is shown in Aviary.', 'If you’ve already updated it, you can confirm the status in your subscription settings.'],
    },
    cancelled: {
      subject: 'Your Aviary subscription won’t renew',
      paragraphs: ['Auto-renewal for your Aviary subscription is now off.', ...(expiry && expiresAt!.getTime() > Date.now() ? [`You keep access until ${expiry}.`] : ['You can check your current access in Aviary.']), 'This isn’t a refund. You can manage your subscription anytime from your subscription settings.'],
    },
  }[kind]
  return transactionalTemplate({ ...content, name, cta: 'Manage subscription', url: store === 'play' ? 'https://play.google.com/store/account/subscriptions' : 'https://useaviary.com/account', reason: 'You’re getting this because you have an Aviary subscription.' })
}
