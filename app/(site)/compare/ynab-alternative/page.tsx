import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/ynab-alternative')

export default function YnabAlternativeGlobalPage() {
  return <ContentPage section="compare" path="/compare/ynab-alternative" title="A cheaper, simpler YNAB alternative" kicker={`Compare · Facts checked ${COMPARE_CHECKED}`} lede={<>YNAB made zero-based budgeting popular: give every dollar a job before you spend it. If you’re looking for something else, it’s usually not the method you want to leave. It’s the price, or how much there is to manage.</>} related={['/compare/ynab-alternative-india', '/compare/goodbudget', '/features/budget-without-bank-linking']}>
    <p>Aviary keeps the method and drops the rest. You give your money jobs in categories, log what you spend, and every spend shows what’s left for that job. And you can bring your YNAB history with you.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>About a third of the price.</strong> $4.90 a month on the web, against $14.99 a month or $109 a year for YNAB.</li>
      <li><strong>Less to manage.</strong> There are no bank connections to keep alive and no imported transactions to approve. You log a spend in a line, and Aviary nudges you around the times you usually spend.</li>
      <li><strong>The same method.</strong> Every dollar gets a job before you spend it, with unassigned money waiting in Ready to Assign. There’s nothing to relearn.</li>
      <li><strong>Your history comes too.</strong> Export your plan from YNAB and upload the zip when you set up Aviary.</li>
    </ul>
    <p>YNAB still makes sense if you want your bank to feed transactions in for you, or you need an iPhone app today.</p>

    <h2>Bring your YNAB history</h2>
    <p>You don’t start over. It takes one file and one review screen.</p>
    <ol>
      <li>In the YNAB web app, click your plan’s name at the top left and choose Export plan. You’ll get a zip.</li>
      <li>Start Aviary and pick “I’m switching apps”, then YNAB.</li>
      <li>Upload the zip as it is. There’s no need to unzip it.</li>
      <li>Check what Aviary found, then tap “Looks right, set me up”.</li>
    </ol>
    <p>Your categories, this month’s assigned amounts, your account names, your paydays and your transaction history come along. Transfers between accounts and starting balances are left out, since they aren’t spending. Past months’ budgets and goals stay in YNAB. Aviary suggests a group for each category, and you can change any of them before you confirm. Already set up? The import is in Settings too. <Link href="/sign-in">Sign in to start the import</Link>.</p>

    <h2>Side by side</h2>
    <CompareTable them="YNAB" rows={[
      ['Price', '$4.90 a month on the web after a 30-day free trial, or less on a yearly plan', '$14.99 a month or $109 a year, plus tax where applicable'],
      ['Free trial', '30 days, no card', '34 days, no card when you sign up on its website'],
      ['Bank import', 'No bank connection. You log spends yourself, and can catch up from a CSV, Excel or PDF statement', 'Direct import for select US, Canadian, UK and EU banks. Elsewhere, file import'],
      ['Platforms', 'Android and web. No iPhone app yet', 'Web, iPhone, iPad, Android and Apple Watch'],
      ['Sharing', 'Up to 6 people in a budget on one plan, each on their own phone, with who-logged-what on every spend', 'Up to six people on one subscription'],
      ['Currency', 'Pick one currency for your budget', 'Pick one currency per plan'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses, widget', 'Mobile widgets, goals, loan calculator'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Price.</strong> $4.90 a month against $14.99 a month for YNAB, and a yearly plan that costs less again.</li>
      <li><strong>Built for logging by hand.</strong> Aviary never asks for your bank login. It learns your routine and nudges you while a spend is fresh, and if you fall behind you can catch up by typing “uber 12, lunch 15” in one go.</li>
      <li><strong>Bill scanning.</strong> Snap a receipt and every line lands in your budget, split if you shared it. See <Link href="/features/bill-scanning">bill scanning</Link>.</li>
      <li><strong>Sharing on one plan.</strong> Invite your partner or roommates with a link. They join free, and every spend shows who logged it. See <Link href="/features/shared-budgets">shared budgets</Link>.</li>
      <li><strong>Open source.</strong> Aviary’s code is on GitHub, so you can see what it does with your data.</li>
    </ul>

    <h2>Where YNAB is stronger</h2>
    <ul>
      <li><strong>Bank import, if you’re in a supported country.</strong> YNAB can pull transactions from select US, Canadian, UK and EU banks, so you don’t type them in.</li>
      <li><strong>It’s been doing this for years.</strong> YNAB’s method, guides and community are deep. If you want to learn zero-based budgeting properly, their material is good.</li>
      <li><strong>More platforms.</strong> YNAB has apps for iPhone, iPad and Apple Watch. Aviary is on Android and the web for now.</li>
    </ul>

    <h2>Is the method the same?</h2>
    <p>Close enough that you won’t have to relearn anything. YNAB asks “What’s it for?” each time money comes in. Aviary calls the same step assigning money to categories, and keeps what’s unassigned in Ready to Assign. Each category works like an envelope: spend from it and you see what’s left. Each new month keeps the amounts you assigned last month, so you don’t start from scratch.</p>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://www.ynab.com/pricing', 'YNAB pricing and FAQ (price, trial, direct import countries, currency, sharing)'],
      ['https://www.ynab.com/our-app-lineup', 'YNAB app lineup (platforms)'],
      ['https://www.ynab.com/ynab-method', 'The YNAB method'],
      ['https://support.ynab.com/en_us/how-to-export-plan-data-Sy_CouWA9', 'How to export your YNAB plan'],
    ]} />
    <SoftCta title="Keep the method, drop the bill" placement="compare_ynab_global">Aviary’s free for 30 days with no card. Bring your YNAB plan, log a week, and see if it clicks.</SoftCta>
  </ContentPage>
}
