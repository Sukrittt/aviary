'use client'

import { useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CheckIcon } from '@/src/components/landing/mobile/kit'
import { useButtonPhase } from '@/src/components/SuccessButton'
import { useUpdateUser, useUser } from '@/src/hooks/useUser'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { track } from '@/src/lib/analytics'
import { OPT_IN_SINCE, extrasUnchosen } from '@/src/lib/features'
import type { UserProfile } from '@/src/api/account'
import type { HeardFrom as Source } from '@/lib/users'
import { slideAway } from './PickExtras'

/** Every answer, in the order shown. Twin of Mobile's HeardFrom.tsx. */
export const HEARD_FROM_LABELS: Record<Source, string> = {
  friend: 'A friend',
  search: 'Google or search',
  social: 'Instagram, TikTok or X',
  reddit: 'Reddit',
  youtube: 'YouTube',
  appStore: 'App Store or Play Store',
  article: 'A blog or article',
  other: 'Somewhere else',
}

/**
 * Whether Home should ask where a new account heard about us: never answered,
 * and only once the extras card is out of the way, so Home asks one thing at a time.
 */
export function heardFromUnasked(user: UserProfile | null | undefined): boolean {
  return !!user?.onboardedAt && !user.heardFrom && !!user.createdAt && new Date(user.createdAt) >= OPT_IN_SINCE && !extrasUnchosen(user)
}

const noop = () => () => {}
const parse = (raw: string) => raw === '1'
const serialize = (value: boolean) => (value ? '1' : '0')

/**
 * A Home card, asked once after setup rather than during it, so it never
 * stands between a new account and its budget. One click answers it.
 */
export function HeardFrom() {
  const user = useUser().data
  const updateUser = useUpdateUser()
  const reduce = useReducedMotion()
  const phase = useButtonPhase()
  // Held back through hydration: the server can't know it was dismissed.
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const [dismissed, setDismissed] = usePersistentState('heard-from-dismissed', false, parse, serialize)
  // The answer lands in the cached profile at once, which would drop the card
  // before its check plays; `held` keeps it up until then.
  const [held, setHeld] = useState(false)
  const [gone, setGone] = useState(false)
  const show = hydrated && !gone && !dismissed && (held || heardFromUnasked(user))

  function answer(picked: Source) {
    if (phase.success) return
    track('onboarding_heard_from', { source: picked })
    setHeld(true)
    // A failed save isn't worth bothering anyone about: the event above already has the answer.
    updateUser.mutate({ heardFrom: picked })
    phase.succeed(() => setGone(true))
  }

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div key="heard-from" exit={slideAway(reduce)}>
          <article className="erd-card home-ask-card">
            {phase.success ? (
              <p className="home-ask-thanks"><CheckIcon color="var(--mint)" size={18} /> Thanks, that helps.</p>
            ) : (
              <>
                <h3 className="home-ask-title">Where did you hear about us?</h3>
                <p className="home-ask-blurb">One click. It helps us find more people like you.</p>
                <div className="setup-quick-row home-ask-chips">
                  {(Object.keys(HEARD_FROM_LABELS) as Source[]).map((key) => (
                    <button key={key} type="button" className="setup-chip" onClick={() => answer(key)}>
                      {HEARD_FROM_LABELS[key]}
                    </button>
                  ))}
                </div>
                <div className="home-ask-actions">
                  <button type="button" className="home-ask-dismiss" onClick={() => setDismissed(true)}>Not now</button>
                </div>
              </>
            )}
          </article>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
