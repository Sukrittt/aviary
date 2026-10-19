import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { verifyLink } from '@/lib/email/links'

export const metadata = pageMetadata('/emails')
export const dynamic = 'force-dynamic'

const STATES: Record<string, { title: string; body: string }> = {
  unsubscribed: { title: 'You’re unsubscribed', body: 'No more tips from us. If you have an account, receipts and notices about your plan still come through.' },
  subscribed: { title: 'You’re in', body: 'One short, useful money idea every few days. The first one’s on its way soon.' },
  invalid: { title: 'That link didn’t work', body: 'Reply to any email from us and we’ll sort it out by hand.' },
}

/** Where email links land. The unsubscribe button posts, so opening this page alone never changes anything. */
export default async function EmailPreferencesPage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams
  const state = done ? STATES[done] ?? STATES.invalid : verifyLink(t) ? null : STATES.invalid
  return <article className="legal-doc article-doc">
    <header className="article-head">
      <p className="article-kicker">Email</p>
      <h1>{state ? state.title : 'Stop the tips?'}</h1>
      <p className="article-dek">{state ? state.body : 'You’ll stop getting Aviary’s money tips and nudges. If you have an account, receipts and notices about your plan still come through.'}</p>
    </header>
    {!state && <form method="post" action="/api/email/unsubscribe">
      <input type="hidden" name="t" value={t} />
      <input type="hidden" name="from" value="page" />
      <button type="submit" className="lp-button lp-button--dark">Unsubscribe</button>
    </form>}
    {done === 'subscribed' && <p><Link href="/sign-in">Or try Aviary free for 30 days</Link></p>}
  </article>
}
