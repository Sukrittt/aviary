import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, Screen, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/features/budget-without-bank-linking')

export default function NoBankLinkPage() {
  return <ContentPage section="features" path="/features/budget-without-bank-linking" title="Budget without linking your bank" lede={<>Aviary never asks for your bank login, account aggregator consent or SMS access. You log what you spend, and Aviary makes that take one tap.</>} related={['/compare/axio', '/compare/goodbudget', '/features/recurring-expenses']}>
    <Screen src="/landing/poster-log.jpg" alt="Aviary’s Log expense keypad with ₹250 entered for Rapido in the Cabs & Auto category." caption="₹250, Rapido. The category picks itself." />

    <h2>Why not just sync?</h2>
    <p>Sync sounds easier, and for tracking, it is. But a budget only works if you notice what you spend. When an app reads your SMS and files every UPI payment away, money leaves and you never feel it. At the end of the month you get a chart, and the chart is too late.</p>
    <p>Logging a spend takes a second. That second is when you see “₹800 left in Eating out” and decide about Saturday. Aviary keeps that second and takes away the rest of the effort.</p>

    <h2>How logging stays quick</h2>
    <ul>
      <li><strong>Habit nudges.</strong> Log the same thing on the same weekday around the same time three times in eight weeks, and Aviary learns it. Next time, it nudges you 15 minutes after with the amount, category and payment method filled in. Tap Log on the notification and you’re done.</li>
      <li><strong>The keypad.</strong> Amount, a word or two, and the category picks itself from your history.</li>
      <li><strong>One line for missed days.</strong> Type “auto 240, lunch 150” in <Link href="/features/ask-aviary">Ask Aviary</Link> and check the spends before they’re saved.</li>
      <li><strong>Bill scanning</strong> for long receipts, and <Link href="/features/recurring-expenses">recurring expenses</Link> for rent and subscriptions.</li>
      <li><strong>Offline.</strong> Logs wait on your phone and sync when you’re back online.</li>
    </ul>

    <h2>What you keep private</h2>
    <p>No bank credentials, no SMS permission, no account aggregator link. Amounts and notes you log are encrypted in the database, there are no ads, and your data isn’t sold. You can export everything to CSV or delete your account any time.</p>

    <h2>Who it’s for</h2>
    <p>If you want every transaction pulled in automatically, an SMS-based tracker suits you better. We compare one honestly on <Link href="/compare/axio">Aviary vs axio</Link>. If you’ve tried that and still don’t know where your money goes, try logging it yourself for a week.</p>
    <SoftCta title="Log a week. See what you notice." placement="feature_no_bank_link">Aviary’s free for 30 days. No bank, no SMS, no card.</SoftCta>
  </ContentPage>
}
