import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { HOW_CATEGORIES_WORK, LOGGING_WAYS, landingFaqs } from '@/src/components/landing/faqs'

export const metadata = pageMetadata('/help')

export default function PublicHelpPage() {
  return (
    <article className="legal-doc">
      <h1>How Aviary works</h1>
      <p>Aviary is a budget app you log yourself, built to be quick enough that you keep doing it. Here’s the method, the fast ways to log, and answers to what people ask most.</p>

      <h2>How categories work</h2>
      <p>{HOW_CATEGORIES_WORK}</p>

      <h2>Logging without the homework</h2>
      <ul>
        {LOGGING_WAYS.map(({ title, text }) => <li key={title}><strong>{title}</strong> {text}</li>)}
      </ul>

      <h2>Common questions</h2>
      {landingFaqs(false).map(({ q, a, link }) => <section key={q}>
        <h3>{q}</h3>
        <p>{a}{link && <> <Link href={link.href}>{link.label}</Link>.</>}</p>
      </section>)}

      <h2>Still stuck?</h2>
      <p>Write to the person who builds Aviary on the <Link href="/legal/contact">contact page</Link>, or see <Link href="/changelog">what changed recently</Link>. Signed in? The <Link href="/account/guided-tour">guided tour</Link> walks you through your own budget.</p>
    </article>
  )
}
