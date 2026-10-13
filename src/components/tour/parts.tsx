'use client'

import type { CSSProperties, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { PhosphorIcon } from '@/src/components/icons'

// Twin of Mobile's src/components/tour/parts.tsx. Reanimated's springs and
// bounces become motion springs / keyframes with the same numbers; the
// primitives below are the web side of Mobile's PopIn, FadeIn.duration(n) and
// the quiz/source bounce + wobble.

// Mobile PopIn's spring and the bezier its bounce/wobble share.
const POP_SPRING = { type: 'spring', mass: 0.7, damping: 12, stiffness: 160 } as const
const BOUNCE_EASE = [0.34, 1.56, 0.64, 1] as const

/** Cold-mount pop: fades up from 0.92 scale / 6px below on a bouncy spring, after `delay` ms. */
export function PopIn({
  delay = 0,
  className,
  style,
  children,
}: {
  delay?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...POP_SPRING, delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  )
}

/** Reanimated `FadeIn.duration(ms)` on mount. */
export function FadeIn({ ms, className, children }: { ms: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: ms / 1000, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Plays once each time `on` flips true: a 152ms+228ms scale bump (source rows,
 * right quiz answer) or a four-step 60ms shake (wrong quiz answer).
 */
export function Reaction({
  on,
  kind = 'bounce',
  by = 1.03,
  children,
}: {
  on: boolean
  kind?: 'bounce' | 'wobble'
  by?: number
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  const play = on && !reduce
  return (
    <motion.div
      animate={play ? (kind === 'wobble' ? { x: [0, -5, 5, -3, 0] } : { scale: [1, by, 1] }) : { scale: 1, x: 0 }}
      transition={kind === 'wobble' ? { duration: 0.24, ease: 'easeOut' } : { duration: 0.38, times: [0, 0.4, 1], ease: BOUNCE_EASE }}
    >
      {children}
    </motion.div>
  )
}

/** The small uppercase caption the tour uses above a block of demo rows. */
export function SectionLabel({ children }: { children: string }) {
  return <p className="tour-section-label">{children}</p>
}

/**
 * One demo row: icon tile, name, a note under it, and whatever the chapter
 * wants on the right. Shared by the assign, move and rollover demos, which are
 * the same row with a different right-hand side.
 */
export function TourRow({
  icon: Icon,
  name,
  note,
  noteClass,
  right,
  highlight,
}: {
  icon: PhosphorIcon
  name: string
  note: string
  noteClass?: string
  right: ReactNode
  highlight?: boolean
}) {
  return (
    <div className={`tour-row ${highlight ? 'is-highlight' : ''}`}>
      <div className="tour-row-tile"><Icon size={18} aria-hidden /></div>
      <div className="tour-row-body">
        <span className="tour-row-name">{name}</span>
        <span className={`tour-row-note ${noteClass ?? ''}`}>{note}</span>
      </div>
      {right}
    </div>
  )
}

/** Flat mint or accent callout the chapters drop under a completed action. */
export function ResultCard({ tone, children }: { tone: 'mint' | 'accent'; children: ReactNode }) {
  return <div className={`tour-result-card is-${tone}`}>{children}</div>
}
