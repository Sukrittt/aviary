import Link from 'next/link'
import { BellIcon, BrainIcon, GiftIcon, BankIcon, EnvelopeSimpleIcon, MonitorIcon, ChartPieIcon, RepeatIcon, ScanIcon, DeviceMobileIcon, WalletIcon, WifiSlashIcon } from '@/src/components/icons'
import { pageMetadata } from '@/lib/seo'
import { visitorCheckoutProvider, visitorPlanPrices } from '@/lib/billing/prices'
import { formatPrice, PLAY_STORE_URL, yearlySavingsPercent } from '@/src/components/billing/copy'
import { BirdLanding } from '@/src/components/BirdMark'
import { TrackedLink } from '@/src/components/TrackedLink'
import { Faq, LandingMotion } from '@/src/components/landing/LandingClient'
import { LandingFooter, LandingHeader } from '@/src/components/landing/Chrome'
import '@/src/landing.css'

export const metadata = pageMetadata('/legal/pricing')
// Read from Razorpay or PayPal (cached in-process) by the visitor's country, so the page always shows the price that's actually charged.
export const dynamic = 'force-dynamic'

/** A plan's price split over `parts`, rounded to a whole rupee, or to a cent for other currencies. */
const perUnit = (amount: number, parts: number, currency: string) => {
  const step = currency === 'INR' ? 100 : 1
  return Math.round(amount / parts / step) * step
}

const INCLUDED = [
  { icon: WalletIcon, tone: 'rent', title: 'Categories', body: 'Set money aside by purpose. See what’s left before you spend.' },
  { icon: BellIcon, tone: 'fun', title: 'Habit nudges', body: 'Aviary learns your routine and nudges you while it’s fresh.' },
  { icon: ScanIcon, tone: 'food', title: 'Receipt scanning', body: 'Snap the bill. Every line read, split if you shared.' },
  { icon: RepeatIcon, tone: 'savings', title: 'Bills and subscriptions', body: 'Renewals with due dates, and a heads-up before they charge.' },
  { icon: ChartPieIcon, tone: 'savings', title: 'Insights', body: 'Every month next to the last twelve, category by category.' },
  { icon: BankIcon, tone: 'rent', title: 'Investments', body: 'Equity, FDs, gold and crypto, with your net worth charted.' },
  { icon: BrainIcon, tone: 'food', title: 'Money Brain', body: 'Ask about your spending in plain words and get a straight answer.' },
  { icon: GiftIcon, tone: 'fun', title: 'Wrapped', body: 'Your month as a recap, longest logging streak included.' },
  { icon: MonitorIcon, tone: 'rent', title: 'Web app', body: 'Same budget, bigger screen, always in sync.' },
  { icon: WifiSlashIcon, tone: 'food', title: 'Works offline', body: 'Logs wait on your phone, then sync when you’re back.' },
]

const FAQS = [
  { q: 'What happens when my trial ends?', a: 'Nothing is charged. When you open the app, you’ll see the two plans and pick one to carry on. Your categories and history stay exactly where you left them, and you can export your data whether or not you subscribe.' },
  { q: 'Do I need a card to start?', a: 'No. There’s no card, no UPI mandate and nothing to cancel during the 30 days. You only set up a payment method if you decide to keep going.' },
  { q: 'Can I cancel?', a: 'Any time, with no fee and no notice period. You keep full access until the end of the period you’ve already paid for.' },
  { q: 'Do you offer refunds?', a: <>Payments cover the period you’ve started, so we don’t refund part of a month or year after you cancel. Some cases do get a full refund, and the <Link href="/legal/refunds">refund and cancellation policy</Link> lists them.</> },
  { q: 'Are taxes included?', a: 'Yes. The price you see here is the price you pay on the website. Google Play sets its own local prices, so the Android app may show a slightly different number.' },
  { q: 'Why isn’t Aviary free?', a: 'Aviary is built by one person and paid for by the people who use it. That keeps it free of ads and free of selling your data. The code is open source, too.' },
]

export default async function PricingPage() {
  const [prices, provider] = await Promise.all([visitorPlanPrices(), visitorCheckoutProvider()])
  const monthly = prices?.find((p) => p.period === 'monthly')
  const yearly = prices?.find((p) => p.period === 'yearly')
  const saving = monthly && yearly ? yearlySavingsPercent(monthly.amount, yearly.amount) : null

  return <LandingMotion><div className="lp" id="top">
    <LandingHeader base="/" faq="#faq" />

    <section className="lp-hero" aria-labelledby="pricing-title">
      <p className="lp-early lp-early--still"><b>30 days free</b><span className="lp-early-desktop">No card. No mandate. Nothing to cancel.</span><span className="lp-early-mobile">No card. Nothing to cancel.</span></p>
      <h1 id="pricing-title">Try it for 30 days.<br />Then one simple plan.</h1>
      <p>Every account starts with a free trial of the whole app. When it ends, pick monthly or yearly. Cancel any time.</p>
      <div className="lp-hero-actions">
        <TrackedLink className="lp-button lp-button--dark" href={PLAY_STORE_URL} event="store_cta_clicked" properties={{ placement: 'pricing_hero' }}><DeviceMobileIcon size={18} aria-hidden="true" />Start your free trial</TrackedLink>
        <Link href="/expense" className="lp-button lp-button--ghost"><MonitorIcon size={18} aria-hidden="true" />Open web app</Link>
      </div>
      <span className="lp-hero-note">Prices include taxes · Pay on the web or through Google Play</span>
    </section>

    <section className="lp-plans-wrap" aria-labelledby="plans-title">
      <h2 id="plans-title" className="lp-sr-only">Plans</h2>
      {monthly && yearly ? (
        <div className="lp-plans">
          <section className="lp-plan" aria-labelledby="monthly-plan-title">
            <div className="lp-plan-head"><h3 id="monthly-plan-title">Monthly</h3></div>
            <p className="lp-plan-price"><strong>{formatPrice(monthly.amount, monthly.currency)}</strong><span>/ month</span></p>
            <p className="lp-plan-eq">About {formatPrice(perUnit(monthly.amount, 30, monthly.currency), monthly.currency)} a day.</p>
            <p className="lp-plan-billing">Billed monthly. Cancel any time.</p>
          </section>
          <section className="lp-plan lp-plan--yearly" aria-labelledby="yearly-plan-title">
            <div className="lp-plan-head"><h3 id="yearly-plan-title">Yearly</h3>{saving ? <span className="lp-plan-save">Save {saving}%</span> : null}</div>
            <p className="lp-plan-price"><strong>{formatPrice(yearly.amount, yearly.currency)}</strong><span>/ year</span></p>
            <p className="lp-plan-eq">Works out to {formatPrice(perUnit(yearly.amount, 12, yearly.currency), yearly.currency)} a month.</p>
            <p className="lp-plan-billing">Billed once a year. Cancel any time.</p>
          </section>
        </div>
      ) : (
        <p className="lp-plans-empty">Prices aren&apos;t loading right now. They&apos;re always shown in the app before you pay.</p>
      )}
      <p className="lp-plans-note">Both plans include everything below. Google Play may show a slightly different local price in the Android app.</p>
    </section>

    <section className="lp-section lp-center" aria-labelledby="included-title">
      <h2 id="included-title" className="lp-h2">Everything’s included.</h2>
      <p className="lp-lede">No tiers, no add-ons, no features behind a bigger plan. Both plans unlock the whole nest.</p>
      <ul className="lp-includes">
        {INCLUDED.map(({ icon: Icon, tone, title, body }) => <li key={title} className="lp-card">
          <span className={`lp-include-icon lp-tone-${tone}`} aria-hidden="true"><Icon size={22} /></span>
          <strong>{title}</strong><span>{body}</span>
        </li>)}
      </ul>
    </section>

    <section className="lp-section lp-center" aria-labelledby="pay-title">
      <h2 id="pay-title" className="lp-h2">Pay where you like.</h2>
      <p className="lp-lede">Same plan, two ways to pay. Pick the checkout that suits you.</p>
      <div className="lp-pay">
        <div className="lp-card lp-pay-card">
          <span className="lp-include-icon lp-tone-savings" aria-hidden="true"><MonitorIcon size={22} /></span>
          <strong>On the website</strong>
          <span>{provider === 'paypal' ? 'PayPal or a card, through PayPal.' : 'UPI AutoPay or a card, through Razorpay.'} Manage it any time from Account, then Subscription.</span>
        </div>
        <div className="lp-card lp-pay-card">
          <span className="lp-include-icon lp-tone-food" aria-hidden="true"><DeviceMobileIcon size={22} /></span>
          <strong>In the Android app</strong>
          <span>Through Google Play, next to your other subscriptions. Cancel from the Play Store like any other.</span>
        </div>
      </div>
      <p className="lp-body lp-pay-note">
        Plans renew automatically until you cancel, and you can cancel any time. See the{' '}
        <Link href="/legal/refunds">refund and cancellation policy</Link> and <Link href="/legal/terms">terms</Link>.
      </p>
    </section>

    <section id="faq" className="lp-section lp-faq-section" aria-labelledby="faq-title"><h2 id="faq-title" className="lp-h2">Money questions.</h2><Faq items={FAQS} /></section>

    <section className="lp-section lp-close" aria-labelledby="get-title">
      <span className="lp-close-bird"><BirdLanding size={120} alive /></span>
      <h2 id="get-title" className="lp-h2">Start with the free 30 days.</h2>
      <div className="lp-hero-actions">
        <TrackedLink className="lp-button lp-button--dark" href={PLAY_STORE_URL} event="store_cta_clicked" properties={{ placement: 'pricing_footer' }}><DeviceMobileIcon size={18} aria-hidden="true" />Get it on Google Play</TrackedLink>
        <Link href="/expense" className="lp-button lp-button--ghost"><MonitorIcon size={18} aria-hidden="true" />Open web app</Link>
      </div>
      <span className="lp-hero-note">No card needed · Cancel any time · <Link href="/legal/contact"><EnvelopeSimpleIcon size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />Questions? Write to us</Link></span>
    </section>

    <LandingFooter base="/" faq="#faq" />
  </div></LandingMotion>
}
