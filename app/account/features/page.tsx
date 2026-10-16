'use client'

import { useState } from 'react'
import { useUpdateUser, useUser } from '@/src/hooks/useUser'
import { FEATURE_LABELS, FEATURE_ORDER, hiddenFeatures, type HideableFeature } from '@/src/lib/features'

// Twin of Mobile's app/account/features.tsx.
export default function FeaturesPage() {
  const user = useUser().data
  const updateUser = useUpdateUser()
  const [failed, setFailed] = useState(false)

  // Local copy so rapid flips build on each other, not on a response still in flight.
  const [local, setLocal] = useState<HideableFeature[] | null>(null)
  const hidden = local ?? (user ? hiddenFeatures(user) : null)

  function setShown(key: HideableFeature, shown: boolean) {
    const rest = (hidden ?? []).filter((k) => k !== key)
    const next = shown ? rest : [...rest, key]
    setLocal(next)
    setFailed(false)
    updateUser.mutate(
      { hiddenFeatures: next },
      {
        onError: () => {
          // Undo only this flip, so other flips made meanwhile stay put.
          setLocal((cur) => {
            const without = (cur ?? next).filter((k) => k !== key)
            return shown ? [...without, key] : without
          })
          setFailed(true)
        },
      },
    )
  }

  return (
    <div>
      <div className="account-section-label" style={{ marginBottom: 10 }}>
        Features
      </div>
      <div className="account-card">
        {FEATURE_ORDER.map((key) => (
          <label key={key} className="account-row">
            <span className="account-row-label">
              {FEATURE_LABELS[key].label}
              <span className="account-row-hint">{FEATURE_LABELS[key].hint}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="account-switch"
              aria-label={`Show ${FEATURE_LABELS[key].label}`}
              checked={!hidden?.includes(key)}
              disabled={!hidden}
              onChange={(e) => setShown(key, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <div className="account-card" style={{ marginTop: 16 }}>
        <label className="account-row">
          <span className="account-row-label">
            Feed view in Activity
            <span className="account-row-hint">Scroll your expenses like a photo feed</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="account-switch"
            aria-label="Feed view in Activity"
            checked={user?.activityFeed === true}
            disabled={!user}
            onChange={(e) => {
              setFailed(false)
              updateUser.mutate({ activityFeed: e.target.checked }, { onError: () => setFailed(true) })
            }}
          />
        </label>
      </div>
      {failed && <div className="account-confirm-copy" role="alert">Couldn&apos;t save. Check your connection and try again.</div>}
      <p className="account-row-hint" style={{ marginTop: 10 }}>
        Turn off what you don&apos;t use. Hiding a feature keeps its data, so you can turn it back on anytime.
      </p>
    </div>
  )
}
