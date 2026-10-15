import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, Screen, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/features/ask-aviary')

export default function AskAviaryPage() {
  return <ContentPage section="features" path="/features/ask-aviary" title="Ask Aviary: talk to your budget" lede={<>Ask Aviary is a chat inside your budget. Type what you spent and it logs it. Ask a question about your money and it answers from your own numbers.</>} related={['/features/bill-scanning', '/features/recurring-expenses', '/compare/ynab-alternative-india']}>
    <Screen src="/landing/poster-ask.jpg" alt="Ask Aviary chat: asked whether a ₹90,000 iPhone is affordable, it answers yes, from ₹43,640 unspent this month plus savings." caption="“Can I afford a 90k iPhone?” answered from your own budget." />

    <h2>Catch up in one line</h2>
    <p>Missed a couple of days? Type whatever you remember, like “auto 240, lunch 150, Friday dinner 900”. Aviary turns it into three separate spends, picks a category for each, and shows them to you. Nothing is saved until you check it. Two missed days take about a minute.</p>

    <h2>Ask about your money</h2>
    <p>Ask the things you’d otherwise work out in a spreadsheet:</p>
    <ul>
      <li>How does this month compare to last month?</li>
      <li>What can I cut back on?</li>
      <li>Can I afford a ₹90,000 phone?</li>
    </ul>
    <p>Answers come from your categories and transactions, in plain words. If the answer’s “not yet”, it tells you why and what would change it, like setting aside a little each month in a new category.</p>

    <h2>What it sends, and where</h2>
    <p>To answer, Ask Aviary sends the relevant transactions and budget numbers to Google Gemini. Your data isn’t sold, and there are no ads. You can turn Ask Aviary off in settings if you’d rather not use it. See the <Link href="/legal/privacy">privacy policy</Link>.</p>

    <h2>Why a chat in a budget app</h2>
    <p>Most people quit budgeting because logging falls behind and catching up feels like homework. A chat makes catching up a sentence. And being able to ask “can I afford this?” at the counter is the whole point of having a budget.</p>
    <SoftCta title="Ask your budget something" placement="feature_ask_aviary">Ask Aviary is in the free 30-day trial. Log a week, then ask how it went.</SoftCta>
  </ContentPage>
}
