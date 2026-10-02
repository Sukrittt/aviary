// Razorpay's hosted Checkout, loaded on demand. Only the account page's plan
// picker and the locked screen use it, so nobody else pays for the script.

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

interface CheckoutSuccess {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

interface CheckoutOptions {
  key: string
  subscription_id: string
  name: string
  description: string
  prefill?: { email?: string; name?: string }
  theme?: { color?: string }
  handler: (resp: CheckoutSuccess) => void
  modal?: { ondismiss?: () => void }
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open: () => void }
  }
}

let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Let the next attempt try again rather than caching the failure.
      loading = null
      reject(new Error('checkout script failed to load'))
    }
    document.body.appendChild(script)
  })
  return loading
}

export type CheckoutResult =
  | { status: 'paid'; paymentId: string; subscriptionId: string; signature: string }
  | { status: 'dismissed' }

/**
 * Open Checkout for a subscription the server already created, and resolve
 * with what Razorpay hands back. The result proves nothing on its own: the
 * caller sends it to the verify route, which re-checks it with Razorpay.
 */
export async function openCheckout(opts: {
  keyId: string
  subscriptionId: string
  description: string
  prefill?: { email?: string; name?: string }
}): Promise<CheckoutResult> {
  await loadScript()
  const Razorpay = window.Razorpay
  if (!Razorpay) throw new Error('checkout unavailable')
  return new Promise<CheckoutResult>((resolve) => {
    new Razorpay({
      key: opts.keyId,
      subscription_id: opts.subscriptionId,
      name: 'Aviary',
      description: opts.description,
      prefill: opts.prefill,
      theme: { color: '#f4511e' },
      handler: (resp) =>
        resolve({
          status: 'paid',
          paymentId: resp.razorpay_payment_id,
          subscriptionId: resp.razorpay_subscription_id,
          signature: resp.razorpay_signature,
        }),
      modal: { ondismiss: () => resolve({ status: 'dismissed' }) },
    }).open()
  })
}
