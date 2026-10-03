'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { Check, ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react'
import { BirdMark } from '../BirdMark'
import { useOnScreen } from './useOnScreen'

/**
 * The landing page's demos. Scan, Ask, Insights, Subscriptions and Investments show screen
 * recordings of the app on a demo account (public/landing/clip-*.mp4). The rest
 * is sample data shaped like the real app: the nudge copy matches Mobile's
 * habitNudges.ts, the notification copy matches the guided tour's samples, and
 * each scene only shows what that feature actually does.
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
  { id: 'learns', label: 'Learns your habits', ms: 9000, sr: 'Aviary saw chai logged around 4pm on three Tuesdays. The next Tuesday at 4:15pm it asks “Afternoon chai?”, one tap on “Log ₹20” logs it, and Snacks drops to ₹220 left.' },
  { id: 'scan', label: 'Scan a bill', ms: 14000, sr: 'A ₹1,725.70 Meghana Foods bill is scanned. Aviary reads every line, you mark which items were shared two or three ways, and it logs your ₹672.96 share to Eating out.' },
  { id: 'ask', label: 'Ask Aviary', ms: 13500, sr: 'You ask “Can I afford 90k iPhone?” and Aviary answers from your budget: not yet. You have ₹36,802 left to spend this month, so it suggests a gadget envelope you add to each month.' },
  { id: 'insights', label: 'Insights', ms: 7500, sr: 'Insights shows your spending trend over 12 months and where this month’s money went, by category, compared with what you usually spend.' },
  { id: 'bills', label: 'Bills & subscriptions', ms: 7500, sr: 'Subscriptions total ₹1,883 a month across 9 services. Aviary warns that Netflix renews soon, and recurring bills log themselves: milk every day, ₹15,000 rent next on 5 Oct, ₹50 water next on 9 Oct.' },
  { id: 'invest', label: 'Investments', ms: 12000, sr: 'Investments shows your ₹2,24,600 net worth over time, split across equity, FDs, gold and crypto. You add ₹10,000 to Crypto and net worth climbs to ₹2,34,600.' },
]
// Learns' beats: lock screen, nudge lands, thumb on "Log", logged.
const LEARN_BEATS = [0, 1300, 3900, 4600]

export function HeroStage() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const { ref, visible } = useOnScreen<HTMLDivElement>(0.25)
  const [chapter, setChapter] = useState(0)
  const [beat, setBeat] = useState(0)
  // Bumped on every jump so re-picking the playing chapter restarts its scene (and clip) with the bar.
  const [take, setTake] = useState(0)
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
    setTake((t) => t + 1)
  }
  const current = CHAPTERS[chapter]
  // Reduced motion holds each scene's finished state.
  const learnBeat = reduced ? 3 : beat

  return <div className="lp-stage-shell">
    <div className="lp-stage" ref={ref} data-chapter={current.id} data-step={learnBeat} data-paused={!playing || undefined}>
      <p className="lp-sr-only" aria-live="polite">{current.label}. Sample: {current.sr}</p>
      <Scene id={current.id} beat={learnBeat} playing={playing} key={`${current.id}:${take}`} />
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

function Scene({ id, beat, playing }: { id: ChapterId; beat: number; playing: boolean }) {
  switch (id) {
    case 'learns': return <LearnsScene beat={beat} />
    case 'scan': return <ScanScene playing={playing} />
    case 'ask': return <AskScene playing={playing} />
    case 'insights': return <InsightsScene playing={playing} />
    case 'bills': return <BillsScene />
    case 'invest': return <InvestScene playing={playing} />
  }
}

function Card({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`lp-stage-card ${className}`} aria-hidden="true"><span className="lp-stage-label">{label}</span>{children}</div>
}

function Rows({ rows }: { rows: [string, string, string][] }) {
  return <ul className="lp-card-rows">{rows.map(([a, b, c]) => <li key={a + b}><span>{a}</span><span>{b}</span><strong>{c}</strong></li>)}</ul>
}

/** The hero phone. `lock` is the lock screen; otherwise it holds a recording or screenshot. */
function Phone({ children, lock = false }: { children: ReactNode; lock?: boolean }) {
  return <div className="lp-lock" aria-hidden="true">
    <div className={lock ? 'lp-lock-screen' : 'lp-lock-screen lp-shot-screen'}>
      <div className="lp-lock-island" />
      {children}
    </div>
  </div>
}

/** A screen recording that plays while `playing` and holds its poster (the finished state) when paused or reduced. */
export function Clip({ name, playing, loop = false }: { name: string; playing: boolean; loop?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (playing) v.play()?.catch(() => {})
    else v.pause()
  }, [playing])
  return <video ref={ref} className="lp-clip" src={`/landing/clip-${name}.mp4`} poster={`/landing/poster-${name}.jpg`} muted loop={loop} playsInline preload="metadata" />
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
        <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={14} perched /></span>Aviary<span className="lp-notif-time">• now</span><ChevronUp size={14} strokeWidth={2.4} /></div>
        {logged
          ? <div className="lp-notif-body" key="done"><strong><Check size={15} strokeWidth={3} /> Logged ₹20</strong><span>Chai is in. Nice one.</span></div>
          : <div className="lp-notif-body" key="ask"><strong>Afternoon chai?</strong><span>Time for your Tuesday chai fix? Snap it into the app real quick.</span></div>}
        {!logged && <div className="lp-notif-actions"><span className="lp-notif-log">Log ₹20<span className="lp-thumb" /></span><span>Not this one</span></div>}
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

function ScanScene({ playing }: { playing: boolean }) {
  return <>
    <Card label="Snap the bill" className="lp-reveal">
      <p className="lp-card-copy">Point your camera at a receipt. Aviary reads every line, taxes included.</p>
      <Rows rows={[['Paneer Biryani', 'Split 3 ways', '₹380'], ['Gobi Manchurian', 'Split 2 ways', '₹155'], ['Coke Tin 330 ML', 'Split 2 ways', '₹133']]} />
    </Card>
    <Phone><Clip name="scan" playing={playing} /></Phone>
    <Card label="Split it fair" className="lp-reveal lp-reveal-late">
      <div className="lp-envelope-line"><span>Bill</span><strong>₹1,725.70</strong></div>
      <div className="lp-envelope-line"><span>Shared items</span><strong>2 or 3 ways</strong></div>
      <div className="lp-split-share"><span>Your share, logged</span><strong>₹672.96</strong><small>to Eating out</small></div>
    </Card>
  </>
}

function AskScene({ playing }: { playing: boolean }) {
  return <>
    <Card label="Ask in plain words" className="lp-reveal">
      <div className="lp-ask-chips"><span>What can I cut back on?</span><span>How does this month compare?</span><span>Can I afford 90k iPhone?</span></div>
    </Card>
    <Phone><Clip name="ask" playing={playing} /></Phone>
    <Card label="It reads your budget" className="lp-reveal lp-reveal-late">
      <div className="lp-envelope-line"><span>Left to spend</span><strong>₹36,802<small> this month</small></strong></div>
      <div className="lp-envelope-bar"><i style={{ transform: 'scaleX(.53)' }} /></div>
      <p className="lp-stage-note">Answers come from your own envelopes and spending.</p>
    </Card>
  </>
}

function InsightsScene({ playing }: { playing: boolean }) {
  return <>
    <Card label="Normal or not" className="lp-reveal">
      <p className="lp-card-copy lp-card-copy--strong">Every month next to the last twelve. Tap one to see where it went.</p>
    </Card>
    <Phone><Clip name="insights" playing={playing} /></Phone>
    <Card label="Where it went" className="lp-reveal lp-reveal-late">
      <p className="lp-card-copy lp-card-copy--strong">Each category against what you usually spend.</p>
      <p className="lp-stage-note">Plus a daily heatmap and your subscriptions.</p>
    </Card>
  </>
}

// Rows from the demo account's Recurring screen; dot colours are the envelope groups'.
const RECURRING: [string, string, string, string, string, string][] = [
  ['Milk', 'Every day', 'Groceries', '#d70e3a', 'Due today', '₹24'],
  ['Rent', 'Every month', 'Rent', '#0b7f97', 'Next on 5 Oct', '₹15,000'],
  ['Water', 'Every month', 'Groceries', '#d70e3a', 'Next on 9 Oct', '₹50'],
]

function BillsScene() {
  return <>
    <Card label="Never surprised by a renewal" className="lp-reveal">
      <p className="lp-card-copy">Every subscription with its next due date, and a heads-up before it charges.</p>
    </Card>
    <Phone>
      {/* eslint-disable-next-line @next/next/no-img-element -- fills the phone frame; next/image adds nothing at this size */}
      <img className="lp-clip" src="/landing/subscriptions.png" alt="" />
      {/* An Android heads-up, in the app's real bill-reminder copy (Mobile's tour/content.ts). */}
      <div className="lp-app-banner lp-heads-up">
        <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={13} perched /></span>Aviary<span className="lp-heads-up-time">· now</span><ChevronDown size={14} strokeWidth={2.4} /></div>
        <div className="lp-heads-up-row"><b>Netflix renews soon</b><span>₹199 due in 3 days (Oct 28).</span></div>
      </div>
    </Phone>
    <Card label="Recurring logs itself" className="lp-reveal lp-reveal-late">
      <ul className="lp-recurring">{RECURRING.map(([name, every, env, color, next, amt]) => <li key={name}>
        <i style={{ background: color }} />
        <span><b>{name}</b><small>{every} · {env}</small><em>{next}</em></span>
        <strong>{amt}</strong>
      </li>)}</ul>
    </Card>
  </>
}

function InvestScene({ playing }: { playing: boolean }) {
  return <>
    <Card label="Everything you own" className="lp-reveal">
      <p className="lp-card-copy">Equity, FDs, gold and crypto, with your net worth charted since day one.</p>
      <Rows rows={[['Nifty Index Fund', 'Monthly ₹5,000', '₹1,18,000'], ['HDFC Fixed Deposit', 'Monthly ₹50,000', '₹76,200'], ['Gold ETF', 'Updated 3 Oct', '₹20,400']]} />
    </Card>
    <Phone><Clip name="invest" playing={playing} /></Phone>
    <Card label="Add as you invest" className="lp-reveal lp-reveal-late">
      <div className="lp-envelope-line"><span>Crypto</span><strong>+₹10,000</strong></div>
      <div className="lp-split-share"><span>Net worth</span><strong>₹2,34,600</strong><small>+₹64,600 since 5 May</small></div>
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
// Matches the top row of activity-today.png and the Metro envelope in the log-expense recording.
const STEPS = ['Noticed it’s Friday, 9:15am, like the last three', 'Filled in Bike to office · Metro · ₹150 · UPI', 'Logged with one tap on the notification', 'Metro has ₹960 left this month']
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
      <p className="lp-split2-quote">“Bike to office? Log it while it’s fresh.”</p>
      <div className="lp-split2-who"><span className="lp-split2-avatar"><BirdMark size={26} perched /></span>{done > STEPS.length ? 'Aviary is done' : 'Aviary is on it'}</div>
      <ol className="lp-split2-steps">
        {STEPS.map((s, i) => <li key={s} className={done > i + 1 ? 'is-done' : done === i + 1 ? 'is-busy' : ''}>
          <span className="lp-split2-icon">{done > i + 1 ? <Check size={13} strokeWidth={3.2} /> : null}</span>{s}
        </li>)}
      </ol>
      <div className={`lp-split2-result${done > STEPS.length ? ' is-in' : ''}`}>
        <span className="lp-stage-label">Today in Aviary</span>
        <Image src="/landing/activity-today.png" alt="Today's logs in the app: Bike to office ₹150, Shopping ₹1,500, Trip with friends ₹1,500, Electricity ₹6,000, Groceries ₹5,000, Gym membership ₹1,500." width={720} height={665} sizes="(max-width: 760px) 90vw, 420px" />
      </div>
      {!reduced && <button type="button" className="lp-replay" onClick={() => { setStep(0); setTake((t) => t + 1) }}><RotateCcw size={15} aria-hidden="true" />Replay</button>}
    </div>
  </div>
}
