import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-25000-salary')

export default function Budget25kPage() {
  return <SalaryBudget salary={25000} path="/tools/budget-for-25000-salary" intro="₹25,000 a month is a common first salary, and it’s tight. It works best when you decide where it goes on day one, not on day twenty.">
    <h2>Rent is the whole game</h2>
    <p>The plan above puts rent at ₹7,500. In most metros that means a shared flat or a PG. If your rent is ₹10,000, type it in: wants drop from ₹7,500 to ₹5,000, and savings stay at ₹5,000. At ₹12,500 rent, wants get squeezed to ₹2,500. That’s the line where the month starts to feel stressful.</p>
    <p>If you live with family and pay nothing, put 0. The plan moves the ₹7,500 into savings. At this salary, that’s the fastest way to build a cushion you’ll ever get.</p>

    <h2>Where ₹25k usually leaks</h2>
    <ul>
      <li><strong>Small food orders.</strong> Four ₹250 orders a week is ₹4,000 a month, more than the ₹3,000 set aside for eating out.</li>
      <li><strong>Autos and cabs.</strong> ₹1,300 for transport assumes mostly metro or bus. A daily cab on top of that breaks it in a week.</li>
      <li><strong>Subscriptions you forgot.</strong> Two OTT plans and a music app can be ₹500 or more. That’s a fifth of your fun money.</li>
    </ul>

    <h2>Saving ₹5,000 on ₹25,000</h2>
    <p>It sounds like a lot. Treat it like rent: move it out the day salary lands. Put ₹2,500 in a separate savings account as your emergency fund, and ₹2,500 in a SIP or a recurring deposit. In a year you’ll have ₹30,000 put aside for emergencies. That covers a phone repair, a trip home at short notice, or a month between jobs.</p>
    <p>If ₹5,000 isn’t possible yet, start at ₹1,000. The habit matters more than the amount right now. Use the <Link href="/tools/emergency-fund-calculator">emergency fund calculator</Link> to see how long it takes at your pace.</p>

    <h2>One rule that helps</h2>
    <p>Check what’s left before you spend, not after. If Eating out has ₹800 left on the 20th, that’s your answer about Saturday’s plan. You don’t need willpower when the number’s right there.</p>
  </SalaryBudget>
}
