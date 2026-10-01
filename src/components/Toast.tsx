'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'

const VISIBLE_MS = 2600
/** Mobile's DROP_SPRING. */
const DROP_SPRING = { type: 'spring', mass: 0.8, damping: 13, stiffness: 190 } as const

/**
 * Web twin of Mobile's src/components/ui/Toast.tsx. Each new `trigger` drops
 * the pill in from above on a spring; a repeat trigger while it's still up
 * wiggles and bumps it instead of replaying the drop. Hides after 2.6s.
 * Portalled to the page root and pinned to the top of the viewport, above any
 * open dialog (a dialog's transform would otherwise trap `position: fixed`).
 */
export function Toast({ message, trigger, icon: Icon }: { message: string; trigger: number; icon?: LucideIcon }) {
  const [shown, setShown] = useState(false)
  const [seenTrigger, setSeenTrigger] = useState(trigger)
  const [text, setText] = useState(message)
  if (message && message !== text) setText(message)
  if (trigger !== seenTrigger) {
    setSeenTrigger(trigger)
    if (trigger > 0 && message) setShown(true)
  }
  if (!message && shown) setShown(false)

  const pill = useRef<HTMLDivElement>(null)
  const upRef = useRef(false)

  useEffect(() => {
    if (!shown) {
      upRef.current = false
      return
    }
    if (upRef.current && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      pill.current?.animate?.(
        [
          { rotate: '0deg', scale: '1' },
          { rotate: '-3deg', scale: '1.06', offset: 50 / 280 },
          { rotate: '3deg', offset: 140 / 280 },
          { rotate: '-1.5deg', offset: 220 / 280 },
          { rotate: '0deg', scale: '1' },
        ],
        { duration: 280 },
      )
    }
    upRef.current = true
    const timer = setTimeout(() => setShown(false), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [shown, trigger])

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      className="erd-toast"
      aria-hidden={!shown}
      initial={false}
      animate={shown ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -28, scale: 0.86 }}
      transition={shown ? DROP_SPRING : { duration: 0.22 }}
    >
      <div ref={pill} className={`erd-toast-pill${Icon ? ' has-icon' : ''}`} role={shown ? 'alert' : undefined}>
        {Icon ? (
          <span className="erd-toast-badge">
            <Icon size={15} color="#ffffff" strokeWidth={2.5} />
          </span>
        ) : null}
        <span className="erd-toast-text">{text}</span>
      </div>
    </motion.div>,
    document.querySelector('.expense-redesign') ?? document.body,
  )
}
