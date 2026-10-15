import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { EmergencyFundCalculator } from '@/src/components/content/Calculators'

export const metadata = pageMetadata('/tools/emergency-fund-calculator')

export default function EmergencyFundPage() {
  return <ContentPage section="tools" path="/tools/emergency-fund-calculator" title="Emergency fund calculator" lede={<>Find out how much you need set aside for a bad month, and how long it’ll take to get there.</>} related={['/tools/salary-budget-planner', '/tools/50-30-20-calculator', '/tools/rent-affordability-calculator']}>
    <EmergencyFundCalculator />

    <h2>What an emergency fund is for</h2>
    <p>It’s money you keep for things you can’t plan: a job loss, a hospital bill your insurance doesn’t cover, a family emergency that means flying home tomorrow. Without it, those land on a credit card or a loan, and a bad month becomes a bad year.</p>

    <h2>How much is enough</h2>
    <p>Count essentials only: rent, groceries, bills, EMIs, insurance and money you send home. Leave out eating out and shopping, since you’d cut those first in a crisis. Then pick how many months to cover:</p>
    <ul>
      <li><strong>3 months</strong> if your job is stable, you have no dependants, and family could help in a pinch.</li>
      <li><strong>6 months</strong> for most people. It’s the usual advice for a reason.</li>
      <li><strong>9 to 12 months</strong> if you freelance, run a business, have dependants or work in an industry that’s laying people off.</li>
    </ul>
    <p>Example: essentials of ₹30,000 a month and six months of cover means ₹1.8 lakh. Saving ₹10,000 a month, you’d get there in 18 months.</p>

    <h2>Where to keep it</h2>
    <p>Somewhere safe and quick to reach, but not in your spending account, where it blends into everything else. A separate savings account, a sweep-in FD or a liquid fund all work. Don’t keep it in stocks. Emergencies tend to come when markets are down.</p>

    <h2>Getting there faster</h2>
    <p>Move the money the day your salary lands, before you can spend it. If six months feels far away, aim for one month first. Then three. The <Link href="/tools/salary-budget-planner">salary planner</Link> sets aside 10% of your salary for this by default.</p>
    <SoftCta title="Watch the fund grow" placement="tool_emergency_fund">Give your emergency fund its own category in Aviary. Every month you add to it, you’ll see how close you are.</SoftCta>
  </ContentPage>
}
