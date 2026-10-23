import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/money-manager')

export default function MoneyManagerPage() {
  return <ContentPage section="compare" path="/compare/money-manager" title="Aviary vs Money Manager" kicker={`Compare · Facts checked ${COMPARE_CHECKED}`} lede={<>Money Manager by Realbyte is one of the most downloaded expense trackers on Google Play in India. It’s a ledger: you record income, spends and transfers between accounts, and it charts them for you. Aviary is a budget: you plan where money goes first, then log against that plan.</>} related={['/compare/monefy', '/compare/goodbudget', '/features/ask-aviary']}>
    <p>Both are manual. Neither one reads your SMS. The difference is what you get back for the typing.</p>

    <h2>The short version</h2>
    <p>If you want to know what you can still spend, not just what you spent, Aviary is the better fit.</p>
    <ul>
      <li><strong>A plan, not a ledger.</strong> Aviary shows what’s left in Eating out before you order.</li>
      <li><strong>Help to keep logging.</strong> Most people stop logging in the first week. Aviary learns your routine and nudges you with the details filled in.</li>
      <li><strong>No ads.</strong> Aviary is paid for by subscriptions, and your data is never sold.</li>
    </ul>
    <p>Money Manager still makes sense if you want detailed bookkeeping across many accounts and cards, a one-time price, or an iPhone app.</p>

    <h2>Side by side</h2>
    <CompareTable them="Money Manager" rows={[
      ['Price', '₹199 a month after a 30-day free trial', 'Free with ads. The ad-free Android version is a one-time ₹99. On iPhone, data sync is ₹219 a month or ₹1,799 a year'],
      ['Approach', 'Assign every rupee to a category, then spend from it', 'Double-entry bookkeeping across your accounts, with budgets and charts'],
      ['Bank or SMS sync', 'None', 'Not advertised on its listings'],
      ['Platforms', 'Android and web', 'Android, iPhone and iPad, plus viewing and editing on a PC over Wi-Fi'],
      ['Multiple currencies', 'One currency per budget', 'Entries in multiple currencies (iPhone)'],
      ['Backup and export', 'CSV export any time', 'Excel backup and restore'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses', 'Recurring entries, bookmarks, receipt photos'],
      ['Ads', 'None', 'In the free version'],
    ]} />

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>It tells you what you can spend.</strong> A ledger shows what happened. Aviary shows what’s left in Eating out before you order.</li>
      <li><strong>It helps you keep logging.</strong> Most people stop logging in the first week. Aviary learns your routine, like the Friday cab, and nudges you 15 minutes after with the details filled in.</li>
      <li><strong>Catch up in one line.</strong> Missed two days? Type “auto 240, lunch 150, dinner 900” and check the spends before they’re saved.</li>
      <li><strong>No ads.</strong> Aviary is paid for by subscriptions, and your data is never sold.</li>
    </ul>

    <h2>Where Money Manager is stronger</h2>
    <ul>
      <li><strong>Price.</strong> The free version is usable, and the ad-free Android version is a one-time ₹99.</li>
      <li><strong>Accounting detail.</strong> Double-entry means every transfer between your savings account, card and wallet balances out. Great if you want to see net worth and card dues.</li>
      <li><strong>More platforms.</strong> It’s on iPhone and iPad, and you can work on your data from a PC.</li>
      <li><strong>Trust at scale.</strong> Over a crore downloads on Google Play in India and a 4.6 rating.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://play.google.com/store/apps/details?id=com.realbyteapps.moneymanagerfree', 'Money Manager on Google Play (free version)'],
      ['https://play.google.com/store/apps/details?id=com.realbyteapps.moneya', 'Money Manager (Remove Ads) on Google Play'],
      ['https://apps.apple.com/in/app/money-manager-expense-budget/id560481810', 'Money Manager on the App Store, India'],
      ['https://realbyteapps.com/', 'Realbyte’s website'],
    ]} />
    <SoftCta title="Want a plan, not just a record?" placement="compare_money_manager">Try Aviary free for 30 days. No card, no ads, no bank link.</SoftCta>
  </ContentPage>
}
