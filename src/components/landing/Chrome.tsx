import Link from 'next/link'
import { BirdMark } from '../BirdMark'
import { TrackedLink } from '../TrackedLink'
import { GET_ANDROID_URL } from '../billing/copy'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import { CONTENT_SECTIONS } from '@/lib/content'

export const GITHUB = 'https://github.com/Sukrittt/aviary-mobile'

/**
 * The public site's header and footer, shared by the landing page and
 * /legal/pricing. `base` is '' on the landing page itself (anchors scroll)
 * and '/' elsewhere (anchors go home first). `faq` points the FAQ links at a
 * page's own questions when it has them (pricing does).
 */
export function LandingHeader({ base = '', faq = `${base}#faq`, ios = false }: { base?: string; faq?: string; ios?: boolean }) {
  return <header className="lp-header"><div className="lp-header-inner">
    <a href={base || '#top'} className="lp-logo" aria-label="Aviary home"><BirdMark size={30} perched /><span>Aviary<b aria-hidden="true">.</b></span></a>
    <nav className="lp-nav" aria-label="Main navigation"><a href={`${base}#learns`}>How it learns</a><a href={`${base}#why`}>Why log it</a><a href={`${base}#play`}>Try it</a><Link href="/legal/pricing">Pricing</Link><a href={faq}>FAQ</a></nav>
    <div className="lp-header-actions">
      <Link href="/sign-in" className="lp-header-signin">Sign in</Link>
      {ios
        ? <a className="lp-header-cta" href={`${base}#top`}>Join waitlist</a>
        : <TrackedLink className="lp-header-cta" href={GET_ANDROID_URL} event="store_cta_clicked" properties={{ placement: 'header' }}>Get the app</TrackedLink>}
    </div>
  </div></header>
}

export function LandingFooter({ base = '', faq = `${base}#faq` }: { base?: string; faq?: string }) {
  return <footer className="lp-footer"><div><a href={base || '#top'} className="lp-logo"><BirdMark size={26} perched /><span>Aviary<b aria-hidden="true">.</b></span></a><p>Learns your spending. Never touches your bank.</p></div><nav aria-label="Footer">
    <div><h2>Product</h2><a href={GET_ANDROID_URL}>Android app</a><Link href="/expense">Web app</Link><a href={`${base}#get`}>iPhone waitlist</a><Link href="/legal/pricing">Pricing</Link></div>
    <div><h2>Learn</h2><Link href="/help">Help</Link><a href={faq}>FAQ</a><Link href="/changelog">Changelog</Link><Link href="/blog">Blog</Link></div>
    {Object.values(CONTENT_SECTIONS).filter((section) => section.pages.length).map((section) => <div key={section.path}><h2><Link href={section.path}>{section.label}</Link></h2>{section.pages.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</div>)}
    <div><h2>Community</h2><Link href={FEEDBACK_BOARD_PATH}>Feedback board</Link><a href={GITHUB}>GitHub</a><Link href="/legal/contact">Contact</Link></div>
    <div><h2>Legal</h2><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/refunds">Refunds</Link><Link href="/legal/delete-account">Delete account</Link></div>
  </nav></footer>
}
