import { useReducedMotion, motion, type HTMLMotionProps } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SCRIMS = '.erd-modal-overlay, .money-overlay, .move-money-overlay, .category-manager-overlay, .date-picker-scrim, .modal-overlay'

/**
 * Keyboard and screen-reader behaviour every dialog needs, in one place: the
 * sheet is announced as a modal dialog, focus moves into it, Tab stays inside
 * it, Escape closes it (by clicking its scrim, which already owns the close
 * logic and any "can't close while saving" guard), and focus returns to
 * whatever opened it.
 */
export function useDialogKeys(
  ref: React.RefObject<HTMLElement | null>,
  /** For dialogs whose scrim doesn't close on click (it closes on mousedown, or there is none). */
  onEscape?: () => void,
) {
  // Read during render, before children commit: an autoFocus input inside the
  // sheet takes focus in the commit, so an effect would record that input.
  const opener = useRef<HTMLElement | null>(null)
  const headingId = useId()
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })
  if (opener.current === null && typeof document !== 'undefined') {
    opener.current = (document.activeElement as HTMLElement | null) ?? document.body
  }
  useEffect(() => {
    const el = ref.current
    // Only sheets that are dialogs (on a scrim, or marked as one): some are inline cards.
    if (!el || !(el.parentElement?.matches(SCRIMS) || el.matches('[role="dialog"], [role="alertdialog"], [aria-modal="true"]'))) return
    el.setAttribute('data-dialog-sheet', '')
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog')
    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true')
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      const heading = el.querySelector<HTMLElement>('h1, h2, h3, h4')
      if (heading) {
        heading.id ||= headingId
        el.setAttribute('aria-labelledby', heading.id)
      }
    }
    if (!el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>('[autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE)
      if (first) first.focus({ preventScroll: true })
      else {
        el.tabIndex = -1
        el.focus({ preventScroll: true })
      }
    }
    // Only the newest open sheet reacts, so a confirm on top of a sheet closes alone.
    const isTop = () => {
      const sheets = document.querySelectorAll('[data-dialog-sheet]')
      return sheets[sheets.length - 1] === el
    }
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') {
        // data-own-escape: the dialog handles Escape itself (e.g. steps back instead of closing).
        if (el.hasAttribute('data-own-escape')) return
        if (escapeRef.current) {
          e.preventDefault()
          escapeRef.current()
          return
        }
        const scrim = el.parentElement
        if (scrim && scrim !== document.body) {
          e.preventDefault()
          scrim.click()
        }
        return
      }
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest('[inert], [hidden], [aria-hidden="true"]'))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const back = opener.current
    return () => {
      document.removeEventListener('keydown', onKey)
      el.removeAttribute('data-dialog-sheet')
      // Give focus back unless the close moved it somewhere on purpose.
      const active = document.activeElement
      if (back && back !== document.body && back.isConnected && (!active || active === document.body || el.contains(active))) {
        back.focus({ preventScroll: true })
      }
    }
  }, [ref, headingId])
}

/** The same dialog behaviour for a dialog that isn't a Sheet: mount it inside the dialog while it's open. */
export function DialogKeys({ target, onEscape }: { target: React.RefObject<HTMLElement | null>; onEscape?: () => void }) {
  useDialogKeys(target, onEscape)
  return null
}

export function Sheet({ children, className, initial, animate, exit, ...rest }: MotionSheetProps) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  useResizeEase(ref, !reduce)
  useDialogKeys(ref)
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
