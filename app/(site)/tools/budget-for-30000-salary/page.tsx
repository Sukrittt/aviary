import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-30000-salary')

export default function Budget30kPage() {
  return <SalaryBudget salary={30000} path="/tools/budget-for-30000-salary" intro="₹30,000 a month is where a lot of first jobs land after a raise or two. It covers the basics, but only if you plan the month before it starts.">
    <h2>Rent: keep it near ₹9,000</h2>
    <p>The plan above puts rent at ₹9,000, which is 30%. In a metro that’s usually a shared flat or a PG. If your rent is ₹12,000, type it in. Wants drop from ₹9,000 to ₹6,000, and savings stay at ₹6,000. That’s about as far as it stretches.</p>
    <p>Living with family? Put 0. The ₹9,000 moves to savings, and you’d put away ₹15,000 a month.</p>

    <h2>The ₹9,000 for wants</h2>
    <p>₹3,600 for eating out, ₹2,700 for shopping and ₹2,700 for fun and subscriptions. That’s a meal out most weeks, a few small buys and your OTT plans. Food delivery is the one to watch. Three ₹300 orders a week is ₹3,600 a month, the whole eating out budget.</p>

    <h2>Saving ₹6,000 a month</h2>
    <p>₹3,000 to an emergency fund and ₹3,000 to a SIP or a recurring deposit. Essentials on this plan come to ₹15,000 a month: rent, groceries, bills and transport. Three months of that is ₹45,000. At ₹3,000 a month you’ll get there in 15 months. Send the full ₹6,000 there first and it takes 8.</p>
    <p>Try your own numbers in the <Link href="/tools/emergency-fund-calculator">emergency fund calculator</Link>.</p>

    <h2>Plan the costs that don’t come monthly</h2>
    <p>Health insurance, a trip home for the festivals, a phone that breaks. On ₹30,000, any one of them can wreck a month. The <Link href="/tools/sinking-fund-calculator">sinking fund calculator</Link> turns them into one small amount to put aside each month, so the money’s there when the bill comes.</p>
  </SalaryBudget>
}
