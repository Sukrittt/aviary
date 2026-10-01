'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Check, Pause, Play, RotateCcw } from 'lucide-react'
import { BirdMark } from '../BirdMark'
import { InsightsScreen } from './mobile/Insights'
import { CATEGORIES, DAYS_LEFT } from './mobile/demo'
import { PHONE, PhoneScreenContext } from './mobile/kit'
import { useOnScreen } from './useOnScreen'

/**
 * The landing page's demos. Every amount, date and name here is sample data
 * shaped like the real app: the nudge copy matches Mobile's habitNudges.ts,
 * the notification copy matches the guided tour's samples, and each scene only
 * shows what that feature actually does.
 */

const HABITS = ['4pm chai', 'Friday cab home', 'Sunday groceries', 'morning metro']

/** The hero's rotating habit. Screen readers get the first one as plain text. */
export function RotatingHabit() {
  const reduced = useReducedMotion()
  const { ref, visible } = useOnScreen<HTMLSpanElement>(0)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reduced || !visible) return
    const id = setInterval(() => setI((n) => (n + 1) % HABITS.length), 2600)
    return () => clearInterval(id)
  }, [reduced, visible])
  return <span className="lp-rotor" ref={ref}>
    <span className="lp-sr-only">{HABITS[0]}</span>
    <span className="lp-rotor-word" key={i} aria-hidden="true">{HABITS[i]}</span>
  </span>
}

// ─── Hero: a chaptered film of the app at work ────────────────────────────────

type ChapterId = 'learns' | 'scan' | 'ask' | 'insights' | 'bills' | 'invest'
const CHAPTERS: { id: ChapterId; label: string; ms: number; sr: string }[] = [
  { id: 'learns', label: 'Learns your habits', ms: 9000, sr: 'Aviary saw chai logged around 4pm on three Tuesdays. The next Tuesday at 4:15pm it asks “Chai time?”, one tap on “Log ₹20” logs it, and Snacks drops to ₹220 left.' },
  { id: 'scan', label: 'Scan a bill', ms: 8000, sr: 'A grocery bill is scanned. Aviary reads five lines, splits the ₹620 bill between two people, and logs your ₹310 share to Groceries.' },
  { id: 'ask', label: 'Ask Aviary', ms: 8500, sr: 'You ask “Can I afford dinner out this week?” and Aviary answers from your envelopes: Eating out has ₹1,800 left with 9 days to go.' },
  { id: 'insights', label: 'Insights', ms: 7500, sr: 'Insights breaks the month down by category, compared with what you usually spend.' },
  { id: 'bills', label: 'Bills & subscriptions', ms: 7500, sr: 'Subscriptions total ₹2,142 a month. Aviary warns that Netflix renews in 3 days, on 9 October, and recurring bills like rent log themselves.' },
  { id: 'invest', label: 'Investments', ms: 7500, sr: 'Investments track your holdings and net worth over time, with contributions logged as you make them.' },
]
// Learns' beats: lock screen, nudge lands, thumb on "Log", logged.
const LEARN_BEATS = [0, 1300, 3900, 4600]

export function HeroStage() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const { ref, visible } = useOnScreen<HTMLDivElement>(0.25)
  const [chapter, setChapter] = useState(0)
  const [beat, setBeat] = useState(0)
  const bar = useRef<HTMLSpanElement | null>(null)
  const elapsed = useRef(0)
  const playing = visible && !paused && !reduced

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      elapsed.current += now - last
      last = now
      const { id, ms } = CHAPTERS[chapter]
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, elapsed.current / ms)})`
      if (id === 'learns') {
        const b = LEARN_BEATS.filter((t) => elapsed.current >= t).length - 1
        setBeat((cur) => (cur === b ? cur : b))
      }
      if (elapsed.current >= ms) {
        elapsed.current = 0
        setBeat(0)
        setChapter((c) => (c + 1) % CHAPTERS.length)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, chapter])

  const jump = (i: number) => {
    elapsed.current = 0
    setBeat(0)
    setChapter(i)
  }
  const current = CHAPTERS[chapter]
  // Reduced motion holds each scene's finished state.
  const learnBeat = reduced ? 3 : beat

  return <div className="lp-stage-shell">
    <div className="lp-stage" ref={ref} data-chapter={current.id} data-step={learnBeat} data-paused={!playing || undefined}>
      <p className="lp-sr-only" aria-live="polite">{current.label}. Sample: {current.sr}</p>
      <Scene id={current.id} beat={learnBeat} key={current.id} />
      {!reduced && <button type="button" className="lp-stage-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the demo' : 'Pause the demo'}>
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>}
      <span className="lp-stage-sample">Sample data</span>
    </div>
    <div className="lp-chapters" role="group" aria-label="What Aviary does">
      {CHAPTERS.map((c, i) => <button key={c.id} type="button" aria-pressed={i === chapter} className={`lp-chapter${i === chapter ? ' is-on' : ''}`} onClick={() => jump(i)}>
        {c.label}
        <span className="lp-chapter-bar" aria-hidden="true"><span key={i === chapter ? `on${chapter}` : 'off'} ref={i === chapter ? bar : undefined} style={{ transform: i === chapter && reduced ? 'scaleX(1)' : 'scaleX(0)' }} /></span>
      </button>)}
    </div>
  </div>
}

function Scene({ id, beat }: { id: ChapterId; beat: number }) {
  switch (id) {
    case 'learns': return <LearnsScene beat={beat} />
    case 'scan': return <ScanScene />
    case 'ask': return <AskScene />
    case 'insights': return <InsightsScene />
    case 'bills': return <BillsScene />
    case 'invest': return <InvestScene />
  }
}

function Card({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`lp-stage-card ${className}`} aria-hidden="true"><span className="lp-stage-label">{label}</span>{children}</div>
}

function Rows({ rows }: { rows: [string, string, string][] }) {
  return <ul className="lp-card-rows">{rows.map(([a, b, c]) => <li key={a + b}><span>{a}</span><span>{b}</span><strong>{c}</strong></li>)}</ul>
}

/** The app's screen at its real size (360×740), shrunk into the hero phone. */
function Phone({ children, lock = false }: { children: ReactNode; lock?: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return <div className="lp-lock" aria-hidden="true">
    <div className={lock ? 'lp-lock-screen' : 'lp-lock-screen lp-app-screen'}>
      <div className="lp-lock-island" />
      {lock ? children : <div className="lp-app" ref={setHost} style={{ width: PHONE.width, height: PHONE.height }} inert>
        <PhoneScreenContext.Provider value={host}>{children}</PhoneScreenContext.Provider>
      </div>}
    </div>
  </div>
}

function LearnsScene({ beat }: { beat: number }) {
  const logged = beat === 3
  const left = logged ? 220 : 240
  return <>
    <Card label="It noticed" className="lp-stage-noticed">
      <Rows rows={[['Chai', 'Tue, 15 Sep · 4:02pm', '₹20'], ['Chai', 'Tue, 22 Sep · 4:11pm', '₹20'], ['Chai', 'Tue, 29 Sep · 3:56pm', '₹20']]} />
      <div className="lp-stage-habit"><BirdMark size={18} perched />Chai on Tuesdays, around 4pm</div>
    </Card>
    <Phone lock>
      <div className="lp-lock-time">4:15</div>
      <div className="lp-lock-date">Tuesday, 6 October</div>
      <div className="lp-notif">
        <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={14} perched /></span>Aviary · now</div>
        {logged
          ? <div className="lp-notif-body" key="done"><strong><Check size={15} strokeWidth={3} /> Logged ₹20</strong><span>Chai is in. Nice one.</span></div>
          : <div className="lp-notif-body" key="ask"><strong>Chai time?</strong><span>Log it while it’s fresh. We filled in the usual.</span></div>}
        {!logged && <div className="lp-notif-actions"><span className="lp-notif-log">Log ₹20</span><span>Not this one</span></div>}
        <span className="lp-thumb" />
      </div>
    </Phone>
    <Card label="It’s logged" className="lp-stage-logged">
      <div className="lp-envelope-line"><span>🍪 Snacks</span><strong>{`₹${left}`}<small> left of ₹600</small></strong></div>
      <div className="lp-envelope-bar"><i style={{ transform: `scaleX(${(600 - left) / 600})` }} /></div>
      <div className="lp-today">Today</div>
      <div className="lp-today-row is-new"><span>Chai</span><span>UPI · 4:15pm</span><strong>₹20</strong></div>
      <div className="lp-today-row"><span>Metro card</span><span>UPI · 9:02am</span><strong>₹100</strong></div>
      <p className="lp-stage-note">No app opened. No form filled.</p>
    </Card>
  </>
}

const BILL: [string, string][] = [['Milk 2L', '₹120'], ['Sourdough', '₹145'], ['Eggs ×12', '₹90'], ['Coffee beans', '₹240'], ['Delivery fee', '₹25']]

function ScanScene() {
  return <>
    <Card label="Snap the bill" className="lp-reveal">
      <p className="lp-card-copy">Point your camera at a receipt. Aviary reads every line, fees included.</p>
      <Rows rows={BILL.slice(0, 3).map(([a, b]) => [a, 'Read from the bill', b])} />
    </Card>
    <Phone>
      <div className="lp-app-head">Scan a bill</div>
      <div className="lp-receipt">
        <b>FRESHMART</b><span>06 Oct · 6:42pm</span>
        {BILL.map(([a, b]) => <div key={a}><span>{a}</span><span>{b}</span></div>)}
        <div className="lp-receipt-total"><span>TOTAL</span><span>₹620</span></div>
        <i className="lp-scan-beam" />
      </div>
      <div className="lp-app-sheet lp-scan-sheet">
        <span className="lp-app-muted">5 items · scanned just now</span>
        <div className="lp-app-split"><span>Split with</span><b>2 people</b></div>
        <div className="lp-app-split"><span>Your share</span><b>₹310</b></div>
        <div className="lp-app-cta">Log ₹310 to 🍅 Groceries</div>
      </div>
    </Phone>
    <Card label="Split it fair" className="lp-reveal lp-reveal-late">
      <div className="lp-envelope-line"><span>Bill</span><strong>₹620</strong></div>
      <div className="lp-envelope-line"><span>Shared with</span><strong>2 people</strong></div>
      <div className="lp-split-share"><span>Your share, logged</span><strong>₹310</strong><small>to 🍅 Groceries</small></div>
    </Card>
  </>
}

const ANSWER = 'Yes. Eating out has ₹1,800 left with 9 days to go. You usually spend about ₹600 a week there, so dinner fits.'

function AskScene() {
  return <>
    <Card label="Ask in plain words" className="lp-reveal">
      <div className="lp-ask-chips"><span>Where did my money go?</span><span>What’s left for food?</span><span>Am I on track this month?</span></div>
    </Card>
    <Phone>
      <div className="lp-app-head"><span className="lp-app-bird"><BirdMark size={18} perched /></span>Ask Aviary</div>
      <div className="lp-chat">
        <div className="lp-bubble lp-bubble--me">Can I afford dinner out this week?</div>
        <div className="lp-chat-thinking"><BirdMark size={26} perched /></div>
        <div className="lp-bubble lp-bubble--bird">{ANSWER.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${2.4 + i * 0.07}s` }}>{w} </span>)}</div>
      </div>
      <div className="lp-app-input">Ask about your money…</div>
    </Phone>
    <Card label="It reads your budget" className="lp-reveal lp-reveal-late">
      <div className="lp-envelope-line"><span>🍝 Eating out</span><strong>₹1,800<small> left</small></strong></div>
      <div className="lp-envelope-bar"><i style={{ transform: 'scaleX(.4)' }} /></div>
      <p className="lp-stage-note">Answers come from your own envelopes and spending.</p>
    </Card>
  </>
}

// The side cards read the same sample month the Insights screen draws.
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const SPENT = CATEGORIES.reduce((s, c) => s + c.spent, 0)
const LEFT = CATEGORIES.reduce((s, c) => s + Math.max(0, c.assigned - c.spent), 0)
const HOT = CATEGORIES.reduce((a, c) => ((c.deltaPct ?? -Infinity) > (a.deltaPct ?? -Infinity) ? c : a))
const SLACK = CATEGORIES.filter((c) => c.spent === 0).sort((a, b) => b.assigned - a.assigned)[0]
const nameOf = (n: string) => n.slice(n.indexOf(' ') + 1)

function InsightsScene() {
  return <>
    <Card label="Heads up on this month" className="lp-reveal">
      <p className="lp-card-copy lp-card-copy--strong">{nameOf(HOT.name)} is running {HOT.deltaPct}% above your usual. {nameOf(SLACK.name)} still has {inr(SLACK.assigned)} untouched.</p>
    </Card>
    <Phone>
      <InsightsScreen categories={CATEGORIES} onBack={() => {}} notice={() => {}} />
    </Phone>
    <Card label="Your spending update" className="lp-reveal lp-reveal-late">
      <p className="lp-card-copy lp-card-copy--strong">{inr(SPENT)} spent this month · {inr(LEFT)} left · {DAYS_LEFT} days to go.</p>
      <p className="lp-stage-note">Normal or not, where it went, and a daily heatmap.</p>
    </Card>
  </>
}

const SUBS: [string, string, string][] = [['Netflix', 'Renews 9 Oct', '₹649'], ['Spotify', 'Added today', '₹119'], ['Gym', 'Renews 12 Oct', '₹1,299'], ['iCloud', 'Renews 18 Oct', '₹75']]

function BillsScene() {
  return <>
    <Card label="Never surprised by a renewal" className="lp-reveal">
      <p className="lp-card-copy">Every subscription with its next due date, and a heads-up before it charges.</p>
    </Card>
    <Phone>
      <div className="lp-app-banner"><b>Netflix renews soon</b><span>₹649 due in 3 days (Oct 9).</span></div>
      <div className="lp-app-head">Subscriptions</div>
      <div className="lp-app-total"><b>₹2,142</b><span>a month</span></div>
      <ul className="lp-app-list">{SUBS.map(([a, b, c], i) => <li key={a} style={{ animationDelay: `${0.25 + i * 0.12}s` }}><span><b>{a}</b><small>{b}</small></span><strong>{c}</strong></li>)}</ul>
    </Phone>
    <Card label="Recurring logs itself" className="lp-reveal lp-reveal-late">
      <Rows rows={[['Rent', 'Logs on the 1st', '₹18,000'], ['Spotify charged', '₹119 auto-added', '₹119']]} />
    </Card>
  </>
}

const HOLDINGS: [string, string, string][] = [['Index fund', '+8.2%', '₹2,10,000'], ['Fixed deposit', '7.1% a year', '₹1,00,000'], ['Gold', '+3.4%', '₹62,000'], ['Stocks', '−1.1%', '₹40,800']]

function InvestScene() {
  return <>
    <Card label="Contributions, logged" className="lp-reveal">
      <Rows rows={[['Index fund', 'Added 4 Oct', '+₹25,000'], ['Gold', 'Added 4 Oct', '+₹5,000']]} />
    </Card>
    <Phone>
      <div className="lp-app-head">Investments</div>
      <div className="lp-app-total"><span>Net worth</span><b>₹4,12,800</b><small>+₹30,000 this month</small></div>
      <svg className="lp-app-chart" viewBox="0 0 320 120" preserveAspectRatio="none"><path d="M0 104 C 30 98, 50 100, 80 86 S 130 80, 160 66 S 210 58, 240 40 S 290 24, 320 14" /></svg>
      <ul className="lp-app-list">{HOLDINGS.map(([a, b, c], i) => <li key={a} style={{ animationDelay: `${0.9 + i * 0.12}s` }}><span><b>{a}</b><small>{b}</small></span><strong>{c}</strong></li>)}</ul>
    </Phone>
    <Card label="Net worth over time" className="lp-reveal lp-reveal-late">
      <p className="lp-card-copy lp-card-copy--strong">Holdings, market updates and every contribution in one place, next to your budget.</p>
    </Card>
  </>
}

// ─── Noticing is the point: the bank way vs the Aviary way ────────────────────

const STATEMENT: [string, string, string][] = [
  ['06 Oct', 'UPI/DR/6021843/SWIGGY/YESB/swiggy@ybl', '349.00'],
  ['06 Oct', 'POS 4419XXXXXXXX2231 ZEPTO MUMBAI', '612.00'],
  ['06 Oct', 'UPI/DR/6021977/PAYTM/PYTM/paytmqr28', '20.00'],
  ['05 Oct', 'NACH DR ACH-91X8820 CULTFIT', '1,299.00'],
  ['05 Oct', 'IMPS/P2A/88123/XXXXXX4410/JAKE', '500.00'],
  ['05 Oct', 'UPI/DR/6019022/BLINKIT/ICIC/blinkit', '486.00'],
  ['04 Oct', 'ATM WDL 0442 HSR LAYOUT BLR', '2,000.00'],
  ['04 Oct', 'UPI/DR/6017718/UBER/HDFC/uber.rides', '231.00'],
  ['04 Oct', 'POS 4419XXXXXXXX2231 SHELL FUEL', '1,800.00'],
  ['03 Oct', 'UPI/DR/6016004/PAYTM/PYTM/paytmqr91', '40.00'],
  ['03 Oct', 'NETFLIX.COM SI 0310 AUTOPAY', '649.00'],
  ['03 Oct', 'UPI/DR/6015530/SWIGGY/YESB/swiggy@ybl', '412.00'],
  ['02 Oct', 'IMPS/P2A/87990/XXXXXX9012/EMMA', '1,200.00'],
  ['02 Oct', 'UPI/DR/6014471/AMAZON/AXIS/amazon', '1,149.00'],
]
const STEPS = ['Noticed it’s Tuesday, 4:15pm, like the last three', 'Filled in Chai · Snacks · ₹20 · UPI', 'Logged with one tap on the notification', 'Snacks has ₹220 left this month']
const LOG: [string, string, string][] = [
  ['Chai', 'Snacks', '₹20'],
  ['Dinner with Emma', 'Eating out', '₹349'],
  ['Groceries for the week', 'Food', '₹612'],
  ['Gym', 'Health', '₹1,299'],
  ['Paid Jake back', 'Friends', '₹500'],
]
const STEP_MS = 750

export function NoticeSplit() {
  const reduced = useReducedMotion()
  const { ref, visible } = useOnScreen<HTMLDivElement>(0.4)
  const [take, setTake] = useState(0)
  const [step, setStep] = useState(0)
  const [started, setStarted] = useState(false)
  if (visible && !started) setStarted(true)
  const done = reduced ? STEPS.length + 1 : step

  useEffect(() => {
    if (!started || reduced || step > STEPS.length) return
    const id = setTimeout(() => setStep((s) => s + 1), step === 0 ? 500 : STEP_MS)
    return () => clearTimeout(id)
  }, [started, reduced, step, take])

  return <div className="lp-split2" ref={ref}>
    <div className="lp-split2-without" aria-label="Without Aviary: a bank statement">
      <div className="lp-statement" aria-hidden="true">
        <div className="lp-statement-head"><span>Date</span><span>Narration</span><span>Debit</span></div>
        {STATEMENT.map(([d, n, a]) => <div key={n}><span>{d}</span><span>{n}</span><span>{a}</span></div>)}
      </div>
    </div>
    <span className="lp-split2-pill" aria-hidden="true">Without Aviary <span>→</span> With Aviary</span>
    <div className="lp-split2-with">
      <p className="lp-split2-quote">“Chai time? Log it while it’s fresh.”</p>
      <div className="lp-split2-who"><span className="lp-split2-avatar"><BirdMark size={26} perched /></span>{done > STEPS.length ? 'Aviary is done' : 'Aviary is on it'}</div>
      <ol className="lp-split2-steps">
        {STEPS.map((s, i) => <li key={s} className={done > i + 1 ? 'is-done' : done === i + 1 ? 'is-busy' : ''}>
          <span className="lp-split2-icon">{done > i + 1 ? <Check size={13} strokeWidth={3.2} /> : null}</span>{s}
        </li>)}
      </ol>
      <div className={`lp-split2-result${done > STEPS.length ? ' is-in' : ''}`}>
        <span className="lp-stage-label">Today in Aviary</span>
        <ul>{LOG.map(([what, env, amt], i) => <li key={what} className={i === 0 ? 'is-new' : ''}><span>{what}<small>{env}</small></span><strong>{amt}</strong></li>)}</ul>
      </div>
      {!reduced && <button type="button" className="lp-replay" onClick={() => { setStep(0); setTake((t) => t + 1) }}><RotateCcw size={15} aria-hidden="true" />Replay</button>}
    </div>
  </div>
}

// ─── Every log is a little win ────────────────────────────────────────────────

/** The Added moment from the app: tick, then the envelope bar ticks down to what's left. */
export function LeftCard() {
  const { ref, visible } = useOnScreen<HTMLDivElement>(0.5)
  const [seen, setSeen] = useState(false)
  if (visible && !seen) setSeen(true)
  return <div className={`lp-left-demo${seen ? ' is-in' : ''}`} ref={ref} aria-hidden="true">
    <div className="lp-left-added"><span className="lp-left-tick"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span><b>Added ₹20</b><small>Chai</small></div>
    <div className="lp-envelope-line"><span>🍪 Snacks</span><strong>₹220<small> left of ₹600</small></strong></div>
    <div className="lp-left-bar"><i /><em /></div>
    <span className="lp-win-meta">About ₹11 a day for the next 20 days</span>
  </div>
}

// September 2026 starts on a Tuesday; the 8th through the 30th is the streak.
const MISSED = new Set([3, 6, 7])

export function StreakCard() {
  const { ref, visible } = useOnScreen<HTMLDivElement>(0.5)
  const [seen, setSeen] = useState(false)
  if (visible && !seen) setSeen(true)
  return <div className={`lp-wrapped${seen ? ' is-in' : ''}`} ref={ref} aria-hidden="true">
    <span className="lp-wrapped-month">September · Expense Wrapped</span>
    <div className="lp-wrapped-cal">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <b key={i}>{d}</b>)}
      <i className="is-blank" />
      {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => <i key={d} className={MISSED.has(d) ? 'is-missed' : d >= 8 ? 'is-streak' : 'is-logged'} style={{ animationDelay: `${0.2 + d * 0.03}s` }} />)}
    </div>
    <div className="lp-wrapped-stat"><strong>23</strong><span>days in a row<br />Longest logging streak</span></div>
  </div>
}
