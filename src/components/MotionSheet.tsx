import { useReducedMotion, motion, type HTMLMotionProps } from 'motion/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type MotionSheetProps = {
  children?: ReactNode
  className?: string
} & Omit<HTMLMotionProps<'div'>, 'children' | 'className'>

/**
 * Critically damped (bounce: 0) spring transition — Apple's default UI spring
 * (damping 1.0, response ~0.35s). No overshoot.
 */
const SPRING = { type: 'spring', bounce: 0, duration: 0.35 } as const
const FADE = { type: 'tween', duration: 0.2 } as const

export function Scrim({ children, className, initial, animate, exit, ...rest }: MotionSheetProps) {
  const reduce = useReducedMotion()
  const variants = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: FADE },
        exit: { opacity: 0, transition: FADE },
      }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: SPRING },
        exit: { opacity: 0, transition: SPRING },
      }

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      className={className}
      initial={initial ?? variants.initial}
      animate={animate ?? variants.animate}
      exit={exit ?? variants.exit}
      {...rest}
    >
      {children}
    </motion.div>,
    document.querySelector('.expense-redesign') ?? document.body,
  )
}

/** Mobile Modal's SHEET_TRANSITION (damping 64, stiffness 700): overdamped, sampled as linear(). */
const RESIZE_EASE = 'linear(0, 0.134, 0.344, 0.525, 0.662, 0.761, 0.832, 0.882, 0.917, 0.941, 0.959, 0.971, 0.98, 0.986, 0.99, 0.993, 1)'
const RESIZE_MS = 400

/**
 * Eases the card between heights when its content grows or shrinks, like
 * Mobile's Modal. Watches the card itself instead of wrapping its children,
 * so flex and scroll layouts inside a sheet are untouched.
 */
function useResizeEase(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof ResizeObserver === 'undefined' || typeof el.animate !== 'function') return
    let last = el.offsetHeight
    let running: Animation | null = null
    const observer = new ResizeObserver(() => {
      // Mid-ease, the observer sees the animated heights; the finished event re-checks.
      if (running) return
      const next = el.offsetHeight
      if (Math.abs(next - last) < 1) return
      const from = last
      last = next
      const overflow = el.style.overflow
      el.style.overflow = 'hidden'
      running = el.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: RESIZE_MS, easing: RESIZE_EASE })
      running.onfinish = running.oncancel = () => {
        running = null
        el.style.overflow = overflow
      }
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      running?.cancel()
    }
  }, [ref, enabled])
}

export function Sheet({ children, className, initial, animate, exit, ...rest }: MotionSheetProps) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  useResizeEase(ref, !reduce)
  const variants = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: FADE },
        exit: { opacity: 0, transition: FADE },
      }
    : {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0, transition: SPRING },
        exit: { opacity: 0, scale: 0.96, y: 8, transition: SPRING },
      }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={initial ?? variants.initial}
      animate={animate ?? variants.animate}
      exit={exit ?? variants.exit}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
