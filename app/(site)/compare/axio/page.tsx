import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/axio')

export default function AxioPage() {
  return <ContentPage section="compare" path="/compare/axio" related={['/compare/walnut', '/features/budget-without-bank-linking', '/features/recurring-expenses']}>
    <h1>Aviary vs axio</h1>
    <p className="legal-updated">Facts about axio checked {COMPARE_CHECKED}</p>
    <p className="lp-lede-doc">axio, formerly Walnut, tracks your spending by reading transactional SMS from your bank. It’s also a credit platform with Pay Later, EMIs and personal loans. Aviary is a budget you log yourself. It never reads your SMS and has nothing to lend you.</p>

    <h2>The short version</h2>
    <p>If you want a budget, not just a record of what you spent, Aviary is the better fit.</p>
    <ul>
      <li><strong>Your messages stay private.</strong> Aviary never asks for SMS access or a bank login.</li>
      <li><strong>A plan before you spend.</strong> Your salary gets split into categories at the start of the month, so you always know what’s left.</li>
      <li><strong>No loans, no Pay Later.</strong> Aviary makes money from your subscription, not from lending to you.</li>
    </ul>
    <p>axio still makes sense if you want spends tracked from SMS for free and you’re open to its credit products.</p>

    <h2>Side by side</h2>
    <CompareTable them="axio" rows={[
      ['Price', '₹199 a month after a 30-day free trial', 'Free to install'],
      ['How spends get in', 'You log them, with nudges, one-line catch-up, bill scanning and recurring expenses', 'Reads transactional SMS. axio says it doesn’t read personal SMS'],
      ['Budgeting', 'Assign every rupee to a category; see what’s left before you spend', 'Spending limits with alerts'],
      ['Credit products', 'None', 'Pay Later, no-cost EMIs, personal loans (14% to 35% a year, per its listing), fixed deposits'],
      ['Bill reminders', 'Recurring expenses and subscriptions, with renewal heads-ups', 'Yes'],
      ['Receipts', 'Scan a bill into spends', 'Attach bill photos to transactions'],
      ['Platforms', 'Android and web', 'Android. We couldn’t confirm a working iPhone listing'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Privacy.</strong> No SMS permission, no bank login. You decide what goes in.</li>
      <li><strong>You notice your spending.</strong> Auto-tracking files spends away quietly. Logging a spend takes a second, and that second is when you notice it. Aviary makes it one tap with habit nudges. More on that on <Link href="/features/budget-without-bank-linking">budgeting without linking your bank</Link>.</li>
      <li><strong>A plan, not just a log.</strong> You give your salary jobs at the start of the month, so you always know what’s left for each one.</li>
      <li><strong>No upsell.</strong> There’s nothing to borrow in Aviary. Your subscription is the business.</li>
    </ul>

    <h2>Where axio is stronger</h2>
    <ul>
      <li><strong>Automatic tracking.</strong> Card and bank spends show up without you typing.</li>
      <li><strong>Free.</strong> No subscription to track spending.</li>
      <li><strong>Credit when you want it.</strong> If you need Pay Later or a loan, it’s in the same app.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://play.google.com/store/apps/details?id=com.daamitt.walnut.app', 'axio on Google Play'],
      ['https://www.axio.co.in/', 'axio’s website'],
    ]} />
    <SoftCta title="A budget that doesn’t read your messages" placement="compare_axio">Try Aviary free for 30 days. No SMS access, no bank link, no card to start.</SoftCta>
  </ContentPage>
}
