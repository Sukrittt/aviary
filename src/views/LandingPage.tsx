import Link from 'next/link'
import Image from 'next/image'
import { preload } from 'react-dom'
import { BarWidget, EnvelopeWidget } from '../components/landing/mobile/Widget'
import { ArrowRight, ChevronUp, Github, Monitor, Repeat, ScanLine, Smartphone, WifiOff } from 'lucide-react'
import { Playground } from '../components/landing/Playground'
import { AddedClip, Faq, LandingMotion } from '../components/landing/LandingClient'
import { TrackedLink } from '../components/TrackedLink'
import { IosWaitlist } from '../components/landing/IosWaitlist'
// Parked while the page leads with habit nudges; see the commented section below.
// import { MoneyLesson } from '../components/landing/MoneyLesson'
import { BirdLanding, BirdMark } from '../components/BirdMark'
import { HeroStage, LearnDiagram, MoreInside, NoticeSplit, RotatingHabit } from '../components/landing/Nudges'
import { FEEDBACK_BOARD_URL } from '@/lib/links'
import { GITHUB, LandingFooter, LandingHeader } from '../components/landing/Chrome'
import '../landing.css'

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'

const ANYWHERE = [
  { icon: ScanLine, tone: 'food', title: 'A receipt', body: 'Snap the bill. Aviary reads every line and splits it if you shared.' },
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
  { title: 'Yours to switch off', body: 'Turn nudges off any time in notification settings.' },
]


const FAQS = [
  { q: 'How does Aviary learn my habits?', a: 'It looks at what you’ve logged. Log the same thing on the same weekday, around the same time, three times in eight weeks, and Aviary treats it as a habit. It then nudges you 15 minutes after your usual time with the details filled in. You can turn nudges off in notification settings.' },
  { q: 'Do I connect my bank? How do expenses get added?', a: 'There’s no bank connection. You log purchases yourself, which makes spending a deliberate check-in. Habit nudges, the home-screen widget, recurring expenses and receipt scanning keep that quick. Transactions aren’t imported from your bank.' },
  { q: 'What if I miss a few days?', a: 'Nothing breaks. Once a week, Aviary asks for your bank balance. If it doesn’t match what you’ve logged, it splits the difference across your usual envelopes, and you check it before it’s logged. No catching up.' },
  { q: 'What’s an envelope?', a: 'An envelope is a slice of your money set aside for one purpose, like rent, groceries or fun. Your bank balance mixes all of those together. Envelopes show what’s available for each one before you spend. Savings is a purpose too: you don’t have to spend everything you set aside.' },
  { q: 'I’ve put every rupee in an envelope. Am I out of money?', a: 'No. It means all your money has a purpose. It’s still yours until you spend it. Check each envelope to see what’s left for that purpose.' },
  { q: 'Why not just use a spreadsheet?', a: 'A spreadsheet can do the math. The hard part is keeping it up on your phone, at the counter, every day. Aviary has the envelope method built in, and most logs take one tap.' },
  { q: 'Does it work if my income changes every month?', a: 'Yes. You only budget money you already have. When a payment lands, give it jobs: rent first, then essentials. A slow month just fills fewer envelopes.' },
  { q: 'Is Aviary free?', a: <>You can try Aviary free for 45 days, with no payment details needed to get started. After the trial, you’ll need a paid subscription to keep using the app. <Link href="/legal/pricing">See plans and pricing</Link>. Aviary is also open source; you can inspect the code on GitHub.</> },
  { q: 'Can I use it on my phone and computer?', a: 'Yes. Android and web share your account’s budgets and transactions. Android also offers a home-screen widget and notifications. New expenses can be logged offline on mobile and sync when you reconnect; other actions need a connection. There’s no iPhone app yet. Use the web version on iPhone, or join the iPhone waitlist at the bottom of this page.' },
  { q: 'What happens to my financial data?', a: <>Amounts, notes and other sensitive fields are encrypted with AES-256-GCM, and the key is kept apart from the database. The server decrypts them to run the app; this isn’t end-to-end encryption. Ask Aviary and AI briefs send relevant transaction and budget context to Google Gemini, and bill scanning sends receipt photos. There are no ads, and your data is never sold. Your subscription is how Aviary makes money. You can export or delete your data in account settings. <Link href="/legal/privacy">Read the privacy policy</Link> for storage, analytics, and processing details.</> },
  { q: 'What if Aviary shuts down?', a: 'You won’t get stuck. Export your data to CSV any time, even without a subscription. And the code stays open source on GitHub.' },
  { q: 'Can I use another currency?', a: 'Yes. Choose your display currency during setup or change it in More. One currency applies to your whole budget; changing it doesn’t convert amounts.' },
]

function StoreLink({ placement, children = 'Get it on Android' }: { placement: string; children?: string }) {
  return <TrackedLink className="lp-button lp-button--dark" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement }}><Smartphone size={18} aria-hidden="true" />{children}</TrackedLink>
}

export function LandingPage({ monthlyPrice }: { monthlyPrice?: string }) {
  const afterTrial = monthlyPrice ? <> · Then {monthlyPrice}/month</> : null
  // The hero stage is the mobile LCP element, and this background is its paint.
  // As a CSS url() it's only found once the stylesheet has loaded; the preload
  // puts it in the document head so it downloads alongside the CSS instead.
  preload('/landing/doodles-stage.svg', { as: 'image', fetchPriority: 'high' })
  return <LandingMotion><div className="lp" id="top">
    {/* THESIS: Aviary learns your spending, so logging by hand costs one tap. Refuses the bank-sync pitch of "we'll do it for you".
        OWN-WORLD: Warm near-white page, ink pill buttons, Fredoka display, Nunito body, Aviary orange for the learned moment, pastel envelope tones for the ways to log.
        STORY: See a habit learned and a nudge answered, see every way to log, understand why noticing beats syncing, try the app, meet the maker, get it.
        FIRST VIEWPORT: Centered headline and rotating habit over a wide stage: noticed logs, a phone taking the nudge, the envelope updating. Android CTA in the header and under the headline.
        FORM: User-pinned moonjar.ai structure: centered statements, one framed demo per section, founder card, quiet close.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */}
    <a href="#learns" className="lp-skip">Skip to how Aviary learns</a>
    <LandingHeader />

    <section className="lp-hero" aria-labelledby="landing-title">
      <a className="lp-early" href={FEEDBACK_BOARD_URL} target="_blank" rel="noreferrer"><b>Early access</b><span className="lp-early-desktop">Your feedback shapes what we build next</span><span className="lp-early-mobile">Help shape Aviary</span><ArrowRight size={14} aria-hidden="true" /></a>
      <h1 id="landing-title">Aviary <span className="lp-learns">learns<svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10 C 40 3, 70 3, 100 8 S 160 13, 197 5" /></svg></span><br />your spending.</h1>
      <p>It notices your <RotatingHabit /> and nudges you<br className="lp-desktop-break" /> while it’s still fresh. One tap and it’s logged.</p>
      <div className="lp-hero-actions">
        <StoreLink placement="hero" />
        <a className="lp-button lp-button--ghost" href="#learns">See how it learns <ArrowRight size={17} aria-hidden="true" /></a>
      </div>
      <span className="lp-hero-note">Free for 45 days{afterTrial} · No card needed · <Link href="/expense">Also on the web</Link></span>
    </section>
    <div className="lp-stage-wrap"><HeroStage /></div>

    <section id="learns" className="lp-section lp-center" aria-labelledby="learns-title">
      <h2 id="learns-title" className="lp-h2">It learns from you,<br />not from your bank.</h2>
      <p className="lp-lede">Log the same thing on the same weekday, around the same time, three times in eight weeks. Aviary picks it up as a habit. No setup in between.</p>
      <LearnDiagram />
      <dl className="lp-rules">
        {RULES.map((r) => <div key={r.title}><dt>{r.title}</dt><dd>{r.body}</dd></div>)}
      </dl>
    </section>

    {/* Money lesson: parked, decision pending on whether it returns here or moves to its own page.
    <div className="lp-lesson-container"><MoneyLesson /></div> */}

    <section id="anywhere" className="lp-section lp-center" aria-labelledby="anywhere-title">
      <h2 id="anywhere-title" className="lp-h2">Log from anywhere.</h2>
      <p className="lp-lede">Aviary meets you where the spending happens. Most logs take one tap. The rest take a few.</p>
      <div className="lp-shots">
        <figure className="lp-shot">
          <div className="lp-shot-art lp-shot-home" aria-hidden="true">
            <div className="lp-shot-phone lp-shot-phone--home"><BarWidget /><EnvelopeWidget /></div>
          </div>
          <figcaption><strong>Your home screen</strong><span>See what’s left at a glance. Tap + and you’re on the keypad.</span></figcaption>
        </figure>
        <figure className="lp-shot">
          <div className="lp-shot-art" aria-hidden="true">
            <div className="lp-shot-phone lp-shot-phone--lock">
              <div className="lp-lock-time">11:30</div>
              <div className="lp-notif lp-notif--still">
                <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={14} perched /></span>Aviary<span className="lp-notif-time">• now</span><ChevronUp size={14} strokeWidth={2.4} /></div>
                <div className="lp-notif-body"><strong>Sunday groceries?</strong><span>Back from the market? Tap Log and it’s in.</span></div>
                <div className="lp-notif-actions"><span className="lp-notif-log">Log ₹850</span><span>Not this one</span></div>
              </div>
            </div>
          </div>
          <figcaption><strong>The nudge</strong><span>Tap Log on the notification. That’s it.</span></figcaption>
        </figure>
        <figure className="lp-shot">
          <div className="lp-shot-art" aria-hidden="true">
            <div className="lp-shot-phone"><video src="/landing/clip-log.mp4" poster="/landing/poster-log.jpg" autoPlay muted loop playsInline preload="metadata" /></div>
          </div>
          <figcaption><strong>The keypad</strong><span>Amount, a word or two, done. The envelope picks itself.</span></figcaption>
        </figure>
      </div>
      <ul className="lp-ways lp-ways--compact">
        {ANYWHERE.map(({ icon: Icon, tone, title, body }) => <li key={title}>
          <span className={`lp-way-icon lp-tone-${tone}`}><Icon size={22} strokeWidth={2.2} aria-hidden="true" /></span>
          <span><strong>{title}</strong><span>{body}</span></span>
        </li>)}
      </ul>
    </section>



    <section id="why" className="lp-section lp-center lp-why" aria-labelledby="why-title">
      <span className="lp-question">Can’t my bank just sync this?</span>
      <h2 id="why-title" className="lp-h2">Noticing is the point.</h2>
      <p className="lp-lede">Bank sync logs everything for you. That’s the catch. Money leaves, the app files it away, and you never feel a thing.</p>
      <NoticeSplit />
      <p className="lp-why-close">Aviary keeps the one second where you notice a spend, and takes away everything around it. That second is what makes a budget work.</p>
    </section>

    <section className="lp-section lp-center" aria-labelledby="wins-title">
      <h2 id="wins-title" className="lp-h2">Every log is a little win.</h2>
      <p className="lp-lede">Logging is the part you do every day, so we made it the part that feels good.</p>
      <div className="lp-wins">
        <article className="lp-win">
          <h3>See what’s left, right away.</h3>
          <p>In the app, every log lands with a check, a buzz and a chime. Then you see what’s left in that envelope, the slice of your money you set aside for it.</p>
          <AddedClip />
        </article>
        <article className="lp-win lp-win--wrapped">
          <h3>A streak worth keeping.</h3>
          <p>Expense Wrapped turns your month into a recap, longest logging streak included.</p>
          <div className="lp-win-shots">
            <Image src="/landing/wrapped-streak.png" alt="Longest logging streak: 23 days, 8 Sep to 30 Sep." width={576} height={640} sizes="(max-width: 760px) 45vw, 250px" />
            <Image src="/landing/wrapped-persona.png" alt="Your spending personality: The Homebody." width={576} height={640} sizes="(max-width: 760px) 45vw, 250px" />
          </div>
        </article>
      </div>
    </section>

    <Playground />

    <section id="more" className="lp-section lp-center" aria-labelledby="more-title">
      <h2 id="more-title" className="lp-h2">More in the nest.</h2>
      <p className="lp-lede">Logging is the daily part. This is what it adds up to.</p>
      <MoreInside />
    </section>

    <section className="lp-section" aria-labelledby="founder-title">
      <div className="lp-founder">
        <div className="lp-founder-copy">
          <h2 id="founder-title" className="lp-h2">Hi, I’m Sukrit <span aria-hidden="true">👋</span></h2>
          <p>I’ve been trying to get budgeting right for years. I built a few apps for it, fell back on spreadsheets, and tried bank sync apps. Sync didn’t change a thing. My spending got filed away and I still had no idea where my money went.</p>
          <p>YNAB finally clicked. Giving every rupee a job made me actually notice my spending. Then its pricing humbled me.</p>
          <p>So I built Aviary. You still log every expense yourself, because that’s the part that makes you notice. Aviary just learns when you usually spend and nudges you while it’s fresh, so logging takes one tap. It’s the app I wanted for years. I hope it clicks for you too.</p>
          <a href={GITHUB} className="lp-button lp-button--ghost"><Github size={17} aria-hidden="true" />Read the source</a>
          <div className="lp-founder-sign"><span aria-hidden="true">S</span><div><strong>Sukrit</strong><small>Builds Aviary</small></div></div>
        </div>
        <figure className="lp-road">
          <div className="lp-road-tiles">
            <span className="lp-road-tile lp-road-sheet" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
            <span className="lp-road-tile lp-road-bank" aria-hidden="true">UPI/DR<br />POS<br />NACH</span>
            <span className="lp-road-tile lp-road-ynab" aria-hidden="true">$$$</span>
            <TrackedLink className="lp-road-tile lp-road-aviary" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement: 'founder_icon' }}><BirdMark size={64} perched /><span className="lp-sr-only">Get Aviary on Google Play</span></TrackedLink>
          </div>
          <figcaption>Homemade apps, spreadsheets, bank sync, YNAB, and now Aviary.</figcaption>
        </figure>
      </div>
    </section>


    <section id="faq" className="lp-section lp-faq-section" aria-labelledby="faq-title"><h2 id="faq-title" className="lp-h2">Good questions.</h2><Faq items={FAQS} /></section>

    <section id="get" className="lp-section lp-close" aria-labelledby="get-title">
      <span className="lp-close-bird"><BirdLanding size={120} alive /></span>
      <h2 id="get-title" className="lp-h2">Your money, noticed.</h2>
      <div className="lp-hero-actions"><StoreLink placement="footer_cta" /><Link href="/expense" className="lp-button lp-button--ghost"><Monitor size={18} aria-hidden="true" />Open web app</Link></div>
      <span className="lp-hero-note">Free for 45 days{afterTrial} · No card needed · <a href={GITHUB} target="_blank" rel="noreferrer">Open source</a></span>
      <IosWaitlist />
    </section>
    <LandingFooter />
  </div></LandingMotion>
}
