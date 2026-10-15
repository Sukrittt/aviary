import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { SinkingFundCalculator } from '@/src/components/content/Calculators'

export const metadata = pageMetadata('/tools/sinking-fund-calculator')

export default function SinkingFundPage() {
  return <ContentPage section="tools" path="/tools/sinking-fund-calculator" title="Sinking fund calculator" lede={<>List the big costs you know are coming, like insurance renewals and Diwali. You’ll see how much to put aside each month so the money’s there when the bill is.</>} related={['/tools/emergency-fund-calculator', '/tools/salary-budget-planner', '/tools/budget-for-60000-salary']}>
    <SinkingFundCalculator />

    <h2>What a sinking fund is</h2>
    <p>It’s money you save a little at a time for a cost you know is coming. Not a surprise, just a bill that doesn’t arrive every month: health insurance, vehicle insurance, school fees, Diwali, a wedding in the family, a new phone.</p>
    <p>Pay one of those out of a single month’s salary and that month falls apart. Split it over the months before it’s due and it becomes a small, steady amount you barely notice.</p>

    <h2>An example</h2>
    <p>Here’s the starting list from the calculator above:</p>
    <div className="table-scroll"><table>
      <thead><tr><th scope="col">Cost</th><th scope="col">Amount</th><th scope="col">Due in</th><th scope="col">A month</th></tr></thead>
      <tbody>
        <tr><th scope="row">Health insurance</th><td>₹18,000</td><td>12 months</td><td>₹1,500</td></tr>
        <tr><th scope="row">Diwali</th><td>₹15,000</td><td>8 months</td><td>₹1,900</td></tr>
        <tr><th scope="row">Vehicle insurance</th><td>₹9,000</td><td>6 months</td><td>₹1,500</td></tr>
        <tr><th scope="row">New phone</th><td>₹24,000</td><td>18 months</td><td>₹1,400</td></tr>
        <tr><th scope="row">Total</th><td>₹66,000</td><td></td><td>₹6,300</td></tr>
      </tbody>
    </table></div>
    <p>₹6,300 a month covers ₹66,000 of costs. Each amount is rounded up to the next ₹100, so you end up with a little extra. Diwali gets ₹15,200 by the time it comes, not ₹15,000.</p>

    <h2>Sinking fund vs emergency fund</h2>
    <p>An emergency fund is for things you can’t plan. A sinking fund is for things you can. Keep them apart. If your insurance renewal comes out of the emergency fund, that money isn’t there when you lose a job or land in hospital. Size the other one with the <Link href="/tools/emergency-fund-calculator">emergency fund calculator</Link>.</p>

    <h2>Where to keep the money</h2>
    <p>Somewhere you won’t spend it by accident. A separate savings account works. So does a recurring deposit that matures around when the bill’s due. Move the monthly amount the day your salary lands, the same way you’d pay rent.</p>

    <h2>Keeping it going</h2>
    <p>When a bill’s paid, reset it for next year so the monthly amount stays steady. Add new costs as you find them. If something’s due next month and you haven’t started, the calculator shows the whole amount as one month’s set-aside. That’s the sign to start earlier next time.</p>
    <SoftCta title="Plan for the big bills" placement="tool_sinking_fund">Give each cost a category in Aviary with its monthly amount. Each new month keeps the same amount assigned, so it never gets skipped.</SoftCta>
  </ContentPage>
}
