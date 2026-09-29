import Link from 'next/link'
import Image from 'next/image'
import { ArrowDown, ArrowRight, Check, Github, Monitor, ShieldCheck, Smartphone } from 'lucide-react'
import { Playground } from '../components/landing/Playground'
import { Faq, LandingMotion } from '../components/landing/LandingClient'
import { TrackedLink } from '../components/TrackedLink'
import { MoneyLesson } from '../components/landing/MoneyLesson'
import { BirdLanding, BirdMark } from '../components/BirdMark'
import '../landing.css'

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'
const GITHUB = 'https://github.com/Sukrittt/aviary-mobile'
const FAQS = [
  { q: 'Why give your money a job?', a: 'Your bank balance includes money for rent, groceries, future plans, and fun. Assigning it to envelopes shows which money is available for each purpose before you spend. Savings is a purpose too: you don’t have to spend everything you assign.' },
  { q: 'Does zero ready to assign mean I’m out of money?', a: 'No. It means you’ve given all your available money a purpose. The money is still yours until you spend it. Check each envelope’s available balance to see what remains for that purpose.' },
  { q: 'What if my plans change?', a: 'Move available money from one envelope to another. Putting more into Food means choosing where it comes from, such as Fun. Your total money stays the same; your plan changes.' },
  { q: 'Is Aviary free?', a: 'Aviary is on a trial plan while payments are still being set up, so it’s free to use right now. You don’t need a payment card to get started. Once payments go live, you’ll get a full 45-day trial from that point, and we’ll tell you before it starts. We haven’t settled on a price yet, but it’ll be kept affordable. Aviary is also open source; you can inspect the code on GitHub.' },
  { q: 'Do I connect my bank? How do expenses get added?', a: 'There’s no bank connection. You log purchases yourself, which makes spending a deliberate check-in. Recurring expenses and receipt scanning help with repeated or longer entries. Transactions aren’t imported from your bank automatically.' },
  { q: 'Can I use it on my phone and computer?', a: 'Yes. Android and web share your account’s budgets and transactions. Android also offers a home-screen widget and notifications. New expenses can be logged offline on mobile and sync when you reconnect; other actions need a connection. There’s no published iPhone app; use the web version on iPhone.' },
  { q: 'What happens to my financial data?', a: <>Sensitive financial fields are encrypted in storage. The server decrypts them to run the app; this isn’t end-to-end encryption. Money Brain and AI briefs send relevant transaction and budget context to Google Gemini, and bill scanning sends receipt photos. You can export or delete your data in account settings. <Link href="/legal/privacy">Read the privacy policy</Link> for storage, analytics, and processing details.</> },
  { q: 'Can I use another currency?', a: 'Yes. Choose your display currency during setup or change it in More. One currency applies to your whole budget; changing it doesn’t convert amounts.' },
]

export function LandingPage() {
  return <LandingMotion><div className="lp" id="top">
    {/* THESIS: Teach assignment, spending, and reallocation through sample money at work.
        OWN-WORLD: Aviary's dark canvas, Fredoka/Nunito, vermilion, and pastel envelope roles.
        STORY: Understand available money, try a limited expense sample, choose Android or web.
        FIRST VIEWPORT: Direct offer above a broad interactive assignment table; platform actions remain visible.
        FORM: User-approved money-at-work lesson inside the established Aviary identity; no direction seed required.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */}
    <a href="#learn" className="lp-skip">Skip to the budgeting example</a>
    <header className="lp-header"><div className="lp-header-inner">
      <a href="#top" className="lp-logo" aria-label="Aviary home"><BirdMark size={34} />Aviary<span aria-hidden="true">.</span></a>
      <nav className="lp-nav" aria-label="Main navigation"><a href="#learn">How it works</a><a href="#play">Try it</a><a href="#faq">FAQ</a></nav>
      <Link href="/expense" className="lp-header-web">Open web app <ArrowRight size={16} /></Link>
    </div></header>

    <section className="lp-opening" aria-labelledby="landing-title">
      <div><h1 id="landing-title">Give your money<br />a <span>job to do.</span></h1><p>Rent money. Chai money. Someday money.<br className="lp-desktop-break" /> Aviary gives your money a job, so you know what’s available before you spend.</p></div>
      <div className="lp-opening-actions"><div className="lp-hero-bird"><BirdLanding size={168} /></div><TrackedLink className="lp-button lp-button--accent" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement: 'hero' }}><Smartphone size={18} />Get it on Android</TrackedLink><Link className="lp-button lp-button--outline" href="/expense"><Monitor size={18} />Open web app</Link><span>Your budget, your currency. Free &amp; open source.</span></div>
    </section>
    <div className="lp-lesson-container"><MoneyLesson /><a href="#play" className="lp-skip-lesson">Already know envelope budgeting? Try the expense demo <ArrowDown size={15} /></a></div>

    <Playground />

    <section id="features" className="lp-section lp-benefits" aria-labelledby="benefits-title">
      <div className="lp-benefits-intro"><h2 id="benefits-title" className="lp-h2">For the everyday.<br />And the someday.</h2><p className="lp-body">A place to plan this month, keep up with purchases, and make sense of the bigger picture.</p></div>
      <div className="lp-benefit-layout">
        <figure className="lp-product-shot"><Image src="/landing/envelopes.jpeg" alt="Aviary Android envelopes screen showing groups of budget categories and their available balances" width={764} height={1600} sizes="(max-width: 600px) 240px, 280px" /><figcaption>Inside Aviary for Android</figcaption></figure>
        <div className="lp-benefit-stories">
          <article><span className="lp-benefit-index" aria-hidden="true"><Check size={20} /></span><h3>Make room for what matters.</h3><p>Group your envelopes around your life. Plan for recurring expenses and subscriptions alongside food, travel, and future goals. Move money when the month changes shape.</p></article>
          <article><span className="lp-benefit-index" aria-hidden="true"><Check size={20} /></span><h3>Keep the daily part small.</h3><p>Log an expense with a keypad and a note. Category suggestions help with familiar purchases; scan a receipt when there are more items to sort.</p></article>
          <article><span className="lp-benefit-index" aria-hidden="true"><Check size={20} /></span><h3>See the picture behind the purchases.</h3><p>Explore spending with Insights and Expense Wrapped, track investments, or ask Money Brain a question about your money. Archived entries can be restored when you need them.</p></article>
        </div>
      </div>
    </section>

    <section id="web" className="lp-section lp-platforms" aria-labelledby="platform-title">
      <h2 id="platform-title" className="lp-h2">Your money goes with you.<br />Your plan does, too.</h2>
      <p className="lp-body">Use the same account on Android and the web. Your budgets and transactions stay together.</p>
      <div className="lp-platform-grid"><article><Smartphone size={28} aria-hidden="true" /><h3>In your pocket</h3><p>Log purchases on Android. Add expenses from a home-screen widget, get notifications, and queue new expenses when you’re offline.</p><TrackedLink className="lp-link" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement: 'platforms' }}>Get Aviary for Android <ArrowRight size={17} /></TrackedLink></article><article><Monitor size={28} aria-hidden="true" /><h3>At your own pace</h3><p>Plan envelopes, review transactions, and explore insights in your browser. A good place for your monthly sit-down. Also available through the browser on iPhone.</p><Link className="lp-link" href="/expense">Open the web app <ArrowRight size={17} /></Link></article></div>
    </section>

    <section className="lp-section lp-trust-section" aria-labelledby="trust-title"><div><ShieldCheck size={30} aria-hidden="true" /><h2 id="trust-title" className="lp-h2">A few things<br />worth knowing.</h2><a href={GITHUB} className="lp-link"><Github size={18} />Read the source</a></div><dl className="lp-trust-facts"><div><dt>You’re on the trial plan.</dt><dd>Payments aren’t live yet, so every account stays on the trial plan for now, no card needed. Once payments launch, you’ll get a full 45-day trial from that point, and we’ll tell you before it starts. We haven’t settled on a price, but it’ll be kept affordable.</dd></div><div><dt>You add the purchases.</dt><dd>Aviary doesn’t connect to your bank. Manual logging gives you a moment to notice a purchase; recurring entries and receipt scanning help with the longer bits.</dd></div><div><dt>Your data has a way out.</dt><dd>Export or delete your data from account settings. Sensitive fields are encrypted in storage; the server can decrypt them to run the app.</dd></div><div><dt>AI features involve processing.</dt><dd>Money Brain and AI briefs use Google Gemini with relevant financial context. Receipt scanning sends the receipt photo. <Link href="/legal/privacy">See the full privacy details.</Link></dd></div></dl></section>

    <section id="faq" className="lp-section lp-faq-section" aria-labelledby="faq-title"><h2 id="faq-title" className="lp-h2">Good questions.</h2><Faq items={FAQS} /></section>
    <section id="get" className="lp-section lp-last-section"><div className="lp-get"><h2 className="lp-h2">Your money<br />could use a plan.</h2><p>Start with the money you have.<br />Give it a purpose. Make room for your life.</p><div className="lp-get-actions"><TrackedLink href={PLAY_STORE} className="lp-button lp-button--dark" event="store_cta_clicked" properties={{ placement: 'footer_cta' }}><Smartphone size={18} />Get it on Android</TrackedLink><Link href="/expense" className="lp-button lp-button--light"><Monitor size={18} />Open web app</Link></div><span>Free to use · No bank connection · Sign in to save your plan</span></div></section>
    <footer className="lp-footer"><div><a href="#top" className="lp-logo">Aviary<span aria-hidden="true">.</span></a><p>Envelope budgeting in your currency.</p></div><nav aria-label="Footer"><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/delete-account">Delete account</Link><a href="#faq">Help &amp; FAQ</a><a href={GITHUB}>GitHub</a></nav></footer>
  </div></LandingMotion>
}
