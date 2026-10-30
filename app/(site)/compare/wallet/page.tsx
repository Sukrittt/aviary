import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/wallet')

export default function WalletPage() {
  return <ContentPage section="compare" path="/compare/wallet" title="Aviary vs Wallet by BudgetBakers" kicker={`Compare · Facts checked ${COMPARE_CHECKED}`} lede={<>Wallet by BudgetBakers is a money manager used all over the world. It tracks spending across accounts and currencies, and on Premium it syncs with your bank. Aviary is an envelope budget: you give all your money a job first, and every spend shows what’s left for that job.</>} related={['/compare/ynab-alternative', '/compare/monefy', '/features/budget-without-bank-linking']}>
    <p>Wallet’s budgets are limits you set on what you spend. Aviary starts from the money you have and plans all of it. And if you’ve got years of records in Wallet, they can come with you.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>A plan for all your money.</strong> A Wallet budget caps a category or a period. In Aviary, all the money you have gets a job, and whatever’s left in an envelope rolls into next month.</li>
      <li><strong>No bank link, by design.</strong> In Wallet, automatic bank updates are a Premium feature. Aviary never links your bank or reads your SMS. You log spends yourself, with nudges that keep it quick.</li>
      <li><strong>Sharing on one plan.</strong> Up to 6 people share a budget in Aviary, each on their own phone.</li>
      <li><strong>Your history comes too.</strong> Export a csv from Wallet and upload it when you set up Aviary.</li>
    </ul>
    <p>Wallet still makes sense if you want your bank to fill in transactions for you, you need an iPhone app, or you want investments and debts in the same place as your spending.</p>

    <h2>Bring your history over in one upload</h2>
    <p>You don’t start from zero. It’s one file and one review screen.</p>
    <ol>
      <li>Open Wallet on the web and go to Records.</li>
      <li>Click Select all, then Export, and pick Export to CSV. On Android, it’s ≡ › Others › Export.</li>
      <li>Start Aviary, pick “I’m switching apps”, then Wallet, and upload the csv.</li>
      <li>Check what Aviary found, then tap “Looks right, set me up”.</li>
    </ol>
    <p>Exporting needs Wallet Premium, and the iPhone app can’t export, so use the web or Android.</p>
    <p>Your Wallet categories become envelopes, each with a starting amount based on a typical month of your spending. If you have more than 40, the smallest are grouped into one. Each record’s payee becomes its name, and your note comes along with it. Your accounts come over too, up to 10. If your salary lands on a regular monthly pattern, Aviary spots your payday. Transfers between accounts and initial balances are left out, since they aren’t spending, and so are records in a currency other than your budget’s. Labels aren’t brought over. You can rename or change anything before you confirm. Already using Aviary? Import from Settings instead. That adds your older history and leaves your current budget as it is. <Link href="/sign-in">Sign in to start the import</Link>.</p>

    <h2>Side by side</h2>
    <CompareTable them="Wallet" rows={[
      ['Price', '₹199 a month in India or $4.90 a month on the web elsewhere, after a 30-day free trial', 'Free for manual tracking. Premium adds bank sync, unlimited accounts and sharing. On the App Store, Premium runs from ₹199 to ₹4,999 in India ($5.99 to $49.99 in the US), including a one-time Lifetime Premium at ₹999 ($29.99)'],
      ['Method', 'Envelope budgeting: every bit of income gets a category before you spend', 'Money manager and spending tracker, with budgets as limits on a category or period: weekly, monthly or custom'],
      ['Bank or SMS sync', 'None. You log spends yourself, and can catch up from a CSV, Excel or PDF statement', 'Automatic bank updates on Premium, with 15,000+ institutions worldwide. The free tier is manual'],
      ['Platforms', 'Android and web. No iPhone app yet', 'Android, iPhone, iPad and web. One Premium works on all of them'],
      ['Sharing', 'Up to 6 people in a budget on one plan, each on their own phone, with who-logged-what on every spend', 'Share selected accounts with family or friends, as part of Premium'],
      ['Currency', 'One currency per budget', 'Many currencies, with exchange rates worked out for you'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses, widget', 'Bank sync on Premium, templates, planned payments and automatic categories'],
      ['Beyond budgeting', 'Recurring expenses and subscriptions, Ask Aviary chat', 'Stocks and investments, debts, loyalty cards, shopping lists, warranties'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Your plan adds up.</strong> Wallet budgets are limits you pick, and they don’t have to match what you have. In Aviary, envelopes are filled from the money you actually have, so what’s left in Eating out is money you know is there. Unspent money carries over, which is how <Link href="/blog/sinking-funds-india">sinking funds</Link> for yearly costs work.</li>
      <li><strong>Built for logging by hand.</strong> In Wallet, the free tier is manual and the automation is on Premium. Aviary is made for logging yourself: it learns when you usually spend, like the Friday cab, and nudges you soon after with the details filled in. Missed a day? Type “auto 240, lunch 150” and both are logged. See <Link href="/features/budget-without-bank-linking">budgeting without linking your bank</Link>.</li>
      <li><strong>No bank login to hand over.</strong> Aviary never asks for one, on any plan.</li>
      <li><strong>Sharing a whole budget.</strong> Invite your partner or flatmates with a link. They join free, and every spend shows who logged it. See <Link href="/features/shared-budgets">shared budgets</Link>.</li>
    </ul>

    <h2>Where Wallet is stronger</h2>
    <ul>
      <li><strong>Bank sync.</strong> If you’d rather not log by hand, Premium pulls in transactions from your bank every day and sorts them into categories. Its site names mostly US and European banks, so check yours in the app before you pay.</li>
      <li><strong>iPhone and iPad.</strong> Wallet runs on Apple devices as well as Android and the web. Aviary has no iPhone app yet.</li>
      <li><strong>A free tier and a one-time price.</strong> Manual tracking costs nothing, and Lifetime Premium is a single payment instead of a subscription.</li>
      <li><strong>More than spending.</strong> Stocks, investments and debts sit next to your accounts for a net worth view, and it handles many currencies at once.</li>
      <li><strong>Your data in other tools.</strong> A REST API and an MCP connector let you pull your records into spreadsheets or AI assistants.</li>
      <li><strong>Trust at scale.</strong> Over 10 million downloads on Google Play, rated 4.7.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://budgetbakers.com/en/products/wallet/', 'Wallet’s website (free tier, Premium, Lifetime Premium, group sharing, platforms, API and MCP)'],
      ['https://budgetbakers.com/en/products/wallet/features/bank-sync/', 'Wallet bank sync (15,000+ institutions, daily sync)'],
      ['https://budgetbakers.com/en/products/wallet/features/budgets/', 'Wallet budgets (budget types)'],
      ['https://play.google.com/store/apps/details?id=com.droid4you.application.wallet&hl=en_IN', 'Wallet on Google Play, India (features, downloads, rating, export formats)'],
      ['https://apps.apple.com/in/app/wallet-budget-money-manager/id1032467659', 'Wallet on the App Store, India (Premium features, in-app purchase prices in ₹)'],
      ['https://apps.apple.com/us/app/wallet-budget-money-manager/id1032467659', 'Wallet on the App Store, US (in-app purchase prices in $)'],
      ['https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet', 'BudgetBakers help: how to export transactions from Wallet'],
    ]} />
    <SoftCta title="Want a plan, not just a record?" placement="compare_wallet">Try Aviary free for 30 days. No card, no bank link, and your Wallet history comes with you.</SoftCta>
  </ContentPage>
}
