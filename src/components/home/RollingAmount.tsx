import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'

/**
 * A category's Left amount that can roll in what last month left behind: it
 * shows `from` (the amount without the carry), waits until it's on screen,
 * counts to `to` and splashes. Each new `play` (above 0) runs it again, so the
 * rollover strip can replay it. With `play` at 0 it's just `to`.
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
  const [splash, setSplash] = useState(false)

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
    const controls = animate(from, to, {
      duration: 0.6,
      delay: delayMs / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => setShown(Math.round(n)),
      onComplete: () => {
        setShown(null)
        setArmed(0)
        setSplash(true)
      },
    })
    return () => controls.stop()
  }, [armed, inView]) // eslint-disable-line react-hooks/exhaustive-deps -- from/to are read at the start of a roll

  return (
    <span
      ref={ref}
      className={`${className ?? ''}${splash ? ' is-splash' : ''}`}
      onAnimationEnd={() => setSplash(false)}
    >
      {format(shown ?? to)}
    </span>
  )
}
