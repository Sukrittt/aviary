import Link from 'next/link'
import { ArrowRight, Bell, Github, LayoutGrid, Monitor, Repeat, ScanLine, Smartphone, WifiOff } from 'lucide-react'
import { Playground } from '../components/landing/Playground'
import { Faq, LandingMotion } from '../components/landing/LandingClient'
import { TrackedLink } from '../components/TrackedLink'
// Parked while the page leads with habit nudges; see the commented section below.
// import { MoneyLesson } from '../components/landing/MoneyLesson'
import { BirdLanding, BirdMark } from '../components/BirdMark'
import { HeroStage, RotatingHabit, TickButton } from '../components/landing/Nudges'
import '../landing.css'

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'
const GITHUB = 'https://github.com/Sukrittt/aviary-mobile'

const ANYWHERE = [
  { icon: Bell, tone: 'fun', title: 'The nudge', body: 'Tap Log on the notification. That’s it.' },
  { icon: LayoutGrid, tone: 'rent', title: 'Your home screen', body: 'The widget opens straight to the keypad.' },
  { icon: ScanLine, tone: 'food', title: 'A receipt', body: 'Snap the bill. The items get sorted for you.' },
  { icon: Repeat, tone: 'savings', title: 'On repeat', body: 'Rent and subscriptions log themselves.' },
  { icon: WifiOff, tone: 'fun', title: 'No signal', body: 'Logs wait on your phone, then sync.' },
  { icon: Monitor, tone: 'rent', title: 'Your browser', body: 'Same budget, bigger screen.' },
]

const RULES = [
  { title: 'Fills in the usual', body: 'What it was, how much, which envelope and how you paid. All from your own history.' },
  { title: 'Shows up after, not before', body: 'A nudge lands 15 minutes after your usual time, while the spend is still fresh.' },
  { title: 'Two a day, tops', body: 'Your strongest habits go first. The rest wait for another day.' },
  { title: 'Backs off when you ignore it', body: 'Skip one twice and it moves an hour later. Five times and it goes quiet.' },
  { title: 'Skips what’s done', body: 'Already logged it today? Then there’s nothing to nudge.' },
]

const FEED = [
  ['UPI/DR/6021843/SWIGGY', '₹349'],
  ['POS 4419XXXX ZEPTO MUM', '₹612'],
  ['UPI/DR/6021977/PAYTM', '₹20'],
  ['NACH DR ACH-91X8820', '₹1,299'],
  ['IMPS/P2A/88123/XXXX', '₹500'],
]
const LOG = [
  ['Dinner with Riya', 'Eating out', '₹349'],
  ['Groceries for the week', 'Food', '₹612'],
  ['Chai', 'Snacks', '₹20'],
  ['Gym', 'Health', '₹1,299'],
  ['Paid Arjun back', 'Friends', '₹500'],
]

const FAQS = [
  { q: 'How does Aviary learn my habits?', a: 'It looks at what you’ve logged. Log the same thing on the same weekday, around the same time, three times in eight weeks, and Aviary treats it as a habit. It then nudges you 15 minutes after your usual time with the details filled in. You can turn nudges off in notification settings.' },
  { q: 'Do I connect my bank? How do expenses get added?', a: 'There’s no bank connection. You log purchases yourself, which makes spending a deliberate check-in. Habit nudges, the home-screen widget, recurring expenses and receipt scanning keep that quick. Transactions aren’t imported from your bank.' },
  { q: 'Why give your money a job?', a: 'Your bank balance includes money for rent, groceries, future plans, and fun. Assigning it to envelopes shows which money is available for each purpose before you spend. Savings is a purpose too: you don’t have to spend everything you assign.' },
  { q: 'Does zero ready to assign mean I’m out of money?', a: 'No. It means you’ve given all your available money a purpose. The money is still yours until you spend it. Check each envelope’s available balance to see what remains for that purpose.' },
  { q: 'Is Aviary free?', a: 'Aviary is on a trial plan while payments are still being set up, so it’s free to use right now. You don’t need a payment card to get started. Once payments go live, you’ll get a full 45-day trial from that point, and we’ll tell you before it starts. We haven’t settled on a price yet, but it’ll be kept affordable. Aviary is also open source; you can inspect the code on GitHub.' },
  { q: 'Can I use it on my phone and computer?', a: 'Yes. Android and web share your account’s budgets and transactions. Android also offers a home-screen widget and notifications. New expenses can be logged offline on mobile and sync when you reconnect; other actions need a connection. There’s no published iPhone app; use the web version on iPhone.' },
  { q: 'What happens to my financial data?', a: <>Sensitive financial fields are encrypted in storage. The server decrypts them to run the app; this isn’t end-to-end encryption. Ask Aviary and AI briefs send relevant transaction and budget context to Google Gemini, and bill scanning sends receipt photos. You can export or delete your data in account settings. <Link href="/legal/privacy">Read the privacy policy</Link> for storage, analytics, and processing details.</> },
  { q: 'Can I use another currency?', a: 'Yes. Choose your display currency during setup or change it in More. One currency applies to your whole budget; changing it doesn’t convert amounts.' },
]

function StoreLink({ placement, children = 'Get it on Android' }: { placement: string; children?: string }) {
  return <TrackedLink className="lp-button lp-button--dark" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement }}><Smartphone size={18} aria-hidden="true" />{children}</TrackedLink>
}

export function LandingPage() {
  return <LandingMotion><div className="lp" id="top">
    {/* THESIS: Aviary learns your spending, so logging by hand costs one tap. Refuses the bank-sync pitch of "we'll do it for you".
        OWN-WORLD: Warm near-white page, ink pill buttons, Fredoka display, Nunito body, Aviary orange for the learned moment, pastel envelope tones for the ways to log.
        STORY: See a habit learned and a nudge answered, see every way to log, understand why noticing beats syncing, try the app, meet the maker, get it.
        FIRST VIEWPORT: Centered headline and rotating habit over a wide stage: noticed logs, a phone taking the nudge, the envelope updating. Android CTA in the header and under the headline.
        FORM: User-pinned moonjar.ai structure: centered statements, one framed demo per section, founder card, quiet close.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */}
    <a href="#learns" className="lp-skip">Skip to how Aviary learns</a>
    <header className="lp-header"><div className="lp-header-inner">
      <a href="#top" className="lp-logo" aria-label="Aviary home"><BirdMark size={30} /><span>Aviary<b aria-hidden="true">.</b></span></a>
      <nav className="lp-nav" aria-label="Main navigation"><a href="#learns">How it learns</a><a href="#why">Why log it</a><a href="#play">Try it</a><a href="#faq">FAQ</a></nav>
      <TrackedLink className="lp-header-cta" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement: 'header' }}>Get the app</TrackedLink>
    </div></header>

    <section className="lp-hero" aria-labelledby="landing-title">
      <h1 id="landing-title">Aviary <span className="lp-learns">learns<svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10 C 40 3, 70 3, 100 8 S 160 13, 197 5" /></svg></span><br />your spending.</h1>
      <p>It notices your <RotatingHabit /> and nudges you<br className="lp-desktop-break" /> while it’s still fresh. One tap and it’s logged.</p>
      <div className="lp-hero-actions">
        <StoreLink placement="hero" />
        <a className="lp-button lp-button--ghost" href="#learns">See how it learns <ArrowRight size={17} aria-hidden="true" /></a>
      </div>
      <span className="lp-hero-note">Free during the trial · No bank connection · <Link href="/expense">Also on the web</Link></span>
    </section>
    <div className="lp-stage-wrap"><HeroStage /></div>

    <section id="learns" className="lp-section lp-center" aria-labelledby="learns-title">
      <h2 id="learns-title" className="lp-h2">It learns from you,<br />not from your bank.</h2>
      <p className="lp-lede">Log the same thing on the same weekday, around the same time, three times in eight weeks. Aviary picks it up as a habit. No setup in between.</p>
      <figure className="lp-learn">
        <ol className="lp-learn-col" aria-label="What you logged">
          {['15 Sep', '22 Sep', '29 Sep'].map((d, i) => <li key={d}><span>Tue, {d}</span><strong>Chai · ₹20</strong><em>{['4:02pm', '4:11pm', '3:56pm'][i]}</em></li>)}
        </ol>
        <svg className="lp-learn-lines" viewBox="0 0 80 240" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 C 40 40, 40 120, 80 120 M0 120 L 80 120 M0 200 C 40 200, 40 120, 80 120" /></svg>
        <div className="lp-learn-habit"><BirdMark size={34} /><strong>Habit learned</strong><span>Chai on Tuesdays,<br />around 4pm</span></div>
        <svg className="lp-learn-lines" viewBox="0 0 80 240" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 C 40 120, 40 40, 80 40 M0 120 L 80 120 M0 120 C 40 120, 40 200, 80 200" /></svg>
        <ol className="lp-learn-col lp-learn-next" aria-label="Nudges Aviary sends next">
          {['6 Oct', '13 Oct', '20 Oct'].map((d) => <li key={d}><span>Tue, {d}</span><strong>Chai time?</strong><em>4:15pm</em></li>)}
        </ol>
        <figcaption>Three Tuesdays in, three nudges out. Sample data.</figcaption>
      </figure>
      <dl className="lp-rules">
        {RULES.map((r) => <div key={r.title}><dt>{r.title}</dt><dd>{r.body}</dd></div>)}
      </dl>
    </section>

    {/* Money lesson: parked, decision pending on whether it returns here or moves to its own page.
    <div className="lp-lesson-container"><MoneyLesson /></div> */}

    <section id="anywhere" className="lp-section lp-center" aria-labelledby="anywhere-title">
      <h2 id="anywhere-title" className="lp-h2">Log from anywhere.</h2>
      <p className="lp-lede">Aviary meets you where the spending happens. Most logs take one tap. The rest take a few.</p>
      <ul className="lp-ways">
        {ANYWHERE.map(({ icon: Icon, tone, title, body }) => <li key={title}>
          <span className={`lp-way-icon lp-tone-${tone}`}><Icon size={26} strokeWidth={2.2} aria-hidden="true" /></span>
          <strong>{title}</strong><span>{body}</span>
        </li>)}
      </ul>
    </section>

    <section className="lp-section lp-center" aria-labelledby="form-title">
      <h2 id="form-title" className="lp-h2">Skip the form.</h2>
      <div className="lp-split">
        <div className="lp-split-side lp-without" aria-label="Without Aviary">
          <div className="lp-form" aria-hidden="true">
            {[['Amount', '₹'], ['What was it?', ''], ['Envelope', 'Choose'], ['Date', 'Today'], ['Paid with', 'Choose'], ['Note', '']].map(([label, value]) =>
              <div className="lp-form-field" key={label}><span>{label}</span><i>{value}</i></div>)}
            <div className="lp-form-save">Save</div>
          </div>
          <p>Six fields, every single chai.</p>
        </div>
        <span className="lp-versus" aria-hidden="true">Without Aviary <ArrowRight size={15} /> With Aviary</span>
        <div className="lp-split-side lp-with" aria-label="With Aviary">
          <div className="lp-notif lp-notif--flat" aria-hidden="true">
            <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={14} /></span>Aviary · now</div>
            <div className="lp-notif-body"><strong>Chai time?</strong><span>Log it while it’s fresh. We filled in the usual.</span></div>
            <div className="lp-chips"><span>Chai</span><span>🍪 Snacks</span><span>₹20</span><span>UPI</span></div>
            <div className="lp-notif-actions"><span className="lp-notif-log">Log ₹20</span><span>Not this one</span></div>
          </div>
          <p>One tap. Aviary already knows the rest.</p>
        </div>
      </div>
    </section>


    <section id="why" className="lp-section lp-center" aria-labelledby="why-title">
      <span className="lp-question">Can’t my bank just sync this?</span>
      <h2 id="why-title" className="lp-h2">Noticing is the point.</h2>
      <p className="lp-lede">Bank sync logs everything for you. That’s the catch. Money leaves, the app files it away, and you never feel a thing.</p>
      <div className="lp-feeds">
        <div className="lp-feed lp-feed--bank">
          <h3>What a bank feed shows you</h3>
          <ul>{FEED.map(([what, amt]) => <li key={what}><span>{what}</span><strong>{amt}</strong></li>)}</ul>
          <p>Five things to sort out later.</p>
        </div>
        <div className="lp-feed lp-feed--aviary">
          <h3>What you logged in Aviary</h3>
          <ul>{LOG.map(([what, env, amt]) => <li key={what}><span>{what}<small>{env}</small></span><strong>{amt}</strong></li>)}</ul>
          <p>Every one noticed when it happened.</p>
        </div>
      </div>
      <p className="lp-why-close">Aviary keeps the one second where you notice a spend, and takes away everything around it. That second is what makes a budget work.</p>
    </section>

    <section className="lp-section lp-center" aria-labelledby="wins-title">
      <h2 id="wins-title" className="lp-h2">Every log is a little win.</h2>
      <p className="lp-lede">Logging is the part you do every day, so we made it the part that feels good.</p>
      <div className="lp-wins">
        <article className="lp-win lp-win--tick">
          <h3>A tick you can feel.</h3>
          <p>Every log gets a check, a buzz and a chime. Go on, try it.</p>
          <TickButton />
        </article>
        <article className="lp-win">
          <h3>See what’s left, right away.</h3>
          <p>The moment it’s logged, you see what that envelope has left for the month.</p>
          <div className="lp-win-left" aria-hidden="true">
            <div><span>🍪 Snacks</span><strong>₹220 <small>left of ₹600</small></strong></div>
            <div className="lp-envelope-bar"><i style={{ transform: 'scaleX(.63)' }} /></div>
            <span className="lp-win-meta">About ₹11 a day for the next 20 days</span>
          </div>
        </article>
        <article className="lp-win">
          <h3>A streak worth keeping.</h3>
          <p>Expense Wrapped turns your month into a recap, longest logging streak included.</p>
          <div className="lp-win-streak" aria-hidden="true"><strong>23</strong><span>days<br />Longest logging streak</span></div>
        </article>
      </div>
    </section>

    <Playground />

    <section className="lp-section" aria-labelledby="founder-title">
      <div className="lp-founder">
        <div className="lp-founder-copy">
          <h2 id="founder-title" className="lp-h2">Hi, I’m Sukrit <span aria-hidden="true">👋</span></h2>
          <p>I’ve been trying to get budgeting right for years. I built a few apps for it, fell back on spreadsheets, and tried bank sync apps. Sync didn’t change a thing. My spending got filed away and I still had no idea where my money went.</p>
          <p>YNAB finally clicked. Then its pricing humbled me.</p>
          <p>So I set out to build the best of all worlds: the intention of logging it yourself, with the busywork around it automated away. I cooked really hard on this one. It’s the tool I’ve wanted to build for a long time, and I hope you find it useful too.</p>
          <a href={GITHUB} className="lp-button lp-button--ghost"><Github size={17} aria-hidden="true" />Read the source</a>
          <div className="lp-founder-sign"><span aria-hidden="true">S</span><div><strong>Sukrit</strong><small>Builds Aviary</small></div></div>
        </div>
        <figure className="lp-road">
          <div className="lp-road-tiles" aria-hidden="true">
            <span className="lp-road-tile lp-road-sheet"><i /><i /><i /><i /><i /><i /></span>
            <span className="lp-road-tile lp-road-bank">UPI/DR<br />POS<br />NACH</span>
            <span className="lp-road-tile lp-road-ynab">$$$</span>
            <span className="lp-road-tile lp-road-aviary"><BirdMark size={64} /></span>
          </div>
          <figcaption>Homemade apps, spreadsheets, bank sync, YNAB, and now Aviary.</figcaption>
        </figure>
      </div>
    </section>


    <section id="faq" className="lp-section lp-faq-section" aria-labelledby="faq-title"><h2 id="faq-title" className="lp-h2">Good questions.</h2><Faq items={FAQS} /></section>

    <section id="get" className="lp-section lp-close" aria-labelledby="get-title">
      <span className="lp-close-bird"><BirdLanding size={120} /></span>
      <h2 id="get-title" className="lp-h2">Your money, noticed.</h2>
      <div className="lp-hero-actions"><StoreLink placement="footer_cta" /><Link href="/expense" className="lp-button lp-button--ghost"><Monitor size={18} aria-hidden="true" />Open web app</Link></div>
      <span className="lp-hero-note">Free during the trial · No bank connection · Open source</span>
    </section>
    <footer className="lp-footer"><div><a href="#top" className="lp-logo"><BirdMark size={26} /><span>Aviary<b aria-hidden="true">.</b></span></a><p>The budgeting app that learns your spending.</p></div><nav aria-label="Footer"><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/delete-account">Delete account</Link><a href="#faq">Help &amp; FAQ</a><a href={GITHUB}>GitHub</a></nav></footer>
  </div></LandingMotion>
}
