import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useInView, useReducedMotion } from 'motion/react'
import { AmountText } from '@/src/components/landing/mobile/kit'

// Slow enough to follow: a beat on the old amount, then the odometer ticks
// through a few eased steps (big jumps first) before it lands.
const HOLD_MS = 500
const STEP_MS = 300
const STEPS = 5
const SPLASH_MS = 700
const DOTS = 10

/** The amounts each tick lands on, eased out so the last ticks are small. */
export function rollSteps(from: number, to: number, steps = STEPS): number[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps
    return i === steps - 1 ? to : Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)))
  })
}

/**
 * A category's Left amount that can roll in what last month left behind: it
 * shows `from` (the amount without the carry), waits until it's on screen,
 * ticks to `to` on the odometer, then bounces and splashes. Each new `play`
 * (above 0) runs it again, so the rollover strip can replay it. With `play`
 * at 0 it's just `to`.
 *
 * While it ticks it's green going up and red going down (a shortfall eating
 * into this month), then settles into its own color: an amount still above
 * zero after a shortfall turns back green.
 */
export function RollingAmount({ from, to, play, delayMs = 0, format, className }: {
  from: number
  to: number
  play: number
  delayMs?: number
  format: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { amount: 0.6 })
  const reduceMotion = useReducedMotion()
  // null shows `to`; a number is mid-roll.
  const [shown, setShown] = useState<number | null>(null)
  const [armed, setArmed] = useState(0)
  // The pill's size when it landed, keyed so each landing is a fresh burst.
  const [splash, setSplash] = useState<{ n: number; w: number; h: number } | null>(null)

  // A new play goes back to the old amount during render, so the new one never
  // flashes first. Re-renders with the same play leave a roll alone.
  const [seenPlay, setSeenPlay] = useState(0)
  if (play !== seenPlay) {
    setSeenPlay(play)
    if (play > 0 && !reduceMotion && from !== to) {
      setShown(from)
      setArmed(play)
    }
  }

  useEffect(() => {
    if (!armed || !inView) return
    const steps = rollSteps(from, to)
    const timers = steps.map((n, i) => setTimeout(() => setShown(n), HOLD_MS + delayMs + i * STEP_MS))
    // After the last tick's odometer roll: settle, bounce, splash.
    timers.push(setTimeout(() => {
      setShown(null)
      setArmed(0)
      setSplash((s) => ({ n: (s?.n ?? 0) + 1, w: ref.current?.offsetWidth ?? 64, h: ref.current?.offsetHeight ?? 24 }))
    }, HOLD_MS + delayMs + steps.length * STEP_MS))
    return () => timers.forEach(clearTimeout)
  }, [armed, inView]) // eslint-disable-line react-hooks/exhaustive-deps -- from/to are read at the start of a roll

  useEffect(() => {
    if (!splash) return
    const t = setTimeout(() => setSplash(null), SPLASH_MS)
    return () => clearTimeout(t)
  }, [splash])

  const value = shown ?? to
  const tone = shown !== null ? (to < from ? ' is-rolling-down' : ' is-rolling-up') : ''
  return (
    <span ref={ref} className={`${className ?? ''}${tone}${splash ? ' is-splash' : ''}`}>
      <AmountText value={value} rawText={format(value)} animate />
      {splash && <Splash key={splash.n} w={splash.w} h={splash.h} />}
    </span>
  )
}

/** Dots bursting off the pill's edge in its own color, on an ellipse the pill's shape. */
function Splash({ w, h }: { w: number; h: number }) {
  const rx = w / 2 + 14
  const ry = h / 2 + 12
  return (
    <span className="env2-splash" aria-hidden="true">
      {Array.from({ length: DOTS }, (_, i) => {
        const a = (i / DOTS) * Math.PI * 2
        return <i key={i} style={{ '--x': `${Math.cos(a) * rx}px`, '--y': `${Math.sin(a) * ry}px` } as CSSProperties} />
      })}
    </span>
  )
}
