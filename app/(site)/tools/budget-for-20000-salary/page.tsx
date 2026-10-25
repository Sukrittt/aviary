import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-20000-salary')

export default function Budget20kPage() {
  return <SalaryBudget salary={20000} path="/tools/budget-for-20000-salary" faqs={[
    { q: 'How much should I save from a ₹20,000 salary?', a: '₹4,000 a month, which is 20%. Split it ₹2,000 to an emergency fund and ₹2,000 to a recurring deposit or SIP. If ₹4,000 is too much, start smaller and raise it with each increment.' },
    { q: 'How much rent can I afford on ₹20,000?', a: 'About ₹5,000 is comfortable and ₹6,000 is a stretch. At ₹8,000 rent, wants drop to ₹4,000 and savings stay at ₹4,000.' },
    { q: 'What should a ₹20,000 monthly budget include?', a: 'Rent, groceries, bills and phone, transport, eating out, shopping, fun and savings. On this plan that’s ₹6,000, ₹2,000, ₹1,000, ₹1,000, ₹2,400, ₹1,800, ₹1,800 and ₹4,000.' },
    { q: 'How long does an emergency fund take on ₹20,000?', a: 'Essentials on this plan come to ₹10,000 a month, so three months is ₹30,000. At ₹2,000 a month that takes 15 months. Put all ₹4,000 there and it takes 8.' },
  ]} intro="₹20,000 a month take-home covers the basics in most Indian cities, with a little left for fun and savings. The margin is thin, so a plan made on salary day goes a long way.">
    <h2>Rent: ₹5,000 to ₹6,000</h2>
    <p>The plan sets rent at ₹6,000, which is 30%. The <Link href="/tools/rent-affordability-calculator">rent calculator</Link> calls ₹5,000 comfortable and ₹6,000 a stretch. Pay ₹8,000? Type it in: wants drop from ₹6,000 to ₹4,000, and savings stay at ₹4,000. At ₹10,000, wants fall to ₹2,000, and that’s where most months start to break.</p>

    <h2>₹6,000 for wants</h2>
    <p>₹2,400 for eating out, ₹1,800 for shopping and ₹1,800 for fun and subscriptions. That’s a few meals out, one small buy and an OTT plan. Rotate one subscription a month instead of paying for three at once. The shows will still be there.</p>

    <h2>Saving ₹4,000 a month</h2>
    <p>₹2,000 to an emergency fund and ₹2,000 to a recurring deposit or SIP. Essentials on this plan are ₹10,000 a month, so a three-month fund is ₹30,000: 15 months at ₹2,000, or 8 at the full ₹4,000. After that, the whole ₹4,000 can go to investments. That’s ₹48,000 a year before any returns.</p>

    <h2>Plan for the month that isn’t normal</h2>
    <p>A trip home, a family function, a phone repair. On ₹20,000, one of them can take the whole savings line. The <Link href="/tools/sinking-fund-calculator">sinking fund calculator</Link> turns yearly costs into a small monthly amount, so they stop wrecking a month. Compare with a <Link href="/tools/budget-for-25000-salary">₹25k budget</Link> to see what a raise changes.</p>
  </SalaryBudget>
}
