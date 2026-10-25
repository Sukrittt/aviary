import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-50000-salary')

export default function Budget50kPage() {
  return <SalaryBudget salary={50000} path="/tools/budget-for-50000-salary" faqs={[
    { q: 'How much should I save from a ₹50,000 salary?', a: '₹10,000 a month, which is 20%. If it all goes to the emergency fund first, a six-month fund of ₹1.5 lakh is built in 15 months. After that it’s ₹1.2 lakh a year into investments.' },
    { q: 'How much rent can I afford on ₹50,000?', a: '₹12,500 is comfortable and ₹15,000 is a stretch. At ₹20,000 rent, wants drop to ₹10,000 and savings stay at ₹10,000.' },
    { q: 'What is the 50/30/20 split of ₹50,000?', a: '₹25,000 for needs, ₹15,000 for wants and ₹10,000 for savings. In this plan, needs are ₹15,000 of rent plus ₹10,000 for groceries, bills and transport.' },
  ]} intro="₹50,000 a month take-home is comfortable in most Indian cities. You can rent your own place, eat out and still save. The trick is deciding how much goes where before the month starts.">
    <h2>Rent: ₹15,000 is the line</h2>
    <p>The plan gives rent ₹15,000, which is 30% of take-home. The <Link href="/tools/rent-affordability-calculator">rent calculator</Link> calls ₹12,500 comfortable and ₹15,000 a stretch at this salary. Found a place for ₹20,000? Type it in. Wants drop from ₹15,000 to ₹10,000, and savings stay at ₹10,000. It still works, but there’s not much slack.</p>

    <h2>₹15,000 for wants</h2>
    <p>₹6,000 for eating out, ₹4,500 for shopping and ₹4,500 for fun and subscriptions. That’s a good amount. It’s also where a ₹50k salary quietly disappears: a weekend plan, a sale, a gadget on EMI. Check what’s left in Eating out before you book the table, not after.</p>

    <h2>₹10,000 a month in savings</h2>
    <p>₹5,000 to an emergency fund and ₹5,000 to investments. Essentials on this plan come to ₹25,000 a month, so a six-month fund is ₹1.5 lakh. At ₹5,000 a month that’s 30 months. Put the full ₹10,000 there and you’re done in 15.</p>
    <p>After that, the whole ₹10,000 can go to a SIP or PPF. That’s ₹1.2 lakh a year before any returns.</p>

    <h2>Plan the yearly costs</h2>
    <p>Health insurance renewal, Diwali, the annual bike or car service. None of them come monthly, so they’re easy to forget until the bill lands. The <Link href="/tools/sinking-fund-calculator">sinking fund calculator</Link> turns them into one monthly amount. Take it out of wants, and the big months stop hurting.</p>
  </SalaryBudget>
}
