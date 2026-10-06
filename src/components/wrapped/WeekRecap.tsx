'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Pause, Play, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useHideAmounts } from '@/src/hooks/useHideAmounts'
import { getWeekRecap, markWeekRecapSeen, type WeekRecap } from '@/src/api/weekRecap'
import { track } from '@/src/lib/analytics'
import { recapSlides } from './weekRecapSlides'
import { RecapBlobs, RecapDetail, RecapHero, RecapTitle } from './WeekRecapVisuals'
import { STORY_MS } from './WrappedExperience'

export { formatMinute, recapSlides } from './weekRecapSlides'

function RecapStory({ recap, onClose }: { recap: WeekRecap; onClose: () => void }) {
  const { formatCurrency } = useCurrency()
  const [hideAmounts] = useHideAmounts()
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const money = useMemo(() => (n: number) => formatCurrency(n, hideAmounts), [formatCurrency, hideAmounts])
  const slides = useMemo(() => recapSlides(recap, money), [recap, money])
  const last = index === slides.length - 1
  const slide = slides[index]
  const dialog = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  // Plays like Wrapped: each slide holds STORY_MS, then moves on, stopping on the last.
  // Plays like Wrapped, but driven by the progress bar itself: the slide
  // advances when its bar finishes, so pausing freezes both together and
  // resuming carries on from the same point. Stops on the last slide.
  const advance = () => {
    if (!last) setIndex((i) => i + 1)
  }

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
      // Space on a focused button presses that button; anywhere else it pauses.
      if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPaused((value) => !value) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, slides.length])

  return (
    <div ref={dialog} className="wrapped-shell week-recap-overlay" role="dialog" aria-modal="true" aria-label="Your first week">
      <main className="wrapped-player week-recap-player" style={{ '--wrapped-bg': slide.color, '--wrapped-ink': slide.ink } as CSSProperties}>
        <RecapBlobs key={index} kind={slide.kind} />
        <div className="wrapped-progress" aria-label={`Story ${index + 1} of ${slides.length}`}>{slides.map((_, i) => <i key={i}><b className={i < index ? 'is-done' : i === index ? 'is-current' : ''} style={i === index && !reduceMotion ? { animationDuration: `${STORY_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined} onAnimationEnd={i === index ? advance : undefined} /></i>)}</div>
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
              <RecapHero slide={slide} />
              <RecapTitle slide={slide} recap={recap} money={money} />
              <p>{slide.body}</p>
              <RecapDetail slide={slide} recap={recap} money={money} />
            </div>
            {last && <button className="wrapped-share" type="button" onClick={() => { track('week_recap_finished'); onClose() }}>Keep going</button>}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  )
}

/** GET /api/recap, shared by the gate and the Home "learning you" card. Refetched on window focus. */
export function useWeekRecap() {
  return useQuery({ queryKey: ['week-recap'], queryFn: getWeekRecap, staleTime: 5 * 60_000, retry: false })
}

/**
 * Opens itself over the page once, the first time the recap is due on any
 * device. No entry point: if it's been seen anywhere, `due` is false.
 */
export function WeekRecapGate() {
  const qc = useQueryClient()
  // Refetched on window focus, so a tab left open across day 7 still gets it.
  const { data } = useWeekRecap()
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
