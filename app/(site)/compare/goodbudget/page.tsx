import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { CompareTable, ContentPage, SoftCta, Sources } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare/goodbudget')

export default function GoodbudgetPage() {
  return <ContentPage section="compare" path="/compare/goodbudget" related={['/compare/ynab-alternative-india', '/features/budget-without-bank-linking', '/tools/50-30-20-calculator']}>
    <h1>Aviary vs Goodbudget</h1>
    <p className="legal-updated">Facts about Goodbudget checked {COMPARE_CHECKED}</p>
    <p className="lp-lede-doc">Goodbudget and Aviary are close cousins. Both use envelope budgeting: you split your money into envelopes, or categories, and spend from them. Both work well without linking a bank, which matters in India because neither one syncs with Indian banks.</p>

    <h2>The short version</h2>
    <ul>
      <li><strong>Pick Goodbudget</strong> if you want a free plan, or to share one budget with a partner on several phones, or an iPhone app.</li>
      <li><strong>Pick Aviary</strong> if you want logging to be as fast as possible, with nudges, one-line catch-up and bill scanning, and no envelope limits.</li>
    </ul>

    <h2>Side by side</h2>
    <CompareTable them="Goodbudget" rows={[
      ['Price', '₹199 a month after a 30-day free trial', 'Free plan. Paid plan listed at $10 a month or $80 a year on its help page; App Store prices in India vary'],
      ['Free plan limits', 'No free plan, only the trial', '10 regular envelopes, 10 annual or goal envelopes, 1 account, 2 devices, 1 year of history'],
      ['Bank sync', 'None', 'On the paid plan, for US banks only. File import (QFX, OFX) on the web'],
      ['Platforms', 'Android and web', 'Android, iPhone and web'],
      ['Sharing', 'One person per budget', 'Share a budget across 2 devices free, 5 on the paid plan'],
      ['Leftover money', 'Each category starts fresh; last month’s assigned amounts carry over', 'Unused money rolls over to the next month'],
      ['Logging help', 'Habit nudges, type several spends in one line, bill scanning, recurring expenses', 'Location-based widget, scheduled transactions, split transactions'],
    ]} />

    <h2>Where Goodbudget is stronger</h2>
    <ul>
      <li><strong>A free plan that lasts.</strong> If 10 envelopes and one account are enough, you can use it free, without ads.</li>
      <li><strong>Couples and families.</strong> Sharing one budget across several phones is a core feature.</li>
      <li><strong>iPhone.</strong> Goodbudget has an iPhone app. Aviary doesn’t yet.</li>
      <li><strong>Rollover.</strong> Money you didn’t spend in an envelope rolls into next month. In Aviary, each month starts fresh.</li>
      <li><strong>Debt tracking.</strong> It has tools for paying down debt alongside your envelopes.</li>
    </ul>

    <h2>Where Aviary is stronger</h2>
    <ul>
      <li><strong>Logging that keeps up with you.</strong> Aviary learns when you usually spend and nudges you with the details filled in. One tap logs it.</li>
      <li><strong>Catch up by typing.</strong> “auto 240, lunch 150” becomes two spends in the right categories.</li>
      <li><strong>Bill scanning.</strong> Snap a long bill and Aviary reads every line, and splits shared items.</li>
      <li><strong>Built in India.</strong> Priced in rupees, with amounts grouped in lakh and crore.</li>
      <li><strong>No envelope caps.</strong> Make as many categories as you need.</li>
    </ul>

    <Sources checked={COMPARE_CHECKED} links={[
      ['https://goodbudget.com/help/billing/subscribe-to-goodbudget/', 'Goodbudget plans and limits (help page, last updated 2020)'],
      ['https://goodbudget.com/help/automatic-bank-sync/how-do-i-link-my-bank-accounts-to-goodbudget/', 'Goodbudget bank sync'],
      ['https://goodbudget.com/what-you-get/', 'What you get with Goodbudget'],
      ['https://play.google.com/store/apps/details?id=com.dayspringtech.envelopes', 'Goodbudget on Google Play'],
    ]} />
    <SoftCta title="Envelope budgeting, faster logging" placement="compare_goodbudget">Try Aviary free for 30 days. Set up your categories in a few minutes, no card needed.</SoftCta>
  </ContentPage>
}
