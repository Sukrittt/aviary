'use client'

import { useState } from 'react'
import { useUpdateUser } from '@/src/hooks/useUser'
import { track } from '@/src/lib/analytics'
import { Select } from '@/src/components/Select'
import type { HeardFrom as Source } from '@/lib/users'

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

/** Setup's very last screen, after the budget is saved, so skipping it costs nothing. */
export function HeardFrom({ onDone }: { onDone: () => void }) {
  const updateUser = useUpdateUser()
  const [picked, setPicked] = useState<Source | null>(null)
  const [saving, setSaving] = useState(false)

  async function finish() {
    if (saving) return
    if (!picked) return onDone()
    setSaving(true)
    track('onboarding_heard_from', { source: picked })
    // A failed save isn't worth stopping anyone for: the event above already has the answer.
    await updateUser.mutateAsync({ heardFrom: picked }).catch(() => {})
    onDone()
  }

  return (
    <div className="setup-done setup-heard">
      <h1 className="setup-done-title">Where did you hear about us?</h1>
      <p className="setup-done-blurb">Last one, promise. It helps us find more people like you.</p>
      <div className="setup-heard-field">
        <Select
          aria-label="Where you heard about us"
          placeholder="Pick one"
          value={picked ?? ''}
          onChange={(v) => setPicked(v as Source)}
          options={(Object.keys(HEARD_FROM_LABELS) as Source[]).map((key) => ({ value: key, label: HEARD_FROM_LABELS[key] }))}
        />
      </div>
      <button type="button" className="setup-cta" onClick={finish} disabled={saving}>
        {saving ? 'Saving…' : picked ? 'Start budgeting' : 'Skip for now'}
      </button>
    </div>
  )
}
