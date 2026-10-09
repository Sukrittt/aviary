'use client'

import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { T, font, pressable, radius, space, type } from './kit'

// Lets the screen settle before the bubble pops.
const ENTER_DELAY_S = 0.65
const CARET_W = 22
const CARET_H = 10
// Flares out of the card's edge and rounds off at the tip, so it reads as part of the bubble.
const CARET_PATH = 'M0 10 C5 10 7 8.5 8.8 5.6 L9.6 4.3 Q11 2 12.4 4.3 L13.2 5.6 C15 8.5 17 10 22 10 Z'

/**
 * Twin of Mobile's src/features/log-expense/CaptureTipBubble.tsx: a speech bubble
 * that pops out of the header's chat icon, with a soft ring pulsing round the
 * icon so the two read as one thing. `anchor` is the icon's box in the screen.
 */
export function CaptureTipBubble({ anchor, title, body, onTry, onDismiss }: {
  anchor: { top: number; left: number; size: number }
  title: string
  body: string
  onTry: () => void
  onDismiss: () => void
}) {
  const reduced = useReducedMotion()
  // The card sits a touch left of the icon so the caret lands on its flat top, clear of the rounded corner.
  const nudge = 4
  return <>
    <motion.span
      aria-hidden="true"
      style={{ position: 'absolute', top: anchor.top, left: anchor.left, width: anchor.size, height: anchor.size, borderRadius: anchor.size / 2, border: `2px solid ${T.onAccent}`, zIndex: 10, pointerEvents: 'none' }}
      initial={{ opacity: 0, scale: 1 }}
      animate={reduced ? { opacity: 0 } : { opacity: [0.6, 0], scale: [1, 1.45] }}
      transition={{ delay: ENTER_DELAY_S, duration: 1.4, ease: 'easeOut', repeat: Infinity }}
    />
    <motion.div
      role="dialog"
      aria-label={title}
      style={{ position: 'absolute', zIndex: 10, width: 264, top: anchor.top + anchor.size + 4 + CARET_H, left: anchor.left - nudge, transformOrigin: `${nudge + anchor.size / 2}px -${CARET_H}px` }}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduced ? { delay: ENTER_DELAY_S, duration: 0.2 } : { delay: ENTER_DELAY_S, type: 'spring', stiffness: 420, damping: 26 }}
    >
      <div style={{ position: 'relative', background: T.onAccent, borderRadius: radius.lg, borderTopLeftRadius: radius.sm, padding: space.md, boxShadow: '0 6px 16px rgba(122, 42, 0, 0.25)' }}>
        <svg width={CARET_W} height={CARET_H} viewBox={`0 0 ${CARET_W} ${CARET_H}`} style={{ position: 'absolute', top: -(CARET_H - 1), left: nudge + anchor.size / 2 - CARET_W / 2 }} aria-hidden="true">
          <path d={CARET_PATH} fill={T.onAccent} />
        </svg>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm }}>
          <span style={{ flex: 1, color: T.accent, ...font.displaySemiBold, fontSize: type.body }}>{title}</span>
          <button type="button" onClick={onDismiss} aria-label="Dismiss tip" style={{ ...pressable, display: 'grid', placeItems: 'center' }}>
            <X size={16} color={T.accent} />
          </button>
        </div>
        <p style={{ margin: '2px 0 0', color: T.accent, opacity: 0.8, ...font.bodyMedium, fontSize: type.caption }}>{body}</p>
        <button type="button" onClick={onTry} aria-label="Try logging several at once"
          style={{ ...pressable, marginTop: space.sm, padding: `6px ${space.md}px`, borderRadius: radius.full, background: T.accent, color: T.onAccent, ...font.bodyBold, fontSize: type.caption }}>
          Try it
        </button>
      </div>
    </motion.div>
  </>
}
