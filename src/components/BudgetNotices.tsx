'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { BUDGET_READ_ONLY_EVENT, LOST_BUDGET_KEY } from '../api/client'
import { useSpaces } from '../hooks/useSpaces'
import { ownerName } from '../hooks/useAuthors'
import { Scrim, Sheet } from './MotionSheet'
import { LockIcon } from '@/src/components/icons'

/** The inline error when a write comes back 402. */
export const readOnlyMessage = (owner: string | null) =>
  `This budget is read-only until ${owner ?? 'its owner'} renews. Your data's safe, and export's always free.`

/** The standing strip at the top of the page: what the state means and when it ends. */
export const readOnlyBanner = (owner: string | null) =>
  `${owner ? `${owner}'s` : "The owner's"} plan has lapsed. You can view and export everything; logging comes back once they renew.`

/**
 * Maps a failed write to the read-only message, or null for any other error.
 * A member's 402 can only be BUDGET_READ_ONLY: in a shared budget the owner's
 * plan is the one checked, so it's never "subscribe" for them.
 */
export function useReadOnlyError() {
  const { active } = useSpaces()
  return (err: unknown): string | null =>
    (err as { status?: number } | null)?.status === 402 && active?.role === 'member' ? readOnlyMessage(ownerName(active)) : null
}

const introKey = (id: string) => `aviary-budget-intro:${id}`

/**
 * Stands in for a write form when the budget is read-only: say why up front
 * instead of letting the form fail on submit.
 */
export function ReadOnlyNotice({ onClose }: { onClose: () => void }) {
  const { active } = useSpaces()
  return (
    <div className="budget-readonly-notice" role="status">
      <span className="budget-readonly-notice-icon"><LockIcon size={20} weight="fill" aria-hidden="true" /></span>
      <p className="budget-readonly-notice-title">This budget is read-only</p>
      <p className="budget-readonly-notice-text">{readOnlyBanner(ownerName(active))}</p>
      <button type="button" className="account-pill-btn" onClick={onClose}>Got it</button>
    </div>
  )
}

/** The notice as its own dialog, where a confirm (delete) would have opened. */
export function ReadOnlyDialog({ onClose }: { onClose: () => void }) {
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card" role="dialog" aria-modal="true" aria-label="This budget is read-only" onClick={(e) => e.stopPropagation()}>
        <ReadOnlyNotice onClose={onClose} />
      </Sheet>
    </Scrim>
  )
}

/** Budget-wide notices, mounted once per page by ExpenseSidebar. */
export function BudgetNotices() {
  return (
    <>
      <ReadOnlyBanner />
      <LostBudgetNotice />
      <JoinedIntro />
    </>
  )
}

/** The owner's plan lapsed: say so, and that nothing's lost. Also shows the moment a write comes back 402. */
export function ReadOnlyBanner() {
  const { active, readOnly } = useSpaces()
  const [flagged, setFlagged] = useState(false)
  useEffect(() => {
    const on = () => setFlagged(true)
    window.addEventListener(BUDGET_READ_ONLY_EVENT, on)
    return () => window.removeEventListener(BUDGET_READ_ONLY_EVENT, on)
  }, [])
  if (!active || !(readOnly || (flagged && active.role === 'member'))) return null
  return (
    <div className="budget-readonly-banner" role="status">
      <LockIcon size={14} weight="fill" aria-hidden="true" />
      <span className="budget-readonly-tag">Read-only</span>
      <span>{readOnlyBanner(ownerName(active))}</span>
    </div>
  )
}

/** After client.ts threw us out of a budget: "You're no longer in Home budget." or who deleted it. */
function LostBudgetNotice() {
  const { deleted, loaded } = useSpaces()
  const [lost, setLost] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LOST_BUDGET_KEY)
      // Read once after mount: sessionStorage doesn't exist on the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLost(JSON.parse(raw))
    } catch {
      // storage blocked or garbled: no notice
    }
  }, [])
  if (!lost || !loaded) return null
  const gone = deleted.find((d) => d.id === lost.id)
  const message = gone
    ? `${lost.name} budget was deleted${gone.deletedBy ? ` by ${gone.deletedBy}` : ''}.`
    : `You're no longer in ${lost.name} budget.`
  const dismiss = () => {
    sessionStorage.removeItem(LOST_BUDGET_KEY)
    setLost(null)
  }
  return (
    <AnimatePresence>
      <Scrim className="erd-modal-overlay" onClick={dismiss}>
        <Sheet className="erd-modal-card archive-confirm" role="alertdialog" aria-modal="true" aria-label={message} onClick={(e) => e.stopPropagation()}>
          <h3 className="archive-confirm-title">{message}</h3>
          <p className="account-row-meta">{gone ? 'Nothing else changed in your other budgets.' : 'What you logged there stays in it.'}</p>
          <div className="archive-confirm-actions">
            <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={dismiss} autoFocus>Got it</button>
          </div>
        </Sheet>
      </Scrim>
    </AnimatePresence>
  )
}

/** Two cards, once per joined budget: who you share it with, and where the switcher lives. */
function JoinedIntro() {
  const { active } = useSpaces()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [seen, setSeen] = useState(true)
  const id = active?.role === 'member' ? active.id : null
  useEffect(() => {
    if (!id) return
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeen(localStorage.getItem(introKey(id)) === '1')
    } catch {
      // storage blocked: skip the intro rather than show it every load
    }
  }, [id])
  // Card two points at the switcher chip.
  useEffect(() => {
    if (step !== 1 || seen) return
    const chips = document.querySelectorAll('.budget-chip')
    chips.forEach((c) => c.classList.add('is-pointed'))
    return () => chips.forEach((c) => c.classList.remove('is-pointed'))
  }, [step, seen])
  if (!id || !active || seen || step === 2) return null

  // Only shown to members, so the owner is always someone else.
  const lead = ownerName(active) ?? 'the owner'
  const rest = active.members.length - 2
  const who = rest > 0 ? `You, ${lead} and ${rest} more` : `You and ${lead}`
  const cards = [
    { title: `${who} share this budget`, body: "Everything anyone logs lands here, and you'll see who added what." },
    { title: 'Switch budgets from here', body: 'Tap the budget chip to hop between your budgets.' },
  ]
  const done = () => {
    try {
      localStorage.setItem(introKey(id), '1')
    } catch {
      // storage blocked
    }
    setStep(2)
  }
  const card = cards[step]
  return (
    <div className={`budget-intro${step === 1 ? ' is-pointing' : ''}`} role="dialog" aria-label={card.title}>
      <p className="budget-intro-step">{`${step + 1} of 2`}</p>
      <h3 className="archive-confirm-title">{card.title}</h3>
      <p className="account-row-meta">{card.body}</p>
      <div className="archive-confirm-actions">
        {step === 0 ? (
          <>
            <button type="button" className="account-pill-btn" onClick={done}>Skip</button>
            <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={() => setStep(1)}>Next</button>
          </>
        ) : (
          <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={done}>Got it</button>
        )}
      </div>
    </div>
  )
}
