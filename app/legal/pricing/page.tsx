import { getPlanPrices, type PlanPrice } from '@/lib/billing/razorpay'
import { formatPrice, yearlySavingsPercent } from '@/src/components/billing/copy'

export const metadata = { title: 'Pricing — Aviary' }
// Read from Razorpay (cached in-process), so the page always shows the price that's actually charged.
export const dynamic = 'force-dynamic'

async function loadPrices(): Promise<PlanPrice[] | null> {
  try {
    return await getPlanPrices()
  } catch {
    // Razorpay unreachable: say so rather than failing the whole page.
    return null
  }
}

export default async function PricingPage() {
  const prices = await loadPrices()
  const monthly = prices?.find((p) => p.period === 'monthly')
  const yearly = prices?.find((p) => p.period === 'yearly')
  const saving = monthly && yearly ? yearlySavingsPercent(monthly.amount, yearly.amount) : null

  return (
    <article className="legal-doc">
      <h1>Pricing</h1>

      <p>
        Every account starts with a <strong>45-day free trial</strong>. No card, no UPI mandate, nothing to
        cancel. After that, pick a plan to keep going.
      </p>

      <h2>Plans</h2>
      {monthly && yearly ? (
        <ul>
          <li>
            <strong>Monthly:</strong> {formatPrice(monthly.amount, monthly.currency)} a month
          </li>
          <li>
            <strong>Yearly:</strong> {formatPrice(yearly.amount, yearly.currency)} a year
            {saving ? ` (save ${saving}% over monthly)` : ''}
          </li>
        </ul>
      ) : (
        <p>Prices aren&apos;t loading right now. They&apos;re always shown in the app before you pay.</p>
      )}
      <p>
        Both plans include everything: envelopes, transactions, insights, investments, Money Brain, bill
        scanning and Wrapped. Prices include applicable taxes. Google Play may show a slightly different local
        price in the Android app.
      </p>

      <h2>How to pay</h2>
      <ul>
        <li>On the website, with UPI AutoPay or a card, through Razorpay.</li>
        <li>In the Android app, through Google Play.</li>
      </ul>
      <p>
        Plans renew automatically until you cancel, and you can cancel any time. See the{' '}
        <a href="/legal/refunds">refund and cancellation policy</a> and <a href="/legal/terms">terms</a>.
      </p>
    </article>
  )
}
