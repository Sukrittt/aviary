import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/monefy')

export default function MonefyPage() {
  return <ContentPage section="compare" path="/compare/monefy" title="A Monefy alternative that plans, not just tracks" kicker={`Compare · Facts checked ${COMPARE_CHECKED}`} lede={<>Monefy is one of the quickest ways to record a spend: tap a category, type the amount, done. It’s a spending tracker. It shows where your money went. Aviary is an envelope budget: you give every rupee a job first, and every spend shows what’s left for that job.</>} related={['/compare/money-manager', '/features/shared-budgets', '/features/budget-without-bank-linking']}>
    <p>Neither one links your bank or reads your SMS. The difference is what the logging is for. And if you’ve got years of records in Monefy, they can come with you.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>A plan for every category.</strong> Monefy’s budget mode is one monthly limit for everything. In Aviary, Groceries, Eating out and Rent each get their own amount, and whatever’s left rolls into next month.</li>
      <li><strong>Help to keep logging.</strong> Aviary learns your routine and nudges you while a spend is fresh, and you can catch up by typing several spends in one line.</li>
      <li><strong>Web and Android.</strong> Aviary works in a browser too. Monefy is phone only.</li>
      <li><strong>Your history comes too.</strong> Export a csv from Monefy and upload it when you set up Aviary.</li>
    </ul>
    <p>Monefy still makes sense if you only want to see where money went, you don’t want to pay for an app, or you need an iPhone app.</p>

    <h2>Bring your history over in one upload</h2>
    <p>You don’t start from zero. It’s one file and one review screen.</p>
    <ol>
      <li>In Monefy, open the ⋮ menu and go to Settings.</li>
      <li>Tap Export to file, then share the csv to yourself (email or Drive works).</li>
      <li>Start Aviary, pick “I’m switching apps”, then Monefy, and upload the csv.</li>
      <li>Check what Aviary found, then tap “Looks right, set me up”.</li>
    </ol>
    <p>Your Monefy categories become envelopes, each with a starting amount based on a typical month of your spending. If you have more than 40, the smallest are grouped into one. Your transaction history comes along, and so do your accounts, up to 10. If your salary lands on a regular monthly pattern, Aviary spots your payday too. Transfers between accounts and initial balances are left out, since they aren’t spending, and so are records in a currency other than your budget’s. You can rename or change anything before you confirm. Already using Aviary? Import from Settings instead. That adds your older history and leaves your current budget as it is. <Link href="/sign-in">Sign in to start the import</Link>.</p>

    <h2>Side by side</h2>
    <CompareTable them="Monefy" rows={[
      ['Price', '₹199 a month after a 30-day free trial', 'Free to use. A premium upgrade unlocks unlimited accounts, recurring transactions and advanced filters. In-app purchases on Google Play in India run from ₹149 to ₹3,900'],
      ['Method', 'Envelope budgeting: every rupee gets a category before you spend', 'Spending tracker, with an optional single monthly budget'],
      ['Bank or SMS sync', 'None. You log spends yourself, and can catch up from a CSV, Excel or PDF statement', 'None. You add each record yourself'],
      ['Platforms', 'Android and web. No iPhone app yet', 'Android and iPhone. No web version'],
      ['Sharing', 'Up to 6 people in a budget on one plan, each on their own phone, with who-logged-what on every spend', 'Sync between devices through your own Google Drive or Dropbox, which you can share with a partner'],
      ['Currency', 'One currency per budget', '150+ currencies'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses, widget', 'One-tap entry, widgets, built-in calculator, recurring payments'],
      ['Ads', 'None', 'None'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>It tells you what you can spend.</strong> Monefy’s chart shows where this month went. Aviary shows what’s left in Eating out before you order, because you set that amount at the start of the month.</li>
      <li><strong>A budget per category.</strong> Monefy’s budget mode tracks one total. Aviary gives each category its own amount, and unspent money carries over, which is how <Link href="/blog/sinking-funds-india">sinking funds</Link> for yearly costs work.</li>
      <li><strong>It helps you keep logging.</strong> Aviary learns when you usually spend, like the Friday cab, and nudges you soon after with the details filled in. Missed a day? Type “auto 240, lunch 150” and both are logged.</li>
      <li><strong>Sharing built in.</strong> Invite your partner or flatmates with a link. They join free, and every spend shows who logged it. No shared Drive folder to manage. See <Link href="/features/shared-budgets">shared budgets</Link>.</li>
      <li><strong>Works on the web.</strong> Plan your month on a laptop, log on your phone.</li>
    </ul>

    <h2>Where Monefy is stronger</h2>
    <ul>
      <li><strong>Price.</strong> The core app is free, so you only pay if you want the extras like unlimited accounts.</li>
      <li><strong>Speed of entry.</strong> Tap a category, type an amount, done. If all you want is a record, it’s hard to beat.</li>
      <li><strong>iPhone and many currencies.</strong> Monefy runs on iPhone as well as Android, and tracks in more than 150 currencies, which helps if you travel or earn in more than one.</li>
      <li><strong>Your data stays in your own cloud.</strong> Sync goes through your own Google Drive or Dropbox.</li>
      <li><strong>Trust at scale.</strong> Over a crore downloads on Google Play.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://play.google.com/store/apps/details?id=com.monefy.app.lite&hl=en_IN', 'Monefy on Google Play, India (features, downloads, in-app purchase range)'],
      ['https://apps.apple.com/in/app/monefy-budget-money-manager/id1212024409', 'Monefy on the App Store, India'],
      ['https://www.monefy.com/', 'Monefy’s website (platforms, premium features, currencies, sync)'],
      ['https://www.monefy.com/help-center', 'Monefy help center (budget mode, ads)'],
    ]} />
    <SoftCta title="Want a plan, not just a record?" placement="compare_monefy">Try Aviary free for 30 days. No card, no bank link, and your Monefy history comes with you.</SoftCta>
  </ContentPage>
}
