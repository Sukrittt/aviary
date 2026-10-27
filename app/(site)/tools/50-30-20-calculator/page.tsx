import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { Calculator503020 } from '@/src/components/content/Calculators'
import { postLinks } from '@/lib/blog'

export const metadata = pageMetadata('/tools/50-30-20-calculator')

export default function Calculator503020Page() {
  return <ContentPage section="tools" path="/tools/50-30-20-calculator" title="50/30/20 budget calculator" lede={<>Put in what lands in your account each month. The calculator splits it into needs, wants and savings.</>} related={[...postLinks('50-30-20-rule-india', 'zero-based-budgeting-salary-india'), '/tools/salary-budget-planner', '/tools/emergency-fund-calculator', '/tools/rent-affordability-calculator']}>
    <Calculator503020 />

    <h2>What the 50/30/20 rule says</h2>
    <p>Half your take-home pay covers needs. Thirty percent goes on wants. Twenty percent goes to savings and paying off debt. It’s a starting point, not a law, and it’s popular because it’s easy to remember.</p>
    <p>Use take-home pay, the amount after tax, PF and any salary deductions. A CTC of ₹8 lakh a year doesn’t mean ₹66,667 a month. PF, professional tax and any income tax come out first, and some of the CTC may be a bonus that’s paid later. Plan with what actually arrives.</p>

    <h2>What counts as a need in India</h2>
    <ul>
      <li>Rent or your share of the household’s costs</li>
      <li>Groceries, milk and vegetables</li>
      <li>Electricity, gas, water, phone and internet</li>
      <li>Getting to work: metro, bus, fuel, the auto you can’t skip</li>
      <li>EMIs and minimum card payments</li>
      <li>Insurance premiums, school fees, money you send home</li>
    </ul>
    <p>Wants are the rest: eating out, Swiggy and Zomato, shopping, OTT subscriptions, trips. Savings means an emergency fund first, then SIPs, PPF or whatever you invest in.</p>

    <h2>When 50/30/20 doesn’t fit</h2>
    <p><strong>Rent in a metro eats more than half.</strong> On ₹35,000 in Bengaluru or Mumbai, rent alone can be ₹15,000. Needs might hit 65%. That’s normal. Take it from wants first, and try to keep at least 10% for savings.</p>
    <p><strong>You live with family.</strong> Your needs could be 20%. Don’t let the gap drift into wants. Push savings to 40% or more while it’s easy.</p>
    <p><strong>You send money home.</strong> Treat it as a need. It isn’t optional, so it doesn’t belong in wants.</p>

    <h2>Making it stick</h2>
    <p>The split is the easy part. The hard part is knowing, on the 18th, whether there’s still room for dinner out. That means writing spends down as they happen. If you want more detail than three buckets, the <Link href="/tools/salary-budget-planner">salary budget planner</Link> breaks the same split into rent, groceries, transport and more.</p>
    <SoftCta title="Keep the split all month" placement="tool_503020">In Aviary, needs, wants and savings become categories. Every spend shows what’s left, so you know before you pay.</SoftCta>
  </ContentPage>
}
