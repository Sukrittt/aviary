'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { MessageSquareText, X } from 'lucide-react'
import { useMoneyBrain } from './MoneyBrainProvider'
import { interrupted, subscribeInterruptions } from './ChangelogAnnouncement'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { captureTipReason, MANUAL_LOG_EVENT, NO_TIP_STATE, parseTipState, type CaptureTipReason } from '@/src/lib/captureTip'
import { todayIST } from '@/src/lib/date'
import { track } from '@/src/lib/analytics'
import '@/src/components/Changelog.css'

const COPY: Record<CaptureTipReason, { title: string; body: string }> = {
  batch: {
    title: 'Logging a few?',
    body: 'Type them all in Ask Aviary at once, like “auto 240, lunch 150”. We’ll log them in one go.',
  },
  gap: {
    title: 'Been a couple of days?',
    body: 'Dump whatever you remember in Ask Aviary, like “auto 240, lunch 150”. We’ll log it all in one go.',
  },
}

// The changelog card owns this corner; the tip waits its turn.
const blockedNow = () => interrupted() || document.querySelector('.changelog-announcement') !== null

/**
 * A bottom-right pointer to typing several spends into Ask Aviary, shown only
 * when lib/captureTip.ts says the moment is right, and never over a modal,
 * the drawer or the changelog card.
 */
export function CaptureTip() {
  const { user } = useAuth()
  const pathname = usePathname() ?? ''
  const brain = useMoneyBrain()
  const reduceMotion = useReducedMotion()
  const blocked = useSyncExternalStore(subscribeInterruptions, blockedNow, () => true)
  const onApp = pathname === '/expense' || pathname.startsWith('/expense/')
  const rows = useRecentExpenses().data
  const [state, setState] = usePersistentState('capture-tip', NO_TIP_STATE, parseTipState, JSON.stringify)
  // Its own key, so it can't race the show count's write.
  const [tried, setTried] = usePersistentState('capture-tip-tried', false, (v) => v === 'true', String)
  const [manualLogs, setManualLogs] = useState<number[]>([])
  // What's on screen: latched once shown so recording the show doesn't hide it, and 'closed' for the rest of the visit.
  const [shown, setShown] = useState<CaptureTipReason | 'closed' | null>(null)

  useEffect(() => {
    const onLog = () => setManualLogs((logs) => [...logs.slice(-4), Date.now()])
    window.addEventListener(MANUAL_LOG_EVENT, onLog)
    return () => window.removeEventListener(MANUAL_LOG_EVENT, onLog)
  }, [])

  const ready = Boolean(user && onApp && rows && !blocked && !brain.isMoneyBrainOpen)
  if (ready && shown === null) {
    // eslint-disable-next-line react-hooks/purity -- read once, when deciding whether to latch
    const reason = captureTipReason({ rows: rows!, today: todayIST(), now: Date.now(), manualLogs, state: { ...state, done: tried } })
    if (reason) setShown(reason)
  }

  const reason = shown && shown !== 'closed' ? shown : null
  // Counted once per showing; the setter's identity changes with every write.
  const counted = useRef(false)
  useEffect(() => {
    if (!reason || counted.current) return
    counted.current = true
    track('capture_tip', { action: 'shown', reason })
    setState((s) => ({ ...s, shown: s.shown + 1, lastShown: Date.now() }))
  }, [reason, setState])

  const visible = reason && ready
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="changelog-announcement"
          aria-live="polite"
          initial={{ opacity: 0, transform: reduceMotion ? 'none' : 'translateY(10px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)', transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.16, ease: 'easeOut' } }}
        >
          <aside className="changelog-card" aria-label={COPY[reason].title}>
            <div className="changelog-eyebrow"><MessageSquareText size={14} aria-hidden="true" /> Tip</div>
            <button
              type="button"
              className="changelog-close"
              aria-label="Dismiss tip"
              onClick={() => {
                track('capture_tip', { action: 'dismiss', reason })
                setShown('closed')
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <h2>{COPY[reason].title}</h2>
            <p className="changelog-body">{COPY[reason].body}</p>
            <button
              type="button"
              className="changelog-link capture-tip-try"
              onClick={() => {
                track('capture_tip', { action: 'try', reason })
                setTried(true)
                setShown('closed')
                brain.openCapture()
              }}
            >
              Try it
            </button>
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
