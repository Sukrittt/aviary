import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, Screen, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/features/recurring-expenses')

export default function RecurringExpensesPage() {
  return <ContentPage section="features" path="/features/recurring-expenses" title="Track subscriptions and recurring expenses" lede={<>Rent, EMIs, the milk bill, Netflix, Spotify, the gym. They come every month whether you notice or not. In Aviary they log themselves, and you get a heads-up before a renewal charges.</>} related={['/features/budget-without-bank-linking', '/features/ask-aviary', '/tools/salary-budget-planner']}>
    <Screen src="/landing/subscriptions.png" alt="Aviary’s Subscriptions screen: ₹2,636 a month across 6 subscriptions, about ₹31,632 a year, with cult.fit and Netflix the biggest." caption="Six subscriptions, ₹2,636 a month. About ₹31,632 a year." />

    <h2>See what you’re really paying</h2>
    <p>Small subscriptions hide. ₹199 here, ₹149 there. Aviary lists every subscription with its price, how often it renews and the next due date. It adds them up per month and per year, so you see the ₹31,000 a year you didn’t know you were spending.</p>

    <h2>Recurring expenses log themselves</h2>
    <p>Set up rent, an EMI or a weekly delivery once, with its amount, category and schedule. On the day, it’s logged for you. That’s a whole set of spends you never have to remember.</p>

    <h2>A heads-up before it charges</h2>
    <p>Aviary nudges you a few days before a subscription renews, like “Netflix renews soon, ₹199 due in 3 days”. That’s your chance to cancel the one you stopped watching.</p>

    <h2>It spots the ones you missed</h2>
    <p>Logged the same thing at the same amount a few months running? Aviary suggests turning it into a recurring expense or a subscription. You decide.</p>

    <h2>Without reading your SMS</h2>
    <p>Many subscription trackers in India read your bank SMS to find recurring charges. Aviary doesn’t. You add what you pay, once, and it takes it from there. Read why on <Link href="/features/budget-without-bank-linking">budgeting without linking your bank</Link>.</p>
    <SoftCta title="Find your forgotten subscriptions" placement="feature_recurring">Add your subscriptions in Aviary’s free trial and see the yearly total.</SoftCta>
  </ContentPage>
}
