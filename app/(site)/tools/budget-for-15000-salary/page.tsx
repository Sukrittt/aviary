import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-15000-salary')

export default function Budget15kPage() {
  return <SalaryBudget salary={15000} path="/tools/budget-for-15000-salary" faqs={[
    { q: 'How much should I save from a ₹15,000 salary?', a: 'Aim for ₹3,000 a month, which is 20%. If that’s too much right now, start with ₹500 or ₹1,000 and raise it with every increment. Move it out on salary day so it never sits with your spending money.' },
    { q: 'How can I save money from a ₹15,000 salary?', a: 'Rent and food are most of the month, so start there: living with family or sharing a room frees up the most. Then cut the small repeats like food delivery, cabs and unused subscriptions. Check what’s left in a category before you spend from it.' },
    { q: 'How much rent can I afford on ₹15,000?', a: 'About ₹3,500 is comfortable and ₹4,500 is a stretch. Above that, the plan takes it out of wants first. At ₹9,000 rent there’s nothing left for wants at all.' },
    { q: 'Is the 50/30/20 rule realistic on ₹15,000?', a: 'Only if rent is low. Needs get ₹7,500, and rent alone can take that in a metro. If needs go over, keep savings at ₹3,000 and shrink wants instead. A smaller wants budget is easier to live with than no savings.' },
  ]} intro="₹15,000 a month is a common first salary in smaller cities and in a lot of entry-level jobs. It’s tight, so every rupee needs a job before the month starts, not after.">
    <h2>Rent decides everything</h2>
    <p>The plan above gives rent ₹4,500, which is 30%. In a metro that usually means a shared room, a hostel or a PG outside the centre. If you pay ₹7,000, type it in: wants drop from ₹4,500 to ₹2,000, and savings stay at ₹3,000. Living with family? Put 0, and all ₹4,500 goes to savings, so you’d save ₹7,500 a month.</p>

    <h2>₹3,000 for food, bills and travel</h2>
    <p>₹1,500 for groceries, ₹700 for bills and phone and ₹800 for transport. That’s tight, so cook more than you order, pick a cheap prepaid plan, and use the bus or metro where you can. If a mess or tiffin service is cheaper than cooking where you live, count it as groceries, not eating out.</p>

    <h2>Saving ₹3,000 a month</h2>
    <p>₹1,500 to an emergency fund and ₹1,500 to a recurring deposit or SIP. Essentials on this plan are ₹7,500 a month, so a three-month fund is ₹22,500. At ₹1,500 a month that takes 15 months. Send all ₹3,000 there and it takes 8.</p>
    <p>Can’t manage ₹3,000 yet? Start at ₹500. The habit is the hard part, and the amount grows with your salary. See how long your pace takes with the <Link href="/tools/emergency-fund-calculator">emergency fund calculator</Link>.</p>

    <h2>When ₹15,000 doesn’t cover the month</h2>
    <p>Before cutting anything, write down every spend for one month. Most people find one or two leaks, like food delivery or a cab habit, that are worth more than every small cut put together. Fix those first. The <Link href="/tools/budget-for-20000-salary">₹20k budget</Link> shows what the next raise opens up.</p>
  </SalaryBudget>
}
