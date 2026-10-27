import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/ynab-alternative-india')

export default function YnabAlternativePage() {
  return <ContentPage section="compare" path="/compare/ynab-alternative-india" title="A YNAB alternative for India" kicker={`Compare · Facts checked ${COMPARE_CHECKED}`} lede={<>YNAB made zero-based budgeting popular: every time money comes in, you decide what it’s for. If you’re in India, you’ve probably hit two walls. It’s priced in US dollars, and its bank import doesn’t cover Indian banks.</>} related={['/compare/ynab-alternative', '/compare/wallet', '/features/budget-without-bank-linking', '/tools/salary-budget-planner']}>
    <p>Aviary uses the same idea. You give your money jobs in categories, and every spend shows what’s left for that job. It’s built for paying by UPI and logging on your phone, and it’s priced in rupees.</p>

    <h2>The short version</h2>
    <p>If you live in India, Aviary is the better fit for most people.</p>
    <ul>
      <li><strong>About a seventh of the price.</strong> ₹199 a month, against ₹1,349 for YNAB on the App Store in India, or $14.99 on its website.</li>
      <li><strong>The same method.</strong> Every rupee gets a job before you spend it, just like YNAB. There’s nothing to relearn.</li>
      <li><strong>Built for how you’ll log in India.</strong> YNAB’s bank import doesn’t reach Indian banks, so you’d type spends in by hand there too. Aviary is designed for that, with nudges, one-line catch-up and bill scanning.</li>
    </ul>
    <p>YNAB still makes sense if you need an iPhone app today, or bank in the US, Canada, the UK or the EU.</p>

    <h2>Side by side</h2>
    <CompareTable them="YNAB" rows={[
      ['Price', '₹199 a month after a 30-day free trial, or a yearly plan', '$14.99 a month or $109 a year, in US dollars. On the App Store in India: ₹1,349 a month or ₹9,900 a year'],
      ['Free trial', '30 days, no card', '34 days on the website and Google Play, 30 days on the App Store'],
      ['Bank import', 'No bank connection. You log spends yourself, and can catch up by uploading payment screenshots or a CSV, Excel or PDF statement', 'Direct import for select US, Canadian, UK and EU banks. Elsewhere, file import'],
      ['Platforms', 'Android and web. No iPhone app yet', 'Web, iPhone, iPad, Android and Apple Watch'],
      ['Sharing', 'Up to 6 people in a budget on one plan, each on their own phone, with who-logged-what on every spend', 'Up to six people on one subscription'],
      ['Currency', 'Pick one currency for your budget', 'Pick one currency per plan'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses, widget', 'Mobile widgets, goals, loan calculator'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Price in India.</strong> ₹199 a month against $14.99 a month on YNAB’s website. Even YNAB’s App Store price in India is ₹1,349 a month.</li>
      <li><strong>Built for manual logging.</strong> Since YNAB’s direct import doesn’t reach Indian banks, you’d be entering spends by hand or importing files anyway. Aviary is designed around that. It learns your routine and nudges you while a spend is fresh, and you can catch up by typing “auto 240, lunch 150”.</li>
      <li><strong>Rupees first.</strong> Amounts are grouped in lakh and crore, and the price is in rupees.</li>
      <li><strong>Sharing on one plan.</strong> Invite your partner or flatmates with a link. They join free, and every spend shows who logged it. See <Link href="/features/shared-budgets">shared budgets</Link>.</li>
      <li><strong>Open source.</strong> Aviary’s code is on GitHub, so you can see what it does with your data.</li>
    </ul>

    <h2>Where YNAB is stronger</h2>
    <ul>
      <li><strong>It’s been doing this for years.</strong> YNAB’s method, guides and community are deep. If you want to learn zero-based budgeting properly, their material is good.</li>
      <li><strong>More platforms.</strong> YNAB has apps for iPhone, iPad and Apple Watch. Aviary is on Android and the web for now.</li>
      <li><strong>Bank import, if you’re in a supported country.</strong> YNAB can pull transactions from select US, Canadian, UK and EU banks.</li>
    </ul>

    <h2>Is the method the same?</h2>
    <p>Close enough that you won’t have to relearn anything. YNAB asks “What’s it for?” each time money comes in. Aviary calls the same step assigning money to categories, and keeps what’s unassigned in Ready to Assign. Each new month keeps the amounts you assigned last month, so you don’t start from scratch. If you’re new to it, start with our <Link href="/tools/salary-budget-planner">salary budget planner</Link> to see a month split into categories.</p>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://www.ynab.com/pricing', 'YNAB pricing and FAQ (price, trial, direct import countries, currency)'],
      ['https://www.ynab.com/our-app-lineup', 'YNAB app lineup (platforms)'],
      ['https://www.ynab.com/ynab-method', 'The YNAB method'],
      ['https://apps.apple.com/in/app/ynab/id1010865877', 'YNAB on the App Store, India (rupee prices, trial)'],
      ['https://play.google.com/store/apps/details?id=com.youneedabudget.evergreen.app', 'YNAB on Google Play'],
    ]} />
    <h2>Bringing your YNAB plan</h2>
    <p>Years of YNAB history don’t have to stay behind. In the YNAB web app, open the plan menu and choose Export plan. When you set up Aviary, pick “I’m switching apps”, choose YNAB and upload the zip as it is. Your categories, balances and transactions come along. <Link href="/sign-in">Sign in to start the import</Link>.</p>
    <SoftCta title="Try the method in rupees" placement="compare_ynab">Aviary’s free for 30 days with no card. Set up your categories, log a week, and see if it clicks.</SoftCta>
  </ContentPage>
}
