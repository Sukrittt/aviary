import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/walnut')

export default function WalnutPage() {
  return <ContentPage section="compare" path="/compare/walnut" related={['/compare/axio', '/features/budget-without-bank-linking', '/features/bill-scanning']}>
    <h1>Looking for Walnut? Here’s what changed</h1>
    <p className="legal-updated">Checked {COMPARE_CHECKED}</p>
    <p className="lp-lede-doc">Walnut was one of India’s best-known expense trackers. It doesn’t exist as its own app any more. Its Google Play listing is now <strong>axio: Income &amp; Expense Tracker</strong>, from Axio Digital.</p>
    <p>axio says it’s “formerly known as Capital Float, Walnut &amp; Walnut 369”. So if you had Walnut installed, the app you’d get today is axio. It still tracks spending from your SMS, and it also offers credit: Pay Later, EMIs and personal loans.</p>

    <h2>What that means if you want a Walnut alternative</h2>
    <p>People liked Walnut because it filled itself in. It read bank SMS and showed where money went, with no typing. axio keeps that. If that’s what you want, axio is the direct successor, and we compare it in detail on <Link href="/compare/axio">Aviary vs axio</Link>.</p>
    <p>If you want something different, like a budget that tells you what you can still spend before you spend it, without giving an app your SMS, that’s what Aviary does.</p>

    <h2>Side by side</h2>
    <CompareTable them="Walnut (now axio)" rows={[
      ['Still available as Walnut', 'n/a', 'No. The listing is now axio'],
      ['How spends get in', 'You log them, with nudges, one-line catch-up, bill scanning and recurring expenses', 'Reads transactional SMS'],
      ['Budgeting', 'Every rupee gets a category before you spend it', 'Spending limits and alerts'],
      ['Credit and loans', 'None', 'Pay Later, EMIs, personal loans and fixed deposits'],
      ['Price', '₹199 a month after a 30-day free trial', 'Free to install'],
      ['Platforms', 'Android and web', 'Android. We couldn’t confirm a working iPhone listing'],
    ]} />

    <h2>Where axio (ex-Walnut) is stronger</h2>
    <ul>
      <li><strong>No typing.</strong> SMS tracking fills in your spends for you.</li>
      <li><strong>Free.</strong> There’s no subscription to track spending.</li>
      <li><strong>Scale.</strong> The listing shows over a crore downloads.</li>
    </ul>

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>No SMS or bank access.</strong> Aviary never reads your messages or links your bank.</li>
      <li><strong>A real budget.</strong> You plan the month in categories, so you know what’s left for food or fun before you pay.</li>
      <li><strong>Nothing to sell you.</strong> No loans or offers. Your subscription is how Aviary makes money.</li>
      <li><strong>A web app.</strong> Same budget on a bigger screen.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://play.google.com/store/apps/details?id=com.daamitt.walnut.app', 'The former Walnut listing on Google Play, now axio'],
      ['https://www.axio.co.in/about-us', 'axio, about us'],
    ]} />
    <SoftCta title="Budget without handing over your SMS" placement="compare_walnut">Aviary’s free for 30 days, no card needed. Logging takes one tap once it learns your routine.</SoftCta>
  </ContentPage>
}
