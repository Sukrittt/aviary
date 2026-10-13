'use client'

import { useState } from 'react'
import { BrainIcon, GiftIcon, ChartLineIcon, ReceiptIcon, ScanIcon, TrendUpIcon, type PhosphorIcon } from '@/src/components/icons'
import { useUpdateUser, useUser } from '@/src/hooks/useUser'
import { FEATURE_LABELS, OPT_IN_FEATURES, hiddenFeatures, type HideableFeature } from '@/src/lib/features'
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

/**
 * Setup's last screen: every extra a new account starts without, each one
 * line, so nobody has to stumble on them later. The budget is already saved,
 * so leaving here keeps the defaults.
 */
export function PickExtras({ onDone }: { onDone: () => void }) {
  const user = useUser().data
  const updateUser = useUpdateUser()
  // Always starts with nothing picked: this screen is the opt-in, whatever the account's default.
  const [on, setOn] = useState<Set<HideableFeature>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  function flip(key: HideableFeature) {
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Waits for the save before leaving: leaving unmounts this, which would drop a failure silently.
  async function finish() {
    if (saving) return
    if (failed) return onDone()
    setSaving(true)
    // Saved even when nothing's picked, so the choice sticks whatever the account's age.
    const coreHidden = hiddenFeatures(user).filter((k) => !OPT_IN_FEATURES.includes(k))
    track('onboarding_extras_chosen', { extras: [...on].join(','), count: on.size })
    try {
      await updateUser.mutateAsync({ hiddenFeatures: [...coreHidden, ...OPT_IN_FEATURES.filter((k) => !on.has(k))] })
    } catch {
      setSaving(false)
      setFailed(true)
      return
    }
    onDone()
  }

  return (
    <div className="setup-done">
      <h1 className="setup-done-title">Want any extras?</h1>
      <p className="setup-done-blurb">Your budget works without them. Switch on what sounds useful. You can change this anytime in Features.</p>
      <div className="setup-done-list">
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
              onChange={() => flip(key)}
            />
          </label>
        ))}
      </div>
      {failed && <p className="setup-done-blurb" role="alert">Couldn&apos;t save your extras. Turn them on anytime from Account, then Features.</p>}
      <button type="button" className="setup-cta" onClick={finish} disabled={saving}>
        {saving ? 'Saving…' : failed ? 'Continue' : on.size ? 'Start budgeting' : 'Skip for now'}
      </button>
    </div>
  )
}
