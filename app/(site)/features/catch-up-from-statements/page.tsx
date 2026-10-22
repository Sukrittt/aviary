import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, Screen, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/features/catch-up-from-statements')

export default function CatchUpFromStatementsPage() {
  return <ContentPage section="features" path="/features/catch-up-from-statements" title="Fell behind? Upload a statement and catch up" lede={<>A week of spends you didn’t log is the moment most budgets die. In Aviary you upload screenshots of your payments app, or a bank statement, and it reads the payments for you to check.</>} related={['/features/ask-aviary', '/features/budget-without-bank-linking', '/features/shared-budgets']}>
    <Screen src="/landing/poster-catchup.webp" alt="Aviary’s You’re caught up screen: 5 payments added, ₹3,490.50 across Groceries, Subscriptions, Food delivery, Mobile & internet and Cabs & Auto." caption="Five payments read off two screenshots, logged in the right categories." />

    <h2>How it works</h2>
    <ol>
      <li>Open You, then Add from statement. Pick screenshots from your gallery, or a CSV, Excel or PDF statement.</li>
      <li>Aviary reads each payment: who it went to, how much, and when. It matches the payee to a category from your own history.</li>
      <li>You get a list to check. Untick anything that isn’t yours, fix a category, and tap Log.</li>
      <li>The spends land on their real dates. Your categories now match what you actually spent.</li>
    </ol>

    <h2>What it reads</h2>
    <p>Screenshots of GPay, PhonePe, Paytm or your bank app work, as many as you like in one go. So does a statement export: CSV, Excel or PDF. Outside India, the same goes for Venmo, Cash App or your bank’s app.</p>

    <h2>Nothing doubles up</h2>
    <p>Anything you already logged is left alone, and credits are skipped. Upload the same screen twice, or a statement that overlaps a screenshot, and only the new payments show up. A transfer from a friend can be marked as income if you want it counted.</p>

    <h2>Why it isn’t bank sync</h2>
    <p>Bank sync logs everything for you, and you never feel a thing. Catching up from a statement is for the week you missed, with you checking every line before it lands. On a normal day, logging is still one tap. Read more on <Link href="/features/budget-without-bank-linking">budgeting without linking your bank</Link>.</p>
    <SoftCta title="Catch up on last week" placement="feature_catchup">Upload two screenshots in the free trial and see your categories fill in.</SoftCta>
  </ContentPage>
}
