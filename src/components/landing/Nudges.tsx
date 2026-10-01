'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Check, Pause, Play } from 'lucide-react'
import { BirdMark } from '../BirdMark'
import { CheckIcon } from './mobile/kit'

/**
 * The landing page's "Aviary learns your spending" demos. Every amount, date and
 * habit here is sample data shaped like Mobile's real nudge (habitNudges.ts):
 * same title, body and action labels, fired 15 minutes after the usual time.
 */

const HABITS = ['4pm chai', 'Friday cab home', 'Sunday groceries', 'morning metro']

/** True while at least `ratio` of the element is in view, so off-screen demos stop ticking. */
function useOnScreen<E extends HTMLElement>(ratio: number) {
  const ref = useRef<E>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= ratio), { threshold: [0, ratio] })
    io.observe(el)
    return () => io.disconnect()
  }, [ratio])
  return { ref, visible }
}

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

// 0 lock screen · 1 nudge lands · 2 thumb on "Log" · 3 logged
const STEP_MS = [1400, 2600, 700, 3800]
const LEFT_BEFORE = 240

/** Runs the hero loop while a quarter of it is on screen and it isn't paused. */
function useLoop(paused: boolean) {
  const { ref, visible } = useOnScreen<HTMLDivElement>(0.25)
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (paused || !visible) return
    const id = setTimeout(() => setStep((s) => (s + 1) % STEP_MS.length), STEP_MS[step])
    return () => clearTimeout(id)
  }, [step, paused, visible])
  return { ref, step }
}

export function HeroStage() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const { ref, step: loopStep } = useLoop(paused || !!reduced)
  // Reduced motion holds the finished state: the nudge, answered.
  const step = reduced ? 3 : loopStep
  const logged = step === 3
  return <div className="lp-stage" ref={ref} data-step={step}>
    <p className="lp-sr-only">Sample: Aviary saw chai logged around 4pm on three Tuesdays. The next Tuesday at 4:15pm it sends a notification, “Chai time? Log it while it’s fresh.” One tap on “Log ₹20” logs it, and the Snacks envelope drops from ₹240 to ₹220 left.</p>

    <div className="lp-stage-card lp-stage-noticed" aria-hidden="true">
      <span className="lp-stage-label">It noticed</span>
      <ul>
        {['Tue, 15 Sep · 4:02pm', 'Tue, 22 Sep · 4:11pm', 'Tue, 29 Sep · 3:56pm'].map((when) => <li key={when}>
          <span>Chai</span><span>{when}</span><strong>₹20</strong>
        </li>)}
      </ul>
      <div className="lp-stage-habit"><BirdMark size={18} />Chai on Tuesdays, around 4pm</div>
    </div>

    <div className="lp-lock" aria-hidden="true">
      <div className="lp-lock-screen">
        <div className="lp-lock-island" />
        <div className="lp-lock-time">4:15</div>
        <div className="lp-lock-date">Tuesday, 6 October</div>
        <div className="lp-notif">
          <div className="lp-notif-app"><span className="lp-notif-icon"><BirdMark size={14} /></span>Aviary · now</div>
          {logged
            ? <div className="lp-notif-body" key="done"><strong><Check size={15} strokeWidth={3} /> Logged ₹20</strong><span>Chai is in. Nice one.</span></div>
            : <div className="lp-notif-body" key="ask"><strong>Chai time?</strong><span>Log it while it’s fresh. We filled in the usual.</span></div>}
          {!logged && <div className="lp-notif-actions"><span className="lp-notif-log">Log ₹20</span><span>Not this one</span></div>}
          <span className="lp-thumb" />
        </div>
      </div>
    </div>

    <div className="lp-stage-card lp-stage-logged" aria-hidden="true">
      <span className="lp-stage-label">It’s logged</span>
      <div className="lp-envelope-line"><span>🍪 Snacks</span><strong>{`₹${logged ? LEFT_BEFORE - 20 : LEFT_BEFORE}`}<small> left of ₹600</small></strong></div>
      <div className="lp-envelope-bar"><i style={{ transform: `scaleX(${(600 - (logged ? LEFT_BEFORE - 20 : LEFT_BEFORE)) / 600})` }} /></div>
      <div className="lp-today">Today</div>
      <div className="lp-today-row is-new"><span>Chai</span><span>UPI · 4:15pm</span><strong>₹20</strong></div>
      <div className="lp-today-row"><span>Metro card</span><span>UPI · 9:02am</span><strong>₹100</strong></div>
      <p className="lp-stage-note">No app opened. No form filled.</p>
    </div>

    {!reduced && <button type="button" className="lp-stage-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play the demo' : 'Pause the demo'}>
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </button>}
    <span className="lp-stage-sample">Sample data</span>
  </div>
}

/** The app's one success moment (Mobile's CheckIcon pattern): check draws on, mint fill, buzz, chime, label swaps, then it resets. */
export function TickButton() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(false), 1100)
    return () => clearTimeout(id)
  }, [done])
  return <button type="button" className={`lp-tick${done ? ' is-done' : ''}`} onClick={() => {
    if (done) return
    setDone(true)
    navigator.vibrate?.(15)
    new Audio('/landing/success.m4a').play().catch(() => {})
  }}>
    <span aria-live="polite">{done ? <><span aria-hidden="true"><CheckIcon color="currentColor" size={20} /></span>Logged</> : 'Log ₹20'}</span>
  </button>
}
