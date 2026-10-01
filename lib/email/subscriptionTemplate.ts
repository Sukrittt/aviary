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
      subject: 'Your Aviary subscription payment was received',
      paragraphs: [`${provider} confirmed your Aviary subscription payment.`, ...(expiry ? [`Your current subscription period ends on ${expiry}.`] : []), store === 'play' ? 'You can find your receipt and manage your subscription in Google Play.' : 'You can review your subscription and manage renewal in your Aviary account.'],
    },
    failed: {
      subject: 'Your Aviary subscription payment needs attention',
      paragraphs: [`${provider} reported a problem collecting your Aviary subscription payment.`, 'Please check your payment method in your subscription settings. The provider may retry the payment; your current access is shown in Aviary.', 'If you have already updated your payment method, check your subscription status before taking further action.'],
    },
    cancelled: {
      subject: 'Your Aviary subscription renewal is cancelled',
      paragraphs: ['Automatic renewal for your Aviary subscription has been turned off.', ...(expiry && expiresAt!.getTime() > Date.now() ? [`Your current access continues until ${expiry}.`] : ['You can check your current access in Aviary.']), 'This confirmation does not indicate a refund. You can manage your subscription in your subscription settings.'],
    },
  }[kind]
  return transactionalTemplate({ ...content, name, cta: 'Manage subscription', url: store === 'play' ? 'https://play.google.com/store/account/subscriptions' : 'https://useaviary.com/account', reason: 'You’re receiving this service email about your Aviary subscription.' })
}
