'use client'

import { useOptionalMoneyBrain } from '@/components/moneyBrainContext'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { track } from '@/src/lib/analytics'

/**
 * Home's pointer to typing several spends into Ask Aviary at once, which is
 * otherwise only behind a link in manual entry. Shown until tried or waved off,
 * remembered in this browser.
 */
export function CaptureTipCard() {
  const brain = useOptionalMoneyBrain()
  const [seen, setSeen] = usePersistentState('capture-tip-seen', false, (v) => v === 'true', String)
  if (!brain || seen) return null

  return (
    <article className="erd-card balance-prompt" aria-label="Log several at once">
      <h2>Spent on a few things?</h2>
      <p>Dump them all in Ask Aviary, like “auto 240, lunch 150, chai 20”. We&apos;ll log them in one go.</p>
      <div className="balance-prompt-actions">
        <button
          type="button"
          className="action-button is-active erd-accent-action"
          onClick={() => {
            track('capture_tip', { action: 'try' })
            setSeen(true)
            brain.openCapture()
          }}
        >
          Try it
        </button>
        <button
          type="button"
          className="action-button is-ghost"
          onClick={() => {
            track('capture_tip', { action: 'dismiss' })
            setSeen(true)
          }}
        >
          Got it
        </button>
      </div>
    </article>
  )
}
