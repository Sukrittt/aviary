'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BrainIcon, GiftIcon, ChartLineIcon, ReceiptIcon, ScanIcon, TrendUpIcon, type PhosphorIcon } from '@/src/components/icons'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useUpdateUser, useUser } from '@/src/hooks/useUser'
import { FEATURE_LABELS, OPT_IN_FEATURES, extrasUnchosen, hiddenFeatures, type HideableFeature } from '@/src/lib/features'
import { track } from '@/src/lib/analytics'

/** One line each for OPT_IN_FEATURES, in the order they're offered. Twin of Mobile's PickExtras.tsx. */
export const EXTRAS: { key: HideableFeature; icon: PhosphorIcon; pitch: string }[] = [
  { key: 'askAviary', icon: BrainIcon, pitch: 'Ask anything about your spending, in plain words' },
  { key: 'billScan', icon: ScanIcon, pitch: "Snap a receipt and it's logged for you" },
  { key: 'wrapped', icon: GiftIcon, pitch: 'A monthly story of your spending, with music' },
  { key: 'insights', icon: ChartLineIcon, pitch: 'Trends, a daily heatmap and where it all went' },
  { key: 'subscriptions', icon: ReceiptIcon, pitch: 'Every renewal in one place, with a heads-up first' },
  { key: 'investments', icon: TrendUpIcon, pitch: 'Your portfolio total at a glance' },
]

/** Home's ask cards leave like the rollover card: off to the right, then the gap below closes. */
export function slideAway(reduce: boolean | null) {
  return reduce ? { opacity: 0 } : {
    x: '100%', opacity: 0, height: 0, marginBottom: -20,
    transition: {
      x: { duration: 0.3, ease: [0.4, 0, 1, 1] },
      opacity: { duration: 0.3 },
      height: { delay: 0.22, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      marginBottom: { delay: 0.22, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
    },
  } as const
}

/**
 * Home's card for every extra a new account starts without, each one line, so
 * nobody has to stumble on them later. It used to be a setup screen; now it
 * waits on Home until the account makes a choice here or in Features, on any
 * device, so a choice anywhere retires it.
 */
export function PickExtras() {
  const user = useUser().data
  const updateUser = useUpdateUser()
  const reduce = useReducedMotion()
  const phase = useButtonPhase()
  // Always starts with nothing picked: this card is the opt-in, whatever the account's default.
  const [on, setOn] = useState<Set<HideableFeature>>(() => new Set())
  // Saving writes the choice to the cached profile straight away, which would
  // drop the card mid-check; `held` keeps it up until the check has played.
  const [held, setHeld] = useState(false)
  const [gone, setGone] = useState(false)
  const [failed, setFailed] = useState(false)
  const show = !gone && (held || extrasUnchosen(user))

  function flip(key: HideableFeature) {
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Saved even when nothing's picked, so the choice sticks and the card stays gone.
  async function save(chosen: Set<HideableFeature>) {
    if (phase.saving || phase.success) return
    const coreHidden = hiddenFeatures(user).filter((k) => !OPT_IN_FEATURES.includes(k))
    const patch = { hiddenFeatures: [...coreHidden, ...OPT_IN_FEATURES.filter((k) => !chosen.has(k))] }
    track('onboarding_extras_chosen', { extras: [...chosen].join(','), count: chosen.size })
    setFailed(false)
    if (!chosen.size) {
      setGone(true)
      updateUser.mutate(patch)
      return
    }
    setHeld(true)
    phase.start()
    try {
      await updateUser.mutateAsync(patch)
      phase.succeed(() => setGone(true))
    } catch {
      phase.fail()
      setHeld(false)
      setFailed(true)
    }
  }

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div key="extras" exit={slideAway(reduce)}>
          <article className="erd-card home-ask-card">
            <h3 className="home-ask-title">Want any extras?</h3>
            <p className="home-ask-blurb">Your budget works without them. Switch on what sounds useful.</p>
            <div className="setup-done-list home-ask-list">
              {EXTRAS.map(({ key, icon: Icon, pitch }) => (
                <label key={key} className="setup-done-row setup-extra-row">
                  <span className="setup-done-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="setup-extra-text">
                    <span className="setup-extra-label">{FEATURE_LABELS[key].label}</span>
                    <span className="setup-done-label">{pitch}</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="account-switch"
                    aria-label={`Turn on ${FEATURE_LABELS[key].label}`}
                    checked={on.has(key)}
                    // Locked once a save starts: a later flip would show but never be saved.
                    disabled={phase.saving || phase.success}
                    onChange={() => flip(key)}
                  />
                </label>
              ))}
            </div>
            {failed && <p className="home-ask-blurb" role="alert">Couldn&apos;t save your extras. Turn them on anytime from Account, then Features.</p>}
            <div className="home-ask-actions">
              <SuccessButton
                type="button"
                baseClass="setup-cta"
                className="home-ask-cta"
                disabled={!on.size || phase.saving || phase.success}
                saving={phase.saving}
                success={phase.success}
                successLabel="Turned on"
                onClick={() => void save(on)}
              >
                {on.size ? `Turn on ${on.size}` : 'Turn on'}
              </SuccessButton>
              <button type="button" className="home-ask-dismiss" disabled={phase.saving || phase.success} onClick={() => void save(new Set())}>
                Not now
              </button>
            </div>
          </article>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
