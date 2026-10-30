import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, SectionIndex, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/tools')

export default function ToolsPage() {
  return <ContentPage section="tools" path="/tools" title="Free budget calculators in rupees" lede={<>Quick answers to the money questions that come up every month. Everything’s in ₹, grouped the Indian way, and nothing you type leaves your browser.</>} related={['/features/budget-without-bank-linking', '/compare/ynab-alternative-india']}>
    <p>Start with the salary planner if you’re setting up a budget for the first time. Use the rent and emergency fund calculators before a big decision, and the sinking fund calculator for bills that come once a year. Not paid in rupees? The <Link href="/tools/paycheck-budget-planner">paycheck budget planner</Link> works in any currency.</p>
    <SectionIndex section="tools" />
    <SoftCta title="Turn the numbers into a habit" placement="tools_hub">A calculator gives you a plan once. Aviary keeps it going every day: log a spend in one tap and see what’s left.</SoftCta>
  </ContentPage>
}
