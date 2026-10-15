import { pageMetadata } from '@/lib/seo'
import { ContentPage, SectionIndex, SoftCta } from '@/src/components/content/ContentPage'

export const metadata = pageMetadata('/features')

export default function FeaturesPage() {
  return <ContentPage section="features" path="/features" title="What Aviary does" lede={<>Aviary is a budget you log yourself. Every feature is there to make logging faster, so you keep doing it past the first week.</>} related={['/compare', '/tools']}>
    <p>You give your money jobs in categories. You log what you spend. Aviary shows what’s left. These are the parts that take the work out of the middle step.</p>
    <SectionIndex section="features" />
    <SoftCta title="Try all of it free" placement="features_hub">Every feature is in the 30-day trial. No card, no bank link.</SoftCta>
  </ContentPage>
}
