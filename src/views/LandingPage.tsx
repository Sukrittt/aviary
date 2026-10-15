import Link from 'next/link'
import Image from 'next/image'
import { preload } from 'react-dom'
import { MiniWidget, EnvelopeWidget } from '../components/landing/mobile/Widget'
import { ArrowRightIcon, CaretUpIcon, GithubLogoIcon, ChatTextIcon, MonitorIcon, RepeatIcon, ScanIcon, DeviceMobileIcon, HandWavingIcon, WifiSlashIcon } from '@/src/components/icons'
import { Playground } from '../components/landing/Playground'
import { AddedClip, Faq, LandingMotion } from '../components/landing/LandingClient'
import { landingFaqs } from '../components/landing/faqs'
import { TrackedLink } from '../components/TrackedLink'
import { IosWaitlist } from '../components/landing/IosWaitlist'
// Parked while the page leads with habit nudges; see the commented section below.
// import { MoneyLesson } from '../components/landing/MoneyLesson'
import { BirdLanding, BirdMark } from '../components/BirdMark'
import { HeroStage, LearnDiagram, MoreInside, NoticeSplit, RotatingHabit } from '../components/landing/Nudges'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import { GITHUB, LandingFooter, LandingHeader } from '../components/landing/Chrome'
import { SampleScope } from '../components/landing/sample'
import '../landing.css'

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'

const anywhere = (intl: boolean) => [
  { icon: ChatTextIcon, tone: 'rent', title: 'Catch up in one line', body: intl ? 'Type “bus 3, lunch 15”. Both logged, each in the right category.' : 'Type “auto 240, lunch 150”. Both logged, each in the right category.' },
  { icon: ScanIcon, tone: 'food', title: 'The long bill', body: 'Snap it. Aviary reads every line and splits it if you shared.' },
  { icon: RepeatIcon, tone: 'savings', title: 'On repeat', body: 'Rent and subscriptions log themselves. Nothing to catch up on.' },
  { icon: WifiSlashIcon, tone: 'fun', title: 'No signal', body: 'Logs wait on your phone, then sync.' },
  { icon: MonitorIcon, tone: 'rent', title: 'Your browser', body: 'Same budget, bigger screen.' },
]

const RULES = [
  { title: 'Fills in the usual', body: 'What it was, how much, which category and how you paid. All from your own history.' },
  { title: 'Two a day, and it backs off', body: 'Your strongest habits go first. Skip one twice and it moves an hour later. Five times and it goes quiet. Or switch them off any time.' },
  { title: 'Skips what’s done, asks when it isn’t', body: 'Already logged it today? Then there’s nothing to nudge. Nothing logged by evening? One push asks “Anything today?”' },
]

/** The arc every budgeting app shares. Day numbers are a feeling, not a stat. */
const DAYS: [string, string, string][] = [
  ['1', 'Fresh start', 'New app. Every category filled. You log the coffee with a little thrill.'],
  ['3', 'Two slip past', 'A cab and a lunch. You’ll add them later.'],
  ['5', 'Later never came', 'Now there’s a backlog. Opening the app feels like homework.'],
  ['7', 'Gone', 'Nothing’s logged. The icon just sits there, looking at you. Uninstall.'],
]


function StoreLink({ placement, children = 'Get it on Android' }: { placement: string; children?: string }) {
  return <TrackedLink className="lp-button lp-button--dark" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement }}><DeviceMobileIcon size={18} aria-hidden="true" />{children}</TrackedLink>
}

/**
 * `ios` swaps every Play Store CTA for the iPhone waitlist: the Android link is a dead end on iPhone.
 * `android` drops the waitlist: they can install today. Desktop keeps both, since it could be either phone.
 */
/** `intl` (the /intl page) swaps the sample data to dollars and examples that read anywhere. */
/** `otherMarket`: the visitor's IP says they belong on the other market's page, so link them there. */
export function LandingPage({ monthlyPrice, ios = false, android = false, intl = false, otherMarket = false }: { monthlyPrice?: string; ios?: boolean; android?: boolean; intl?: boolean; otherMarket?: boolean }) {
  const afterTrial = monthlyPrice ? <> · Then {monthlyPrice}/month</> : null
  // The hero stage is the mobile LCP element, and this background is its paint.
  // As a CSS url() it's only found once the stylesheet has loaded; the preload
  // puts it in the document head so it downloads alongside the CSS instead.
  preload('/landing/doodles-stage.svg', { as: 'image', fetchPriority: 'high' })
  return <LandingMotion><SampleScope intl={intl}><div className="lp" id="top">
    {/* THESIS: Budgeting apps get dropped by day 3 because logging costs more than it gives back. Aviary makes logging cheap (nudges, one-line catch-up, recurring) and never touches your bank. Refuses the bank-sync pitch of "we'll do it for you".
        OWN-WORLD: Warm near-white page, ink pill buttons, Geist display and body, Aviary orange for the learned moment, pastel envelope tones for the ways to log.
        STORY: Name the day-3 arc everyone knows, then the three fixes (a habit learned and a nudge answered; a missed day typed back in one line; every other way to log), understand why noticing beats syncing, try the app, meet the maker, get it.
        FIRST VIEWPORT: Centered headline and rotating habit over a wide stage: noticed logs, a phone taking the nudge, the envelope updating. Android CTA and the web app button under the headline.
        FORM: User-pinned moonjar.ai structure: centered statements, one framed demo per section, founder card, quiet close.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */}
    <a href="#learns" className="lp-skip">Skip to how Aviary learns</a>
    <LandingHeader ios={ios} />

    <section className="lp-hero" aria-labelledby="landing-title">
      {otherMarket && (intl
        ? <p className="lp-market">In India? <Link href="/">See the India page</Link></p>
        : <p className="lp-market">Outside India? <Link href="/intl">See the page for your region</Link></p>)}
      <Link className="lp-early" href={FEEDBACK_BOARD_PATH}><b>Early access</b><span className="lp-early-desktop">Your feedback shapes what we build next</span><span className="lp-early-mobile">Help shape Aviary</span><ArrowRightIcon size={14} aria-hidden="true" /></Link>
      <h1 id="landing-title">The budgeting app you’ll still open on <span className="lp-learns">day 4<svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10 C 40 3, 70 3, 100 8 S 160 13, 197 5" /></svg></span>.</h1>
      <p>It notices your <RotatingHabit /> and nudges you while it’s still fresh.<br className="lp-desktop-break" /> Miss a day? Type what you remember and you’re caught up.<br className="lp-desktop-break" /> No bank link, no loans, no offers.</p>
      {ios && <IosWaitlist placement="hero" className="lp-waitlist--hero" />}
      <div className="lp-hero-actions">
        {!ios && <StoreLink placement="hero" />}
        <Link href="/expense" className="lp-button lp-button--ghost"><MonitorIcon size={18} aria-hidden="true" />Use it on the web today</Link>
      </div>
      <span className="lp-hero-note">Free for 30 days{afterTrial} · No card needed</span>
      {/* Desktop only: plenty of iPhone owners browse on a Mac and would miss the waitlist at the bottom. */}
      {!ios && !android && <span className="lp-hero-note lp-hero-note--tight">Not on iPhone yet. <a href="#get">Join the waitlist</a></span>}
    </section>
    <div className="lp-stage-wrap"><HeroStage /></div>

    <section id="day3" className="lp-section lp-center" aria-labelledby="day3-title">
      <h2 id="day3-title" className="lp-h2">You know how it goes.</h2>
      <p className="lp-lede">Every budgeting app starts the same way. So does the ending.</p>
      <ol className="lp-days">
        {DAYS.map(([day, title, body]) => <li key={day}><span>Day {day}</span><strong>{title}</strong><p>{body}</p></li>)}
      </ol>
      <p className="lp-days-close">That’s not a willpower problem. Logging cost more than it gave back. So Aviary makes it cheap, three ways.</p>
    </section>

    <section id="learns" className="lp-section lp-center" aria-labelledby="learns-title">
      <span className="lp-question">Day 4 with Aviary</span>
      <h2 id="learns-title" className="lp-h2">It already knows your Friday cab.</h2>
      <p className="lp-lede">Log the same thing on the same weekday, around the same time, three times in eight weeks. Aviary picks it up as a habit and nudges you 15 minutes after, details filled in. One tap and it’s logged.</p>
      <LearnDiagram />
      <dl className="lp-rules">
        {RULES.map((r) => <div key={r.title}><dt>{r.title}</dt><dd>{r.body}</dd></div>)}
      </dl>
    </section>

    {/* Money lesson: parked, decision pending on whether it returns here or moves to its own page.
    <div className="lp-lesson-container"><MoneyLesson /></div> */}

    <section id="anywhere" className="lp-section lp-center" aria-labelledby="anywhere-title">
      <span className="lp-question">Day 5 with Aviary</span>
      <h2 id="anywhere-title" className="lp-h2">Missed yesterday?<br />Type what you remember.</h2>
      <p className="lp-lede">Open Ask Aviary and type {intl ? '“bus 3, lunch 15, Friday dinner 60”' : '“auto 240, lunch 150, Friday dinner 900”'}. It turns that into separate spends, picks the categories, and you check them before they land. Two missed days take about a minute.</p>
      <ul className="lp-ways lp-ways--compact">
        {anywhere(intl).map(({ icon: Icon, tone, title, body }) => <li key={title}>
          <span className={`lp-way-icon lp-tone-${tone}`}><Icon size={22} aria-hidden="true" /></span>
          <span><strong>{title}</strong><span>{body}</span></span>
        </li>)}
      </ul>
      <p className="lp-lede">And on a normal day, it’s one tap.</p>
      <div className="lp-shots">
        <figure className="lp-shot">
          <div className="lp-shot-art lp-shot-home" aria-hidden="true">
            <div className="lp-shot-phone lp-shot-phone--home"><MiniWidget /><EnvelopeWidget /></div>
          </div>
          <figcaption><strong>Your home screen</strong><span>See what’s left at a glance. Tap + and you’re on the keypad.</span></figcaption>
        </figure>
        <figure className="lp-shot">
          <div className="lp-shot-art" aria-hidden="true">
            <div className="lp-shot-phone lp-shot-phone--lock">
              <div className="lp-lock-time">11:30</div>
              <div className="lp-notif lp-notif--still">
                <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={14} perched /></span>Aviary<span className="lp-notif-time">• now</span><CaretUpIcon size={14} weight="bold" /></div>
                <div className="lp-notif-body"><strong>Sunday groceries?</strong><span>Back from the market? Tap Log and it’s in.</span></div>
                <div className="lp-notif-actions"><span className="lp-notif-log">Log {intl ? '$64' : '₹850'}</span><span>Not this one</span></div>
              </div>
            </div>
          </div>
          <figcaption><strong>The nudge</strong><span>Tap Log on the notification. That’s it.</span></figcaption>
        </figure>
        <figure className="lp-shot">
          <div className="lp-shot-art" aria-hidden="true">
            <div className="lp-shot-phone"><video src={`/landing/${intl ? 'intl/' : ''}clip-log.mp4`} poster={`/landing/${intl ? 'intl/' : ''}poster-log.jpg`} autoPlay muted loop playsInline preload="metadata" /></div>
          </div>
          <figcaption><strong>The keypad</strong><span>Amount, a word or two, done. The category picks itself.</span></figcaption>
        </figure>
      </div>
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
          <p>In the app, every log lands with a check, a buzz and a chime. Then you see what’s left in that category, the slice of your money you set aside for it.</p>
          <AddedClip />
        </article>
        <article className="lp-win lp-win--wrapped">
          <h3>A streak worth keeping.</h3>
          <p>Expense Wrapped turns your month into a recap, longest logging streak included.</p>
          <div className="lp-win-shots">
            <Image src={`/landing/${intl ? 'intl/' : ''}wrapped-streak.png`} alt={intl ? 'Longest logging streak: 23 days, 8 Sep to 30 Sep.' : 'Longest logging streak: 15 days, 12 Sep to 26 Sep.'} width={576} height={640} sizes="(max-width: 760px) 45vw, 250px" />
            <Image src={`/landing/${intl ? 'intl/' : ''}wrapped-persona.png`} alt={intl ? 'Your spending personality: The Homebody.' : 'Your spending personality: The Quiet Investor.'} width={576} height={640} sizes="(max-width: 760px) 45vw, 250px" />
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
          <h2 id="founder-title" className="lp-h2">Hi, I’m Sukrit <HandWavingIcon aria-hidden="true" style={{ verticalAlign: '-0.1em' }} /></h2>
          <p>I’ve quit every budgeting app I ever tried, usually by week two. I built a few myself, fell back on spreadsheets, and tried bank sync. Sync didn’t change a thing. My spending got filed away and I still had no idea where my money went.</p>
          <p>YNAB finally clicked. Giving every {intl ? 'dollar' : 'rupee'} a job made me actually notice my spending. Then its pricing humbled me.</p>
          <p>So I built Aviary. You still log every expense yourself, because that’s the part that makes you notice. Aviary just learns when you usually spend and nudges you while it’s fresh, so logging takes one tap. It’s the app I wanted for years. I hope it clicks for you too.</p>
          <a href={GITHUB} className="lp-button lp-button--ghost"><GithubLogoIcon size={17} aria-hidden="true" />Read the source</a>
          <div className="lp-founder-sign"><span aria-hidden="true">S</span><div><strong>Sukrit</strong><small>Builds Aviary</small></div></div>
        </div>
        <figure className="lp-road">
          <div className="lp-road-tiles">
            <span className="lp-road-tile lp-road-sheet" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
            <span className="lp-road-tile lp-road-bank" aria-hidden="true">{intl ? <>ACH<br />POS<br />ATM</> : <>UPI/DR<br />POS<br />NACH</>}</span>
            <span className="lp-road-tile lp-road-ynab" aria-hidden="true">$$$</span>
            <TrackedLink className="lp-road-tile lp-road-aviary" href={PLAY_STORE} event="store_cta_clicked" properties={{ placement: 'founder_icon' }}><BirdMark size={64} perched /><span className="lp-sr-only">Get Aviary on Google Play</span></TrackedLink>
          </div>
          <figcaption>Homemade apps, spreadsheets, bank sync, YNAB, and now Aviary.</figcaption>
        </figure>
      </div>
    </section>


    <section id="faq" className="lp-section lp-faq-section" aria-labelledby="faq-title"><h2 id="faq-title" className="lp-h2">Good questions.</h2><Faq items={landingFaqs(intl, monthlyPrice)} /></section>

    <section id="get" className="lp-section lp-close" aria-labelledby="get-title">
      <span className="lp-close-bird"><BirdLanding size={120} alive /></span>
      <h2 id="get-title" className="lp-h2">Your money, noticed.</h2>
      <div className="lp-hero-actions">{!ios && <StoreLink placement="footer_cta" />}<Link href="/expense" className="lp-button lp-button--ghost"><MonitorIcon size={18} aria-hidden="true" />Open web app</Link></div>
      <span className="lp-hero-note">Free for 30 days{afterTrial} · No card needed · <a href={GITHUB} target="_blank" rel="noreferrer">Open source</a></span>
      {!android && <IosWaitlist />}
    </section>
    <LandingFooter />
  </div></SampleScope></LandingMotion>
}
