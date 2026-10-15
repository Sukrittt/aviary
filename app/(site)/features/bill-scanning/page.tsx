import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, Screen, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/features/bill-scanning')

export default function BillScanningPage() {
  return <ContentPage section="features" path="/features/bill-scanning" title="Scan a bill, and it’s in your budget" lede={<>Long restaurant bills and grocery receipts are the spends people put off logging. Snap the bill and Aviary reads every line, taxes included.</>} related={['/features/ask-aviary', '/features/budget-without-bank-linking', '/compare/money-manager']}>
    <Screen src="/landing/poster-scan.jpg" alt="Aviary after scanning a Meghana Foods bill: Added ₹672.96, with ₹408.04 left of ₹1,501 in Eating Out." caption="A ₹1,725.70 dinner bill, split three ways. Your share lands in Eating out." />

    <h2>How it works</h2>
    <ol>
      <li>Point your camera at the receipt, or pick a photo you already took.</li>
      <li>Aviary reads each item and its price, plus taxes and charges.</li>
      <li>Shared some dishes? Mark them as split two or three ways. Your share is worked out for you.</li>
      <li>Check the total and the category, then save. You see what’s left in that category straight away.</li>
    </ol>

    <h2>Built for split bills</h2>
    <p>A group dinner is where logging usually breaks. The bill is ₹1,725.70, you had the biryani and half the starters, and nobody wants to do the maths at the table. With a scan, you tick what was shared and Aviary logs your ₹672.96. The rest is your friends’ problem.</p>

    <h2>What it sends, and where</h2>
    <p>To read the bill, Aviary sends the photo to Google Gemini. Amounts and notes you save are encrypted in Aviary’s database, and your data is never sold. The <Link href="/legal/privacy">privacy policy</Link> has the details.</p>

    <h2>Part of a faster way to log</h2>
    <p>Scanning is for the long bills. For everyday spends, Aviary learns your routine and nudges you to log with one tap. For days you missed, you can type a few spends in one line with <Link href="/features/ask-aviary">Ask Aviary</Link>.</p>
    <SoftCta title="Scan your next bill" placement="feature_bill_scanning">Bill scanning is in Aviary’s free 30-day trial, on Android and the web.</SoftCta>
  </ContentPage>
}
