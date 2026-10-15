import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-40000-salary')

export default function Budget40kPage() {
  return <SalaryBudget salary={40000} path="/tools/budget-for-40000-salary" intro="At ₹40,000 a month there’s room to breathe. You can rent your own place in many cities and still save. It’s also where money starts slipping away without you noticing.">
    <h2>Rent: ₹10,000 to ₹12,000</h2>
    <p>The plan puts rent at ₹12,000, which is 30%. The <Link href="/tools/rent-affordability-calculator">rent calculator</Link> calls ₹10,000 comfortable and ₹12,000 a stretch. A 1BHK on the edge of a big city or a room in a shared flat in a central area usually lands here. If you find a place for ₹9,000, don’t spend the difference. The planner moves it to savings for you.</p>

    <h2>The ₹12,000 wants budget</h2>
    <p>₹4,800 for eating out, ₹3,600 for shopping and ₹3,600 for fun and subscriptions. That’s a dinner out most weekends, a couple of new things a month, and your OTT plans. It goes faster than it looks. One birthday dinner and a weekend trip can take the whole thing.</p>
    <p>Tip: give yourself a separate category for gifts and occasions. Weddings, birthdays and Diwali come every year. When they come out of “fun”, they wreck the month.</p>

    <h2>₹8,000 a month in savings</h2>
    <p>₹4,000 to an emergency fund and ₹4,000 to investments. Keep going and the emergency fund reaches three months of essentials in a bit over a year, and six months in under three. After that, move the whole ₹8,000 to a SIP or PPF.</p>

    <h2>Watch for this</h2>
    <p>At this salary, the leak is usually EMIs. A phone on no-cost EMI, then a laptop, then a bike. Each one feels small, but together they can take ₹6,000 or more a month for years. If you take one, it’s a need now, so it comes out of savings or wants, not thin air.</p>
  </SalaryBudget>
}
