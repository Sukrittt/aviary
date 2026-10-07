'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import type { BalanceStatus } from '@/src/api/balanceChecks'
import { useBalanceStatus } from '@/src/hooks/useBalanceCheck'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { BalanceCheckModal } from './BalanceCheckModal'

export const SNOOZE_MS = 24 * 60 * 60 * 1000

function prompt(status: BalanceStatus): { title: string; body: string } {
  if (!status.anchor) {
    return {
      title: 'Weekly balance check',
      body: "Type your bank balances once a week. We'll catch the spends you didn't log.",
    }
  }
  if (status.open) {
    return { title: 'Finish your balance check', body: "Your last check found money you haven't explained yet." }
  }
  return { title: 'Time for a balance check', body: 'Open GPay or your bank app and type the balance. It takes ten seconds.' }
}

/**
 * Home's slot for the weekly balance check: a prompt when one is due (Later
 * hides it for a day, remembered in this browser and cleared on sign-out by
 * clearLocalPrefs), otherwise a slim meter of how much the user logged
 * themselves at the last check. Nothing at all until there's something to
 * say. Twin of Mobile's src/components/balance/BalanceCheckCard.tsx.
 */
export function BalanceCheckCard() {
  const status = useBalanceStatus().data
  const [snoozedUntil, setSnoozedUntil] = usePersistentState('balance-check-later', 0, Number, String)
  const [open, setOpen] = useState(false)
  // Read once per mount: a snooze set now is in the future either way, and a day-old one expires on the next visit.
  const [now] = useState(() => Date.now())

  let card = null
  if (status?.due && snoozedUntil <= now) {
    const { title, body } = prompt(status)
    card = (
      <article className="erd-card balance-prompt" aria-label={title}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="balance-prompt-actions">
          <button type="button" className="action-button is-active erd-accent-action" onClick={() => setOpen(true)}>Check now</button>
          <button type="button" className="action-button is-ghost" onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}>Later</button>
        </div>
      </article>
    )
  } else if (status && status.loggedPct !== null) {
    const pct = Math.max(0, Math.min(100, status.loggedPct))
    card = (
      <button type="button" className="balance-meter" onClick={() => setOpen(true)} aria-label={`${pct}% logged at your last check. Check your balance again`}>
        <span>{pct}% logged at your last check</span>
        <span className="balance-meter-track">
          <i data-testid="logged-meter-fill" className={pct >= 90 ? 'is-high' : ''} style={{ width: `${pct}%` }} />
        </span>
      </button>
    )
  }

  return (
    <>
      {card}
      <AnimatePresence>{open && <BalanceCheckModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}
