import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-80000-salary')

export default function Budget80kPage() {
  return <SalaryBudget salary={80000} path="/tools/budget-for-80000-salary" intro="At ₹80,000 a month take-home, the basics are covered and there’s real money left over. What you do with it decides whether you’re building something or just spending more.">
    <h2>Metro rent at ₹80k</h2>
    <p>The plan sets rent at ₹24,000. In most big cities that’s a good 1BHK. In Mumbai it may not stretch as far. If yours is ₹28,000, type it in. Wants drop from ₹24,000 to ₹20,000, and savings stay at ₹16,000.</p>
    <p>Paying less, say ₹20,000? The ₹4,000 you save on rent goes to savings, not wants. You’d put away ₹20,000 a month.</p>

    <h2>Emergency fund: ₹2.4 lakh</h2>
    <p>Essentials on this plan come to ₹40,000 a month. Six months of that is ₹2.4 lakh. At ₹8,000 a month it takes 30 months. Send the full ₹16,000 there and it’s 15. Fund it first. A job switch or a hospital bill is a lot easier with that cushion behind you.</p>

    <h2>Give the extra a job</h2>
    <p>Once the fund’s built, ₹16,000 a month into a SIP or PPF is ₹1.92 lakh a year before returns. This is also the salary where bigger goals show up: a home down payment, a car, a wedding. Give each one its own category and a monthly amount, so it doesn’t share a balance with everything else.</p>

    <h2>Yearly costs add up</h2>
    <p>Family health insurance, car insurance and service, school fees, Diwali gifts. Add up last year’s and the total can be a surprise. The <Link href="/tools/sinking-fund-calculator">sinking fund calculator</Link> turns them into one monthly number. Compare with a <Link href="/tools/budget-for-1-lakh-salary">₹1 lakh budget</Link> to see where the next raise could go.</p>
  </SalaryBudget>
}
