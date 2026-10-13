'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CaretRightIcon } from '@/src/components/icons'
import type { ReactNode } from 'react'

// Same spring as Mobile's EnvelopeGroup / envelopes.tsx (Reanimated withSpring and
// LinearTransition.springify()): identical stiffness/damping/mass physics in motion.
export const ENVELOPE_SPRING = { type: 'spring', stiffness: 900, damping: 90, mass: 1 } as const

/** Group body that springs its height open/closed and fades rows like Mobile (FadeIn 150ms, FadeOut 120ms). */
export function SpringCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          style={{ overflow: 'hidden' }}
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: reduce ? { duration: 0 } : { height: ENVELOPE_SPRING, opacity: { duration: 0.15 } },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: reduce ? { duration: 0 } : { height: ENVELOPE_SPRING, opacity: { duration: 0.12 } },
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Chevron rotated by the same spring as Mobile's withSpring(expanded ? '90deg' : '0deg'). */
export function SpringChevron({ open, size, className }: { open: boolean; size: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      className={className}
      style={{ display: 'inline-flex' }}
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={reduce ? { duration: 0 } : ENVELOPE_SPRING}
      aria-hidden="true"
    >
      <CaretRightIcon size={size} />
    </motion.span>
  )
}
