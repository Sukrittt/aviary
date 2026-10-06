'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Pause, Play, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useHideAmounts } from '@/src/hooks/useHideAmounts'
import { getWeekRecap, markWeekRecapSeen, type WeekRecap } from '@/src/api/weekRecap'
import { track } from '@/src/lib/analytics'
import { BirdMark } from '@/src/components/BirdMark'
import { STORY_MS } from './WrappedExperience'

/** Below this many expenses there's nothing to learn yet, so the recap asks for more instead. */
const LIGHT_WEEK = 3

/** Minutes after midnight, to the nearest half hour: 1230 -> "8:30pm", 1263 -> "9pm". */
export function formatMinute(minute: number): string {
  const rounded = (Math.round(minute / 30) * 30) % 1440
  const h = Math.floor(rounded / 60)
  return `${h % 12 || 12}${rounded % 60 ? ':30' : ''}${h < 12 ? 'am' : 'pm'}`
}

/** `bird` shows the Aviary mark in place of an emoji. */
type Slide = { color: string; ink: string; eyebrow: string; title: string; emoji?: string; bird?: boolean; body: string }

export function recapSlides(recap: WeekRecap, money: (n: number) => string): Slide[] {
  const n = recap.totalTransactions
  if (n < LIGHT_WEEK) {
    return [
      {
        color: '#40395f', ink: '#fffaf0', eyebrow: 'Your first week', title: "Let's get to know you", bird: true,
        body: n === 0
          ? "You haven't logged anything yet. Log a few expenses and we'll start spotting your patterns."
          : `You logged ${n} ${n === 1 ? 'expense' : 'expenses'} this week. Log a few more and we'll start spotting your patterns.`,
      },
    ]
  }

  const slides: Slide[] = [
    {
      color: '#40395f', ink: '#fffaf0', eyebrow: 'Your first week', title: "Here's what we learned about you", bird: true,
      body: `${n} expenses across ${recap.daysLogged} of 7 days. Here's what stood out.`,
    },
  ]
  const [first, ...rest] = recap.repeats
  if (first) {
    slides.push({
      color: '#e89161', ink: '#341b10', eyebrow: 'Your regulars', title: `${first.item}, ${first.count} times`, emoji: '🔁',
      body: rest.length ? `Then ${rest.map((r) => `${r.item} (${r.count})`).join(' · ')}. We'll have these ready for you.` : "A regular already. We'll have it ready for you.",
    })
  }
  if (recap.usualMinute !== null) {
    slides.push({
      color: '#6f67b1', ink: '#fffaf5', eyebrow: 'Your logging hour', title: `Around ${formatMinute(recap.usualMinute)}`, emoji: '🕘',
      body: "That's when you usually check in. Keep the rhythm going.",
    })
  }
  if (recap.topCategory) {
    slides.push({
      color: '#568d86', ink: '#f8fff9', eyebrow: 'Where it went', title: recap.topCategory.category, emoji: '📊',
      body: `${Math.round(recap.topCategory.pct)}% of your spending · ${money(recap.topCategory.total)}`,
    })
  }
  if (recap.biggest) {
    slides.push({
      color: '#efd89a', ink: '#302817', eyebrow: 'Biggest spend', title: money(recap.biggest.amountInr), emoji: '💸',
      body: `${recap.biggest.item} in ${recap.biggest.category}.`,
    })
  }
  slides.push({
    color: '#40395f', ink: '#fffaf0', eyebrow: 'Week one · done', title: "You're off to a great start", emoji: '🌱',
    body: "Keep logging and we'll get sharper every week.",
  })
  return slides
}

function RecapStory({ recap, onClose }: { recap: WeekRecap; onClose: () => void }) {
  const { formatCurrency } = useCurrency()
  const [hideAmounts] = useHideAmounts()
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const slides = useMemo(() => recapSlides(recap, (n) => formatCurrency(n, hideAmounts)), [recap, formatCurrency, hideAmounts])
  const last = index === slides.length - 1
  const slide = slides[index]
  const dialog = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  // Plays like Wrapped: each slide holds STORY_MS, then moves on, stopping on the last.
  useEffect(() => {
    if (paused || reduceMotion || last) return
    const timer = window.setTimeout(() => setIndex((i) => Math.min(slides.length - 1, i + 1)), STORY_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, reduceMotion, last, slides.length])

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('.wrapped-controls button')?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Keep Tab inside the story so the page behind it isn't reachable.
      if (event.key === 'Tab' && dialog.current) {
        const buttons = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
        const at = buttons.indexOf(document.activeElement as HTMLElement)
        event.preventDefault()
        buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(slides.length - 1, i + 1))
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (event.key === 'Escape') onClose()
      if (event.key === ' ') { event.preventDefault(); setPaused((value) => !value) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, slides.length])

  return (
    <div ref={dialog} className="wrapped-shell week-recap-overlay" role="dialog" aria-modal="true" aria-label="Your first week">
      <main className="wrapped-player" style={{ '--wrapped-bg': slide.color, '--wrapped-ink': slide.ink } as CSSProperties}>
        <div className="wrapped-progress" aria-label={`Story ${index + 1} of ${slides.length}`}>{slides.map((_, i) => <i key={i}><b className={i < index ? 'is-done' : i === index ? 'is-current' : ''} style={i === index && !paused && !reduceMotion ? { animationDuration: `${STORY_MS}ms` } : undefined} /></i>)}</div>
        <div className="wrapped-controls">
          <button type="button" onClick={onClose} aria-label="Close recap"><X /></button>
          <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume stories' : 'Pause stories'}>{paused ? <Play /> : <Pause />}</button>
        </div>
        <button className="wrapped-tap wrapped-tap--left" type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} aria-label="Previous story" disabled={index === 0} />
        <button className="wrapped-tap wrapped-tap--right" type="button" onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))} aria-label="Next story" disabled={last} />
        {/* The background and ink switch the moment the index changes, so the
            old slide leaves near-instantly instead of lingering in the new colours. */}
        <AnimatePresence mode="wait">
          <motion.section key={index} className="wrapped-slide" initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.35 }}>
            <span className="wrapped-slide-count">{String(index + 1).padStart(2, '0')} / {slides.length}</span>
            <div className="wrapped-story-copy">
              <span className="wrapped-eyebrow">{slide.eyebrow}</span>
              {slide.bird
                ? <span className="wrapped-hero-emoji" aria-hidden="true"><BirdMark size={96} /></span>
                : slide.emoji && <span className="wrapped-hero-emoji" aria-hidden="true">{slide.emoji}</span>}
              <h1>{slide.title}</h1>
              <p>{slide.body}</p>
            </div>
            {last && <button className="wrapped-share" type="button" onClick={() => { track('week_recap_finished'); onClose() }}>Keep going</button>}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  )
}

/**
 * Opens itself over the page once, the first time the recap is due on any
 * device. No entry point: if it's been seen anywhere, `due` is false.
 */
export function WeekRecapGate() {
  const qc = useQueryClient()
  // Refetched on window focus, so a tab left open across day 7 still gets it.
  const { data } = useQuery({ queryKey: ['week-recap'], queryFn: getWeekRecap, staleTime: 5 * 60_000, retry: false })
  // Held once shown: marking it seen flips the cache to `due: false`, which must not close the story mid-read.
  const [shown, setShown] = useState<WeekRecap | null>(null)
  const [closed, setClosed] = useState(false)
  if (!shown && !closed && data?.due && data.recap) setShown(data.recap)

  useEffect(() => {
    if (!shown) return
    track('week_recap_opened')
    // Seen on open, not on finish: closing early still counts. Dropping the
    // cached `due` stops a remount of the page from reopening it.
    markWeekRecapSeen()
      .then(() => qc.setQueryData(['week-recap'], { due: false }))
      .catch((err) => console.warn('Marking recap seen failed', err))
  }, [shown, qc])

  if (!shown || closed) return null
  return <RecapStory recap={shown} onClose={() => setClosed(true)} />
}
