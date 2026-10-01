'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import { animate, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, House, Pause, Play, RotateCcw, Sprout, Utensils, Undo2, Ticket } from 'lucide-react'
import { initialLesson, JOBS, lessonReducer, remaining, unassigned, type Job } from './lessonState'
import { AmountText } from './mobile/kit'
import { BIRD_PATH } from '../BirdMark'

const icons = { rent: House, food: Utensils, savings: Sprout, fun: Ticket }
const inheritStyle = { fontFamily: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit' } as const
function LessonAmount({ n, size }: { n: number; size: number }) {
  const { formatMoney } = useCurrency()

  return <AmountText value={n} rawText={formatMoney(n)} size={size} weight="displayMedium" color="inherit" animate style={inheritStyle} />
}

/** Point and heading on the quadratic flight curve from `s` (offset from the landing spot) through `c` to 0,0. */
export function flightAt(t: number, s: [number, number], c: [number, number]) {
  const u = 1 - t
  return {
    x: u * u * s[0] + 2 * u * t * c[0],
    y: u * u * s[1] + 2 * u * t * c[1],
    vx: 2 * u * (c[0] - s[0]) - 2 * t * c[0],
    vy: 2 * u * (c[1] - s[1]) - 2 * t * c[1],
  }
}

/** An Aviary bird in its envelope's colour, holding a coin. When it mounts somewhere new it flies there from `from` (its last spot). */
function BirdWorker({ job, assigned, pecking, reduced, from }: { job: Job; assigned: boolean; pecking?: boolean; reduced: boolean; from: Map<Job, DOMRect> }) {
  const { currencySymbol } = useCurrency()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    // Not consumed: StrictMode re-runs this effect, and every dispatch re-snapshots all birds anyway.
    const start = from.get(job)
    if (!el || !start || reduced) return
    const end = el.getBoundingClientRect()
    const s: [number, number] = [start.left - end.left, start.top - end.top]
    const dist = Math.hypot(s[0], s[1])
    if (dist < 4) return
    // Take off upward, then glide down onto the perch. Facing left while flying left, turning back just before touchdown.
    const c: [number, number] = [s[0] * 0.45, Math.min(s[1], 0) - 70 - dist * 0.05]
    const flip = s[0] > 0 ? -1 : 1
    const place = (t: number) => {
      const p = flightAt(t, s, c)
      const bob = Math.sin(t * Math.PI * 7) * 3 * (1 - t)
      const tilt = Math.max(-35, Math.min(35, (Math.atan2(p.vy, Math.abs(p.vx)) * 180) / Math.PI * 0.6))
      const sx = flip < 0 && t > 0.86 ? -1 + ((t - 0.86) / 0.14) * 2 : flip
      el.style.transform = `translate(${p.x}px, ${p.y + bob}px) scaleX(${sx}) rotate(${tilt * (1 - Math.max(0, t - 0.8) * 5)}deg)`
    }
    el.dataset.flight = 'flying'
    place(0)
    const flight = animate(0, 1, {
      duration: Math.min(1.25, 0.6 + dist / 1500),
      ease: [0.4, 0.05, 0.3, 1],
      onUpdate: place,
      onComplete: () => { el.style.transform = ''; el.dataset.flight = 'landing' },
    })
    return () => { flight.stop(); el.style.transform = ''; delete el.dataset.flight }
  }, [from, job, reduced])

  return <div ref={ref} data-bird={job} className={`money-bird${assigned ? ' is-working' : ''}${pecking ? ' is-pecking' : ''}`} aria-hidden="true">
    <span className="money-bird-body"><svg viewBox="70 104 352 296">
      <g className="money-bird-legs"><rect x="224" y="340" width="17" height="46" rx="8.5" /><rect x="259" y="340" width="17" height="46" rx="8.5" /></g>
      <path fillRule="evenodd" d={BIRD_PATH} />
      <path className="money-bird-wing" d="M 256 236 C 214 176 156 138 104 132 C 128 186 184 232 256 256 Z" />
    </svg></span>
    <span className="money-coin">{currencySymbol}</span>
  </div>
}

export function MoneyLesson() {
  const { currencyText, formatMoney, currencySymbol } = useCurrency()

  const [state, commit] = useReducer(lessonReducer, undefined, initialLesson)
  const root = useRef<HTMLElement>(null)
  const [from] = useState(() => new Map<Job, DOMRect>())
  /** Remember where every bird sits before the state changes, so any bird that moves can fly from there. */
  const dispatch = useCallback((action: Parameters<typeof lessonReducer>[1]) => {
    root.current?.querySelectorAll<HTMLElement>('[data-bird]').forEach((el) => from.set(el.dataset.bird as Job, el.getBoundingClientRect()))
    commit(action)
  }, [from])
  const [playing, setPlaying] = useState(false)
  const reduced = !!useReducedMotion()
  const id = useId()
  const waiting = unassigned(state)
  const stage = waiting > 0 ? 0 : state.spent === 0 ? 1 : state.transferred ? 3 : 2
  const titles = ['Your money is ready. Give it a job.', 'All assigned. All still yours.', 'A little more for food?', 'New plan. Same money.']
  const explanations = [
    'Tap each envelope to send some money to work. These are sample amounts, not a suggested budget.',
    currencyText('₹0 unassigned means all your money has a purpose. You still have ₹1,000. Now try buying lunch.'),
    currencyText('Lunch came from Food. Rent and Savings stayed untouched. Move ₹50 from Fun to Food to adjust your plan.'),
    currencyText('Food has ₹250 available. Fun has ₹50. Your ₹200 in Savings is still doing its job: being there for later.'),
  ]

  useEffect(() => {
    if (!playing || stage === 3) return
    const timer = window.setTimeout(() => {
      const next = JOBS.find((j) => !state.assigned.includes(j.id))
      if (next) dispatch({ type: 'assign', category: next.id })
      else dispatch({ type: stage === 1 ? 'spend' : 'transfer' })
    }, stage === 0 ? 1800 : 4800)
    return () => window.clearTimeout(timer)
  }, [dispatch, playing, stage, state.assigned])

  const act = (action: Parameters<typeof lessonReducer>[1]) => { setPlaying(false); dispatch(action) }
  const show = () => {
    if (stage === 3) dispatch({ type: 'reset' })
    setPlaying((p) => stage === 3 || !p)
  }

  return <section ref={root} className="money-lesson" id="learn" aria-labelledby={`${id}-title`}>
    <div className="money-lesson-top"><button className="money-text-button" type="button" onClick={show}>{playing && stage !== 3 ? <Pause size={15} /> : <Play size={15} />}{playing && stage !== 3 ? 'Pause' : stage === 3 ? 'Replay' : 'Show me'}</button></div>
    <div className="money-stage-copy"><h2 id={`${id}-title`}>{titles[stage]}</h2><p>{explanations[stage]} <span className="money-sample-disclosure">A budgeting example using sample money.</span></p></div>
    <LayoutGroup id={id}>
      <div className={`money-waiting${waiting === 0 ? ' is-assigned' : ''}`}>
        <div><span>{waiting ? 'Waiting for a job' : 'Unassigned'}</span><strong><LessonAmount n={waiting} size={28} /></strong></div>
        <div className="money-waiting-workers" aria-hidden="true">
          <motion.span className="money-waiting-perch" layout={!reduced} initial={false} animate={{ opacity: waiting ? 1 : 0 }} transition={{ layout: { type: 'spring', stiffness: 260, damping: 26 }, opacity: { duration: 0.3 } }} />
          {JOBS.filter((j) => !state.assigned.includes(j.id)).map((j) => <motion.div layout={!reduced} transition={{ type: 'spring', stiffness: 260, damping: 26 }} key={j.id} style={{ '--job-color': j.color } as CSSProperties}><BirdWorker job={j.id} assigned={false} reduced={reduced} from={from} /></motion.div>)}
          {waiting === 0 && <span className="money-assigned-note"><Check size={20} /> Everyone has a purpose</span>}
        </div>
      </div>
      <div className="money-envelopes">
        {JOBS.map((job) => {
          const Icon = icons[job.id]
          const assigned = state.assigned.includes(job.id)
          return <button key={job.id} type="button" className={`money-envelope${assigned ? ' is-assigned' : ''}`} style={{ '--job-color': job.color } as CSSProperties} aria-label={assigned ? `${job.label}: ${formatMoney(state.balances[job.id])} available, assigned` : `Assign ${formatMoney(job.amount)} to ${job.label}`} aria-disabled={assigned} onClick={() => { if (!assigned) act({ type: 'assign', category: job.id }) }}>
            <span className="money-envelope-heading"><Icon size={19} aria-hidden="true" />{job.label}</span>
            <span className="money-envelope-scene" aria-hidden="true">{assigned ? <>
              <BirdWorker job={job.id} assigned pecking={job.id === 'food' && stage === 2} reduced={reduced} from={from} />
              <span className="money-perch" /><span className="money-motes"><i /><i /><i /></span>
              {job.id === 'food' && state.spent > 0 && <span className="money-coin money-coin-drop">{currencySymbol}</span>}
              {!reduced && job.id === 'fun' && stage === 2 && <motion.span layoutId="coin-move" className="money-coin money-coin-extra" initial={false} animate={{ opacity: 0 }} transition={{ duration: 0 }}>{currencySymbol}</motion.span>}
              {job.id === 'food' && state.transferred && <motion.span layoutId={reduced ? undefined : 'coin-move'} className="money-coin money-coin-extra" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 20 }}>{currencySymbol}</motion.span>}
            </> : <span className="money-envelope-place">+</span>}</span>
            <strong><LessonAmount n={assigned ? state.balances[job.id] : job.amount} size={26} /></strong>
            <span className="money-envelope-caption">{assigned ? 'Available' : 'Tap to assign'}</span>
            <span className="money-envelope-purpose">{job.purpose}</span>
          </button>
        })}
      </div>
    </LayoutGroup>
    <div className="money-lesson-bottom">
      <dl className="money-totals"><div><dt>Still yours</dt><dd><LessonAmount n={remaining(state)} size={25} /></dd></div><div><dt>Spent</dt><dd><LessonAmount n={state.spent} size={25} /></dd></div></dl>
      {stage === 1 && <button type="button" className="lp-button lp-button--dark" onClick={() => act({ type: 'spend' })}>Buy lunch · {formatMoney(100)} <ArrowRight size={17} /></button>}
      {stage === 2 && <button type="button" className="lp-button lp-button--dark" onClick={() => act({ type: 'transfer' })}>Move {formatMoney(50)} to Food <ArrowRight size={17} /></button>}
      {stage === 3 && <a className="lp-button lp-button--dark" href="#play">Try logging an expense <ArrowRight size={17} /></a>}
      {stage === 0 && <span className="money-small-note">Saving money is a job, too.</span>}
    </div>
    <div className="money-lesson-controls"><span>{['1. Assign', '2. Spend', '3. Adjust'].map((label, i) => <span key={label} aria-current={Math.min(stage, 2) === i ? 'step' : undefined}>{label}</span>)}</span><div><button type="button" className="money-text-button" disabled={!state.history.length} onClick={() => act({ type: 'undo' })}><Undo2 size={15} />Undo</button><button type="button" className="money-text-button" onClick={() => act({ type: 'reset' })}><RotateCcw size={15} />Reset</button></div></div>
    <p className="lp-sr-only" role="status" aria-atomic="true">{formatMoney(waiting)} unassigned. {formatMoney(remaining(state))} still yours. {formatMoney(state.spent)} spent. {JOBS.map((j) => `${j.label}: ${formatMoney(state.balances[j.id])} available.`).join(' ')}</p>
    <noscript><p>Assign {formatMoney(400)} to Rent, {formatMoney(300)} to Food, {formatMoney(200)} to Savings and {formatMoney(100)} to Fun. That leaves {formatMoney(0)} unassigned, but all {formatMoney(1000)} is still yours. Spend {formatMoney(100)} from Food and {formatMoney(900)} remains. Move {formatMoney(50)} from Fun to Food: you still have {formatMoney(900)} with a different plan.</p></noscript>
  </section>
}
