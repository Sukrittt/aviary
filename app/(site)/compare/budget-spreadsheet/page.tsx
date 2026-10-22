import { pageMetadata } from '@/lib/seo'
import { CompareTable, ContentPage, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/budget-spreadsheet')

const TEMPLATE = '/templates/aviary-envelope-budget-template.csv'

/** The rows in public/templates/aviary-envelope-budget-template.csv. They add up to ₹45,000. */
const ENVELOPES: [string, string][] = [
  ['Rent', '₹13,000'], ['Groceries', '₹5,000'], ['Bills and phone', '₹2,500'], ['Transport', '₹2,500'],
  ['Eating out', '₹3,000'], ['Shopping', '₹2,500'], ['Fun and subscriptions', '₹2,000'], ['Gifts', '₹1,000'],
  ['Emergency fund', '₹4,500'], ['SIP', '₹7,500'], ['Health insurance set-aside', '₹1,500'],
]

export default function BudgetSpreadsheetPage() {
  return <ContentPage section="compare" path="/compare/budget-spreadsheet" title="Aviary vs a budget spreadsheet" lede={<>A spreadsheet is how a lot of people start budgeting. It’s free, it’s flexible, and you can build it exactly the way you think. The trouble usually isn’t the sheet. It’s keeping it up to date.</>} related={['/compare/goodbudget', '/tools/salary-budget-planner', '/features/budget-without-bank-linking']}>

    <h2>The short version</h2>
    <p>If you’ve tried a budget sheet and stopped filling it in, Aviary is the better fit.</p>
    <ul>
      <li><strong>Logging that keeps up with you.</strong> Aviary learns your routine and nudges you with the amount and category filled in. One tap logs it. A spreadsheet waits for you to open it.</li>
      <li><strong>Built for your phone.</strong> Type “auto 240, lunch 150” and both spends are logged. Or scan the bill.</li>
      <li><strong>Nothing to maintain.</strong> Each new month keeps the same assigned amounts, and what you didn’t spend rolls over. No tabs to copy, no formulas to fix.</li>
    </ul>
    <p>A spreadsheet still makes sense if you enjoy building your own formulas or want it free.</p>

    <h2>Side by side</h2>
    <CompareTable them="Spreadsheet" rows={[
      ['Price', '₹199 a month after a 30-day free trial', 'Google Sheets is free with a Google account. Excel depends on your Microsoft plan'],
      ['Setup', 'Pick categories and assign your take-home pay', 'Build it yourself, or start from our template below'],
      ['Logging', 'Nudges with the amount and category filled in, one tap to log. Type several spends in one line, or scan a bill', 'Open the sheet, find the row and type the spend in'],
      ['Reminders', 'Learns your routine and nudges you to log', 'You remember to open it'],
      ['New month', 'Categories keep the same assigned amounts, plus what you didn’t spend', 'Copy last month’s tab, or clear the spends yourself'],
      ['Recurring costs', 'Recurring expenses with renewal warnings', 'You add them yourself'],
      ['Bank and SMS', 'Never links your bank or reads SMS', 'No bank link. It only holds what you type'],
      ['Flexibility', 'Built around categories and Ready to Assign', 'Any layout, any formula, any chart'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Logging that keeps up with you.</strong> Aviary learns when you usually spend and nudges you with the details filled in. One tap logs it.</li>
      <li><strong>Catch up by typing.</strong> “auto 240, lunch 150” in Ask Aviary becomes two spends in the right categories.</li>
      <li><strong>Bill scanning.</strong> Snap a bill and Aviary reads it into your budget.</li>
      <li><strong>Recurring expenses.</strong> Rent, EMIs and subscriptions are tracked for you, and you’re warned before a renewal.</li>
      <li><strong>No upkeep.</strong> What’s left in each category is always up to date. There’s no formula to drag down or total to fix.</li>
    </ul>

    <h2>Where a spreadsheet is stronger</h2>
    <ul>
      <li><strong>It can be free.</strong> Google Sheets costs nothing with a Google account.</li>
      <li><strong>Total control.</strong> Any layout, any formula, any chart. Want your home loan next to your budget? A sheet can do that.</li>
      <li><strong>iPhone.</strong> Sheets and Excel both have iPhone apps. Aviary is on Android and the web for now.</li>
    </ul>

    <h2>A free envelope budget template</h2>
    <p>Want to try the method in a sheet first? Here’s a month for a ₹45,000 salary, split into 11 envelopes. Type what you spend in the Spent column, and Left shows what’s still there for each envelope.</p>
    <p><a href={TEMPLATE} download>Download the envelope budget template (CSV)</a></p>
    <p>It opens in Google Sheets (File &gt; Import) or Excel. Change the Assigned amounts to match your salary. The total should equal what lands in your account each month.</p>
    <div className="table-scroll"><table>
      <thead><tr><th scope="col">Envelope</th><th scope="col">Assigned</th></tr></thead>
      <tbody>
        {ENVELOPES.map(([name, amount]) => <tr key={name}><th scope="row">{name}</th><td>{amount}</td></tr>)}
        <tr><th scope="row">Total</th><td>₹45,000</td></tr>
      </tbody>
    </table></div>

    <h2>Moving from a sheet to Aviary</h2>
    <p>Your envelopes become categories. Add your take-home pay, assign it to categories until Ready to Assign is empty, and you’re set. Next month keeps the same amounts, so you only change what’s different.</p>
    <SoftCta title="Keep the envelopes, skip the upkeep" placement="compare_spreadsheet">Try Aviary free for 30 days. Set up your categories in a few minutes, no card needed.</SoftCta>
  </ContentPage>
}
