'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'
import type { WeekRecap } from '@/src/api/weekRecap'
import { BirdMark } from '@/src/components/BirdMark'
import { Confetti } from '@/src/components/onboarding/Confetti'
import { formatDateShort } from '@/src/lib/format'
import { splitEmoji } from '@/src/lib/emoji'
import type { RecapSlide } from './weekRecapSlides'

/**
 * What each recap slide shows besides its copy: `RecapHero` above the title,
 * `RecapDetail` below the body. Web twin of Mobile's
 * src/features/week-recap/RecapVisuals.tsx. Styles are `.week-recap-*` in
 * expense-redesign.css.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type Blob = { size: number; top?: number; left?: number; right?: number; bottom?: number; color: string; ring?: number; radius?: string; motion: 'drift1' | 'drift2' | 'spin'; seconds: number }

function recapBlobs(kind: RecapSlide['kind']): Blob[] {
  const ring = 'rgba(255, 255, 255, 0.16)'
  const fill = 'rgba(255, 255, 255, 0.10)'
  switch (kind) {
    case 'intro':
    case 'light':
      return [
        { size: 380, top: -110, right: -140, color: ring, ring: 26, motion: 'drift1', seconds: 13 },
        { size: 170, bottom: 90, left: -50, color: fill, radius: '40px', motion: 'spin', seconds: 30 },
      ]
    case 'regulars':
      return [
        { size: 340, top: 60, left: -160, color: 'rgba(255, 255, 255, 0.22)', motion: 'drift2', seconds: 12 },
        { size: 130, bottom: 90, right: -20, color: 'rgba(46, 18, 0, 0.12)', radius: '30px', motion: 'spin', seconds: 26 },
      ]
    case 'hour':
      return [{ size: 480, bottom: -220, left: -130, color: ring, ring: 30, motion: 'drift2', seconds: 14 }]
    case 'categories':
      return [
        { size: 420, top: -170, left: -120, color: 'rgba(51, 172, 90, 0.4)', motion: 'drift2', seconds: 12 },
        { size: 150, bottom: 140, right: -40, color: fill, radius: '34px', motion: 'spin', seconds: 28 },
      ]
    case 'biggest':
      return [
        { size: 400, top: -130, right: -140, color: 'rgba(255, 120, 120, 0.3)', motion: 'drift1', seconds: 12 },
        { size: 290, bottom: -100, left: -110, color: ring, ring: 22, motion: 'drift2', seconds: 15 },
      ]
    case 'done':
      return [
        { size: 360, top: 100, left: -150, color: ring, ring: 26, motion: 'drift1', seconds: 13 },
        { size: 220, bottom: -40, right: -60, color: fill, motion: 'drift2', seconds: 11 },
      ]
  }
}

/** Drifting shapes behind each slide, so no slide is a flat colour. */
export function RecapBlobs({ kind }: { kind: RecapSlide['kind'] }) {
  return (
    <div className="week-recap-blobs" aria-hidden="true">
      {recapBlobs(kind).map((b, i) => (
        <span
          key={i}
          className={`week-recap-blob week-recap-blob--${b.motion}`}
          style={{
            width: b.size, height: b.size, top: b.top, left: b.left, right: b.right, bottom: b.bottom,
            borderRadius: b.radius ?? '50%',
            animationDuration: `${b.seconds}s`,
            ...(b.ring ? { border: `${b.ring}px solid ${b.color}` } : { background: b.color }),
          }}
        />
      ))}
    </div>
  )
}

/** Counts from 0 to `target` over `durationMs`, starting after `delayMs`. */
export function useCountUp(target: number, durationMs = 900, delayMs = 150): number {
  const reduceMotion = useReducedMotion()
  const [value, setValue] = useState(reduceMotion ? target : 0)
  useEffect(() => {
    if (reduceMotion) return
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / durationMs)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    const timer = setTimeout(() => (frame = requestAnimationFrame(tick)), delayMs)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [target, durationMs, delayMs, reduceMotion])
  return value
}

function Pop({ delay = 0, children, className, style }: { delay?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div className={className} style={style} initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, type: 'spring', stiffness: 380, damping: 18 }}>
      {children}
    </motion.div>
  )
}

function Rise({ delay = 0, children, className, style }: { delay?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div className={className} style={style} initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  )
}

/** The big title. On the biggest-spend slide the amount counts up. */
export function RecapTitle({ slide, recap, money }: { slide: RecapSlide; recap: WeekRecap; money: (n: number) => string }) {
  const amount = useCountUp(slide.kind === 'biggest' ? (recap.biggest?.amountInr ?? 0) : 0)
  return <h1>{slide.kind === 'biggest' ? money(amount) : slide.title}</h1>
}

export function RecapHero({ slide }: { slide: RecapSlide }) {
  if (slide.kind !== 'intro' && slide.kind !== 'light' && slide.kind !== 'done') return null
  return (
    <Pop delay={0.08} className="week-recap-hero">
      <BirdMark size={112} />
    </Pop>
  )
}

export function RecapDetail({ slide, recap, money }: { slide: RecapSlide; recap: WeekRecap; money: (n: number) => string }) {
  switch (slide.kind) {
    case 'intro':
      return <DayDots recap={recap} />
    case 'regulars':
      return <Chips repeats={recap.repeats} bg={slide.color} />
    case 'hour':
      return <DayArc minutes={recap.logMinutes?.length ? recap.logMinutes : [recap.usualMinute ?? 0]} usual={recap.usualMinute ?? 0} />
    case 'categories':
      return <CategoryBars categories={recap.categories?.length ? recap.categories : recap.topCategory ? [recap.topCategory] : []} money={money} total={recap.totalSpent} />
    case 'biggest':
      return recap.biggest ? <Receipt biggest={recap.biggest} accent={slide.color} money={money} /> : null
    case 'done':
      return <div className="week-recap-confetti"><Confetti /></div>
    default:
      return null
  }
}

/** The week, all seven days ticked: a week done, not a scorecard of days logged. */
function DayDots({ recap }: { recap: WeekRecap }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${recap.startDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), letter: WEEKDAYS[d.getUTCDay()] }
  })
  return (
    <div className="week-recap-dots">
      {days.map((day, i) => (
        <Pop key={day.date} delay={0.45 + i * 0.09} className="week-recap-dot-col">
          <span className="week-recap-dot is-on"><Check size={20} strokeWidth={3} /></span>
          <small>{day.letter}</small>
        </Pop>
      ))}
    </div>
  )
}

/** The repeat items, stamped in at slight angles. */
function Chips({ repeats, bg }: { repeats: WeekRecap['repeats']; bg: string }) {
  const tilts = [-4, 3, -2]
  return (
    <div className="week-recap-chips">
      {repeats.map((r, i) => (
        <Pop key={r.item} delay={0.35 + i * 0.16}>
          <span className={`week-recap-chip${i === 0 ? ' is-first' : ''}`} style={{ transform: `rotate(${tilts[i % 3]}deg)`, '--recap-bg': bg } as CSSProperties}>
            {r.item}
            <b>×{r.count}</b>
          </span>
        </Pop>
      ))}
    </div>
  )
}

/** A day as a half circle, midnight to midnight: a dot per log, the bird perched at their usual time. */
function DayArc({ minutes, usual }: { minutes: number[]; usual: number }) {
  const w = 420
  const pad = 12
  const r = w / 2 - pad
  const cx = w / 2
  const cy = r + pad
  const at = (m: number) => {
    const theta = Math.PI * (1 - Math.min(1440, Math.max(0, m)) / 1440)
    return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) }
  }
  const bird = at(usual)
  const birdSize = 54
  return (
    <Rise delay={0.25} className="week-recap-arc">
      <div className="week-recap-arc-plot">
        <svg viewBox={`0 0 ${w} ${cy + 4}`} width="100%" aria-hidden="true">
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="currentColor" strokeOpacity={0.4} strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" fill="none" />
          {minutes.map((m, i) => {
            const p = at(m)
            return <circle key={i} cx={p.x} cy={p.y} r={6} fill="currentColor" opacity={0.85} />
          })}
        </svg>
        <Pop delay={0.6} className="week-recap-arc-bird" style={{ left: `${((bird.x - birdSize / 2) / w) * 100}%`, top: `${((bird.y - birdSize + 6) / (cy + 4)) * 100}%`, width: `${(birdSize / w) * 100}%` }}>
          <BirdMark size={birdSize} />
        </Pop>
      </div>
      <div className="week-recap-arc-labels"><span>12am</span><span>noon</span><span>12am</span></div>
    </Rise>
  )
}

/**
 * The whole week as one bar, split by share: the top categories, then
 * everything else. Reads the same whether we have 1 category or 4.
 */
function CategoryBars({ categories, money, total }: { categories: NonNullable<WeekRecap['categories']>; money: (n: number) => string; total: number }) {
  const reduceMotion = useReducedMotion()
  const shades = [1, 0.62, 0.42, 0.28]
  const rest = Math.max(0, total - categories.reduce((s, c) => s + c.total, 0))
  const parts = [
    ...categories.map((c, i) => {
      const { icon, text } = splitEmoji(c.category)
      return { key: c.category, label: `${icon ? `${icon} ` : ''}${text || c.category}`, amount: c.total, opacity: shades[i] }
    }),
    ...(rest > 0 ? [{ key: '__rest', label: 'Everything else', amount: rest, opacity: 0.16 }] : []),
  ]
  return (
    <div className="week-recap-bars">
      <motion.div className="week-recap-stack" initial={reduceMotion ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.3, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
        {parts.map((p) => <i key={p.key} style={{ flex: p.amount, opacity: p.opacity }} />)}
      </motion.div>
      <div className="week-recap-legend">
        {parts.map((p, i) => (
          <Rise key={p.key} delay={0.45 + i * 0.11} className="week-recap-legend-row">
            <i style={{ opacity: Math.max(p.opacity, 0.3) }} />
            <span>{p.label}</span>
            <strong>{money(p.amount)} · {Math.round((p.amount / total) * 100)}%</strong>
          </Rise>
        ))}
      </div>
    </div>
  )
}

function Receipt({ biggest, accent, money }: { biggest: NonNullable<WeekRecap['biggest']>; accent: string; money: (n: number) => string }) {
  const { text, icon } = splitEmoji(biggest.category)
  const rows: [string, string][] = [
    ['Item', biggest.item],
    ['Category', `${icon ? `${icon} ` : ''}${text || biggest.category}`],
    ['Date', formatDateShort(biggest.date)],
  ]
  return (
    <Rise delay={0.35} className="week-recap-receipt" style={{ '--recap-accent': accent } as CSSProperties}>
      <span className="week-recap-receipt-head">AVIARY · RECEIPT</span>
      {rows.map(([label, value]) => (
        <div key={label} className="week-recap-receipt-row"><span>{label}</span><strong>{value}</strong></div>
      ))}
      <hr />
      <div className="week-recap-receipt-row is-total"><span>Total</span><strong>{money(biggest.amountInr)}</strong></div>
    </Rise>
  )
}
