import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { RentCalculator } from '@/src/components/content/Calculators'

export const metadata = pageMetadata('/tools/rent-affordability-calculator')

export default function RentCalculatorPage() {
  return <ContentPage section="tools" path="/tools/rent-affordability-calculator" related={['/tools/salary-budget-planner', '/tools/budget-for-40000-salary', '/tools/emergency-fund-calculator']}>
    <h1>How much rent can I afford?</h1>
    <p className="lp-lede-doc">Put in your monthly take-home salary and any EMIs. You’ll get a comfortable rent and a stretch rent, rounded the way listings are.</p>
    <RentCalculator />

    <h2>The rule behind it</h2>
    <p>Keep rent around a quarter of what you take home. Thirty percent is about the limit for most people without the rest of the month getting tight. On ₹60,000, that’s ₹15,000 comfortable and ₹18,000 at a stretch.</p>
    <p>EMIs count too. Rent and EMIs together should stay within 40% of take-home pay, so a ₹12,000 car EMI on a ₹60,000 salary brings the stretch down to ₹12,000.</p>

    <h2>Costs that aren’t in the rent</h2>
    <ul>
      <li><strong>Deposit.</strong> Often two to three months’ rent, and in Bengaluru it can be much more. That’s money you won’t have for a while.</li>
      <li><strong>Maintenance.</strong> Many societies charge it on top. Ask before you sign.</li>
      <li><strong>Brokerage.</strong> Often a month’s rent, paid once.</li>
      <li><strong>Electricity and internet.</strong> Usually separate. Budget ₹1,500 to ₹3,000 a month depending on AC use.</li>
      <li><strong>Getting to work.</strong> A cheaper flat an hour away can cost more once you add cabs.</li>
    </ul>

    <h2>Sharing a flat</h2>
    <p>Use your share of the rent, not the full amount. If two of you split ₹30,000, your number is ₹15,000. Settle utilities and groceries the same way, every month, so nobody quietly ends up paying more.</p>
    <p>Want to see how your rent fits with everything else? Try the <Link href="/tools/salary-budget-planner">salary budget planner</Link> with your real rent.</p>
    <SoftCta title="Know what’s left after rent" placement="tool_rent">Rent is one category in Aviary. Assign it on payday, and every other spend shows what’s left for the month.</SoftCta>
  </ContentPage>
}
