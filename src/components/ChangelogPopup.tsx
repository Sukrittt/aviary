'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChangelogCard } from './ChangelogCard'
import type { ChangelogRelease } from '@/src/lib/changelog'

/** The real announcement and admin replay share their placement and motion. */
export function ChangelogPopup({ release, onDismiss, preview = false, replay = 0 }: { release: ChangelogRelease | null; onDismiss: () => void; preview?: boolean; replay?: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence mode="wait">
      {release && <motion.div
        key={`${release.id}:${replay}`}
        className="changelog-announcement"
        aria-live="polite"
        initial={{ opacity: 0, transform: reduceMotion ? 'none' : 'translateY(10px)' }}
        animate={{ opacity: 1, transform: reduceMotion ? 'none' : 'translateY(0px)', transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
        exit={{ opacity: 0, transform: reduceMotion ? 'none' : 'translateY(6px)', transition: { duration: 0.16, ease: 'easeOut' } }}
      ><ChangelogCard release={release} onDismiss={onDismiss} preview={preview} /></motion.div>}
    </AnimatePresence>
  )
}
