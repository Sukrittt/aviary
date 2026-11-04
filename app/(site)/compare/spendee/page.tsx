import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/spendee')

export default function SpendeePage() {
  return <ContentPage section="compare" path="/compare/spendee" title="Aviary vs Spendee" kicker={`Compare · Facts checked ${COMPARE_CHECKED}`} lede={<>Spendee is a money tracker from Prague. You keep your spending in wallets, set budgets as limits on categories, and on Premium it syncs with your bank. Aviary is an envelope budget: you give all your money a job first, and every spend shows what’s left for that job.</>} related={['/compare/wallet', '/compare/monefy', '/features/shared-budgets']}>
    <p>Spendee’s budgets cap what you spend. Aviary starts from the money you have and plans all of it. And if you’ve got years of records in Spendee, they can come with you.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>A plan for all your money.</strong> A Spendee budget is a limit on some categories for a period. In Aviary, all the money you have gets a job, and whatever’s left in an envelope rolls into next month.</li>
      <li><strong>No bank link, by design.</strong> In Spendee, bank sync is a Premium feature. Aviary never links your bank or reads your SMS. You log spends yourself, with nudges that keep it quick.</li>
      <li><strong>Sharing a whole budget.</strong> Up to 6 people share a budget in Aviary, each on their own phone. In Spendee you share cash wallets one by one, on a paid plan, and bank wallets can’t be shared.</li>
      <li><strong>Your history comes too.</strong> Export a csv from Spendee and upload it when you set up Aviary.</li>
    </ul>
    <p>Spendee still makes sense if you want your bank to fill in transactions for you, you need an iPhone app, or you track spending in several currencies at once.</p>

    <h2>Bring your history over in one upload</h2>
    <p>You don’t start from zero. It’s one file and one review screen.</p>
    <ol>
      <li>In the Spendee app, open More and tap Export.</li>
      <li>Pick all accounts and the whole period, then choose CSV and send it to yourself.</li>
      <li>Start Aviary, pick “I’m switching apps”, then Spendee, and upload the csv.</li>
      <li>Check what Aviary found, then tap “Looks right, set me up”.</li>
    </ol>
    <p>Only the phone app exports, not Spendee on the web. On the free plan the export covers your last 365 days. Plus and Premium export everything.</p>
    <p>Your Spendee categories become envelopes, each with a starting amount based on a typical month of your spending. If you have more than 40, the smallest are grouped into one. Spendee has no payee field, so each record’s note becomes its name. Your Spendee wallets come over as accounts: up to 10, and no more than 5 of them bank accounts. If your salary lands on a regular monthly pattern, Aviary spots your payday. Transfers between wallets and initial balances are left out, since they aren’t spending, and so are records in a currency other than your budget’s. Labels and who added each record aren’t brought over. You can rename or change anything before you confirm. Already using Aviary? Import from Settings instead. That adds your older history and leaves your current budget as it is. <Link href="/sign-in">Sign in to start the import</Link>.</p>

    <h2>Side by side</h2>
    <CompareTable them="Spendee" rows={[
      ['Price', '₹199 a month in India or $4.99 a month on the web elsewhere, after a 30-day free trial with no card', 'Free for one cash wallet and one budget. Plus is $1.99 a month or $14.99 a year, and Premium is $5.99 a month or $35.99 a year, with local prices that vary by country. On the App Store in India, in-app purchases run from ₹249 to ₹9,900, including Lifetime Premium at ₹9,900. Paid plans have a 7-day trial'],
      ['Method', 'Envelope budgeting: every bit of income gets a category before you spend', 'Money tracker with budgets as limits on chosen categories and wallets, with a daily amount you can spend to stay on track'],
      ['Bank or SMS sync', 'None. You log spends yourself, and can catch up from a CSV, Excel or PDF statement', 'Bank, e-wallet and crypto sync on Premium, with 2,500+ providers listed. Free and Plus are manual'],
      ['Platforms', 'Android and web. No iPhone app yet', 'Android, iPhone and web. Plans are bought in the phone app'],
      ['Sharing', 'Up to 6 people in a budget on one plan, each on their own phone, with who-logged-what on every spend', 'Shared cash wallets on Plus or Premium. Only the owner pays, and bank wallets can’t be shared'],
      ['Currency', 'One currency per budget', 'Many currencies'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses, widget', 'Bank sync and automatic categories on Premium, receipt scanning, scheduled transactions, labels'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Your plan adds up.</strong> Spendee budgets are limits you pick, and they don’t have to match what you have. In Aviary, envelopes are filled from the money you actually have, so what’s left in Eating out is money you know is there. Unspent money carries over, which is how <Link href="/blog/sinking-funds-india">sinking funds</Link> for yearly costs work.</li>
      <li><strong>Built for logging by hand.</strong> In Spendee, the automation is on Premium. Aviary is made for logging yourself: it learns when you usually spend, like the Friday cab, and nudges you soon after with the details filled in. Missed a day? Type “auto 240, lunch 150” and both are logged. See <Link href="/features/budget-without-bank-linking">budgeting without linking your bank</Link>.</li>
      <li><strong>No bank login to hand over.</strong> Aviary never asks for one, on any plan.</li>
      <li><strong>Sharing a whole budget.</strong> Invite your partner or flatmates with a link. They join free, see the same envelopes, and every spend shows who logged it. See <Link href="/features/shared-budgets">shared budgets</Link>.</li>
      <li><strong>Open source.</strong> Aviary’s code is public under the AGPL, so you can see what it does with your data.</li>
    </ul>

    <h2>Where Spendee is stronger</h2>
    <ul>
      <li><strong>Bank sync.</strong> If you’d rather not log by hand, Premium connects banks, e-wallets like PayPal and crypto wallets, and sorts new transactions into categories. India is on its list of countries, so check your bank there before you pay.</li>
      <li><strong>iPhone.</strong> Spendee runs on iPhone as well as Android and the web. Aviary has no iPhone app yet.</li>
      <li><strong>A free tier and a cheap one.</strong> One wallet and one budget cost nothing, Plus is $1.99 a month, and Lifetime Premium is a single payment instead of a subscription.</li>
      <li><strong>Many currencies.</strong> It’s made for travel, with wallets and spends in more than one currency.</li>
      <li><strong>Trust at scale.</strong> Over 1 million downloads on Google Play, rated 4.4.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://www.spendee.com/pricing', 'Spendee pricing (Basic, Plus and Premium, what each includes, 7-day trial)'],
      ['https://www.spendee.com/bank-connect', 'Spendee bank connect (2,500+ providers, supported countries)'],
      ['https://help.spendee.com/article/200-is-spendee-for-free', 'Spendee help: is Spendee free?'],
      ['https://help.spendee.com/article/203-what-is-spendee-plus', 'Spendee help: Spendee Plus (prices and features)'],
      ['https://help.spendee.com/article/202-what-is-spendee-premium', 'Spendee help: Spendee Premium (prices, bank sync)'],
      ['https://help.spendee.com/article/205-what-is-lifetime-premium', 'Spendee help: Lifetime Premium'],
      ['https://help.spendee.com/article/224-shared-wallets', 'Spendee help: shared wallets'],
      ['https://help.spendee.com/article/131-budget-my-money', 'Spendee help: budgets'],
      ['https://help.spendee.com/article/199-spendee-web-app', 'Spendee help: the web app'],
      ['https://help.spendee.com/article/137-export-transactions', 'Spendee help: data export (phone app only, CSV or XLS, 365 days on free)'],
      ['https://play.google.com/store/apps/details?id=com.cleevio.spendee&hl=en_IN', 'Spendee on Google Play, India (features, downloads, rating, in-app prices)'],
      ['https://apps.apple.com/in/app/spendee-budget-money-tracker/id635861140', 'Spendee on the App Store, India (iPhone, in-app purchase prices in ₹)'],
    ]} />
    <SoftCta title="Want a plan, not just a limit?" placement="compare_spendee">Try Aviary free for 30 days. No card, no bank link, and your Spendee history comes with you.</SoftCta>
  </ContentPage>
}
