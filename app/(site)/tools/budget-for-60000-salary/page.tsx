import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-60000-salary')

export default function Budget60kPage() {
  return <SalaryBudget salary={60000} path="/tools/budget-for-60000-salary" intro="₹60,000 a month take-home is a solid salary almost anywhere in India. The challenge isn’t covering the basics. It’s making sure the extra actually builds something.">
    <h2>Metro rent at ₹60k</h2>
    <p>The plan gives rent ₹18,000. In Bengaluru, Pune or Hyderabad that’s a decent 1BHK. In Mumbai it may not stretch that far. Say your rent is ₹22,000: type it in and wants drop from ₹18,000 to ₹14,000, while savings stay at ₹12,000. That’s still a comfortable month.</p>

    <h2>Build the emergency fund first</h2>
    <p>Essentials on this plan come to ₹30,000 a month: rent, groceries, bills and transport. Six months of that is ₹1.8 lakh. If you send the whole ₹12,000 of savings there, you’re done in 15 months. Split it half and half with investments and it takes 30. Our advice: fund it fully first. It’s the money that stops a job change or a hospital bill from turning into credit card debt.</p>

    <h2>Then make the ₹12,000 work</h2>
    <p>Once the emergency fund is built, the whole ₹12,000 can go into investments: a SIP in an index fund, PPF, or whatever suits your goals. ₹12,000 a month is ₹1.44 lakh a year before any returns. That’s a down payment, a sabbatical, or a real cushion.</p>

    <h2>Plan the yearly costs</h2>
    <p>At this salary, the expenses that hurt are the ones that don’t come monthly: health insurance renewal, a trip home at Diwali, a new phone, the annual car service. Add up last year’s and divide by twelve. Put that much aside every month in its own category. When the bill comes, the money’s already there.</p>
    <p>Want to check a new flat before you sign? Use the <Link href="/tools/rent-affordability-calculator">rent calculator</Link> with your EMIs included.</p>
  </SalaryBudget>
}
