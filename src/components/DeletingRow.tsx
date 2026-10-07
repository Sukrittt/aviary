'use client'

import { useEffect, useRef, type ReactNode, type Ref } from 'react'
import { motion } from 'motion/react'

const SWEEP_MS = 180

/** How rows below spring up into a removed row's gap: quick, with a small settle. */
export const ROW_SPRING = { type: 'spring', damping: 30, stiffness: 400, mass: 1 } as const

/**
 * Web twin of Mobile's src/components/activity/DeletingRow.tsx. When `active`
 * flips on, a coral pill sweeps in from the right (180ms), then `onDone` runs.
 * The parent drops the row from its list right there (before the delete
 * request settles) and renders the list inside
 * `<AnimatePresence mode="popLayout" initial={false}>`, so the row fades out
 * of the flow at once and the rows below spring up via `layout`. If the delete
 * fails, the parent puts the row back and it fades in.
 *
 * `ref` must reach the DOM node: popLayout clones a ref onto its child to
 * measure the row and pin it `position: absolute` while it exits. Without it
 * the row stays in flow, so the rows below only jump up after the fade.
 */
export function DeletingRow({
  ref,
  active,
  onDone,
  as = 'div',
  className,
  children,
}: {
  ref?: Ref<HTMLDivElement & HTMLLIElement>
  active: boolean
  onDone: () => void
  as?: 'div' | 'li'
  className?: string
  children: ReactNode
}) {
  const Row = as === 'li' ? motion.li : motion.div
  // A timer, not onAnimationComplete: it fires the same with reduced motion or
  // no animation engine at all (jsdom). Ref, so a parent re-render mid-sweep
  // doesn't restart it.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => onDoneRef.current(), SWEEP_MS)
    return () => clearTimeout(t)
  }, [active])
  return (
    <Row
      ref={ref}
      className={className}
      style={{ position: 'relative' }}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.15 } }}
      // Mobile's 220ms collapse: the coral stays visible while the rows below spring up.
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ layout: ROW_SPRING }}
    >
      {children}
      {active && (
        <motion.span
          aria-hidden="true"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: SWEEP_MS / 1000 }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 16,
            background: 'var(--coral)',
            transformOrigin: 'right',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            pointerEvents: 'none',
          }}
        >
          🗑️
        </motion.span>
      )}
    </Row>
  )
}
