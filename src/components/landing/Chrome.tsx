import Link from 'next/link'
import { BirdMark } from '../BirdMark'
import { TrackedLink } from '../TrackedLink'
import { PLAY_STORE_URL } from '../billing/copy'
import { FEEDBACK_BOARD_URL } from '@/lib/links'

export const GITHUB = 'https://github.com/Sukrittt/aviary-mobile'

/**
 * The public site's header and footer, shared by the landing page and
 * /legal/pricing. `base` is '' on the landing page itself (anchors scroll)
 * and '/' elsewhere (anchors go home first).
 */
export function LandingHeader({ base = '' }: { base?: string }) {
  return <header className="lp-header"><div className="lp-header-inner">
    <a href={base || '#top'} className="lp-logo" aria-label="Aviary home"><BirdMark size={30} perched /><span>Aviary<b aria-hidden="true">.</b></span></a>
    <nav className="lp-nav" aria-label="Main navigation"><a href={`${base}#learns`}>How it learns</a><a href={`${base}#why`}>Why log it</a><a href={`${base}#play`}>Try it</a><Link href="/legal/pricing">Pricing</Link><a href={`${base}#faq`}>FAQ</a></nav>
    <div className="lp-header-actions">
      <Link href="/sign-in" className="lp-header-signin">Sign in</Link>
      <TrackedLink className="lp-header-cta" href={PLAY_STORE_URL} event="store_cta_clicked" properties={{ placement: 'header' }}>Get the app</TrackedLink>
    </div>
  </div></header>
}

export function LandingFooter({ base = '' }: { base?: string }) {
  return <footer className="lp-footer"><div><a href={base || '#top'} className="lp-logo"><BirdMark size={26} perched /><span>Aviary<b aria-hidden="true">.</b></span></a><p>The budgeting app that learns your spending.</p></div><nav aria-label="Footer">
    <div><h2>Product</h2><a href={PLAY_STORE_URL}>Android app</a><Link href="/expense">Web app</Link><a href={`${base}#get`}>iPhone waitlist</a><Link href="/legal/pricing">Pricing</Link><a href={`${base}#faq`}>Help &amp; FAQ</a></div>
    <div><h2>Community</h2><a href={FEEDBACK_BOARD_URL}>Feedback board</a><a href={GITHUB}>GitHub</a><Link href="/legal/contact">Contact</Link></div>
    <div><h2>Legal</h2><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/refunds">Refunds</Link><Link href="/legal/delete-account">Delete account</Link></div>
  </nav></footer>
}
