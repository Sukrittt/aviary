'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useSpaces } from '../hooks/useSpaces'
import { joinBudget, previewInvite, type InvitePreview } from '../api/spaces'
import { HttpError, setBudgetCookie } from '../api/client'
import { setReturnTo } from '../lib/returnTo'
import { Scrim, Sheet } from './MotionSheet'
import { ConfirmDialog } from './ConfirmDialog'

const GENERIC = 'Check your connection and try again.'
export const CODE_LENGTH = 6

type Previewed = Exclude<InvitePreview, { status: 'not_found' }>

/** Why this invite can't be used, or null when it can. */
export function inviteBlocked(preview: InvitePreview): string | null {
  if (preview.status === 'not_found') return "We can't find that invite. Check the code and try again."
  if (preview.status === 'expired' || preview.status === 'cancelled') return `This invite has expired. Ask ${preview.inviter ?? 'whoever sent it'} for a new one.`
  return null
}

export function joinError(err: unknown, preview: Previewed, limit = 5): string {
  if (err instanceof HttpError) {
    if (err.message === 'LIMIT_REACHED') return `You're at ${limit} budgets. Leave one to join.`
    if (err.message === 'FULL') return `${preview.budget.name} is full. 6 people is the most a budget can have.`
    if (err.message === 'EXPIRED') return inviteBlocked({ ...preview, status: 'expired' })!
    if (err.message === 'NOT_FOUND') return inviteBlocked({ status: 'not_found' })!
  }
  return GENERIC
}

/** Into the budget, on the home screen. A full load: everything on screen belongs to the old budget. */
export function openBudget(spaceId: string): void {
  setBudgetCookie(spaceId)
  window.location.assign('/expense')
}

/** Off to sign in, and back here after. */
export function signInToJoin(code: string): void {
  setReturnTo(`/join/${code}`)
  window.location.assign('/sign-in')
}

/** "Join Home budget?" then the POST. Signed out (401) goes to sign in and comes back. */
export function JoinConfirm({ code, preview, limit, onCancel }: { code: string; preview: Previewed; limit?: number; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function join() {
    setBusy(true)
    setError('')
    try {
      const { spaceId } = await joinBudget(code)
      openBudget(spaceId)
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) return signInToJoin(code)
      setError(joinError(err, preview, limit))
      setBusy(false)
    }
  }
  const name = `${preview.budget.name} budget`
  return (
    <ConfirmDialog title={`Join ${name}?`} body="Your own budget stays exactly as it is." cancelLabel="Not now" onCancel={onCancel} busy={busy}>
      {error ? (
        <p className="erd-log-error" role="alert">{error}</p>
      ) : (
        <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={() => void join()} disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      )}
    </ConfirmDialog>
  )
}

/** The switcher's "Join with a code": type the 6 characters, see what it's for, join. */
export function JoinCodeDialog({ memberOf, limit, onClose }: { memberOf: (id: string) => boolean; limit?: number; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Previewed | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setError('')
    try {
      const p = await previewInvite(code)
      const blocked = inviteBlocked(p)
      if (blocked) setError(blocked)
      else if (p.status !== 'not_found' && memberOf(p.budget.id)) return openBudget(p.budget.id)
      else setPreview(p as Previewed)
    } catch {
      setError(GENERIC)
    }
    setBusy(false)
  }

  if (preview) return <JoinConfirm code={code} preview={preview} limit={limit} onCancel={onClose} />
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card budget-sheet" role="dialog" aria-modal="true" aria-label="Join with a code" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="erd-modal-head">
            <h3>Join with a code</h3>
            <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <p className="account-row-meta">Got a code from someone? Pop it in here.</p>
          <label className="erd-log-label" htmlFor="join-code" style={{ display: 'block' }}>Invite code</label>
          <input
            id="join-code"
            className="erd-log-input budget-code-input"
            style={{ marginTop: 0 }}
            value={code}
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoFocus
          />
          {error && <p className="erd-log-error" role="alert">{error}</p>}
          <div className="archive-confirm-actions">
            <button type="button" className="account-pill-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="account-pill-btn account-pill-btn--primary" disabled={code.length !== CODE_LENGTH || busy}>
              {busy ? 'Checking…' : 'Next'}
            </button>
          </div>
        </form>
      </Sheet>
    </Scrim>
  )
}

/** Account page's "Join with a code" row, for someone who can't see the switcher yet. */
export function JoinCodeEntry({ render }: { render: (open: () => void) => React.ReactNode }) {
  const { budgets, limit, canCreate } = useSpaces()
  const [open, setOpen] = useState(false)
  if (!canCreate) return null
  return (
    <>
      {render(() => setOpen(true))}
      <AnimatePresence>{open && <JoinCodeDialog memberOf={(id) => budgets.some((b) => b.id === id)} limit={limit} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}
