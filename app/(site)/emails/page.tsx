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

const ASKS = {
  unsubscribe: { title: 'Stop the tips?', body: 'You’ll stop getting Aviary’s money tips and nudges. If you have an account, receipts and notices about your plan still come through.', action: '/api/email/unsubscribe', button: 'Unsubscribe' },
  tips: { title: 'Want the tips?', body: 'One short, useful money idea every few days, plus two notes on making your plan stick. Unsubscribe from any of them.', action: '/api/email/confirm', button: 'Send me the tips' },
}

/** Where email links land. Only the button posts, so opening a link (as mail scanners do) never changes anything. */
export default async function EmailPreferencesPage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string; ask?: string }> }) {
  const { t, done, ask: asked } = await searchParams
  const subject = verifyLink(t)
  const ask = asked === 'tips' ? subject?.startsWith('l:') && ASKS.tips : subject && ASKS.unsubscribe
  const state = done ? STATES[done] ?? STATES.invalid : ask ? null : STATES.invalid
  return <article className="legal-doc article-doc">
    <header className="article-head">
      <p className="article-kicker">Email</p>
      <h1>{state ? state.title : ask && ask.title}</h1>
      <p className="article-dek">{state ? state.body : ask && ask.body}</p>
    </header>
    {!state && ask && <form method="post" action={ask.action}>
      <input type="hidden" name="t" value={t} />
      <input type="hidden" name="from" value="page" />
      <button type="submit" className="lp-button lp-button--dark">{ask.button}</button>
    </form>}
    {done === 'subscribed' && <p><Link href="/sign-in">Or try Aviary free for 30 days</Link></p>}
  </article>
}
