import { pageMetadata } from '@/lib/seo'
import { COMPARE_CHECKED } from '@/lib/content'
import { ContentPage, SectionIndex, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/compare')

export default function ComparePage() {
  return <ContentPage section="compare" path="/compare" title="How Aviary compares" lede={<>Picking a budget app is mostly picking how you want to track money. Some apps read your SMS or link your bank. Some are ledgers you fill in. Aviary is a budget you log yourself, with nudges that keep it quick.</>} related={['/features/budget-without-bank-linking', '/tools/salary-budget-planner']}>
    <p>Each comparison below sticks to what the other app says on its own website or store listing, checked in {COMPARE_CHECKED}. We say where the other app is stronger, too. If we couldn’t confirm something, we left it out.</p>
    <SectionIndex section="compare" />
    <SoftCta title="Try the one that fits" placement="compare_hub">The fastest way to know is to log a week of spending. Aviary’s free for 30 days, and you don’t need a card.</SoftCta>
  </ContentPage>
}
