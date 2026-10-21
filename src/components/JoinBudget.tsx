'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { spacesKey, useSpaces } from '../hooks/useSpaces'
import { useUser } from '../hooks/useUser'
import { firstName } from '../hooks/useAuthors'
import { joinBudget, previewInvite, type InvitePreview } from '../api/spaces'
import { HttpError, setBudgetCookie } from '../api/client'
import { setReturnTo } from '../lib/returnTo'
import { Scrim, Sheet } from './MotionSheet'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { BudgetIcon } from './CategoryIcon'
import { MemberAvatar } from './BudgetMembers'
import { CodeTiles } from './CodeTiles'

const GENERIC = 'Check your connection and try again.'
const TOO_MANY = "That's a lot of tries. Give it a minute, then try again."
/** The 429 from /api/join gets its own line; anything else is the generic one. */
export const tryAgainCopy = (err: unknown) => (err instanceof HttpError && err.status === 429 ? TOO_MANY : GENERIC)
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
  return tryAgainCopy(err)
}

/** How many people are already in the budget you're about to join. */
export function whoIsIn(members: number | undefined, inviter: string | null | undefined): string | null {
  if (!members) return null
  return members === 1 ? `Just ${inviter || 'the owner'} so far` : `${members} people already in`
}

// The add-success burst's dots and dashes, around your face as it lands.
const SPLASH = [0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => ({ angle, dash: i % 2 === 1, delay: [40, 110, 60, 150, 80, 130, 50, 120][i] }))

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

/**
 * The invitation (who invited you, who's in), then the POST, the shared check,
 * and a welcome where your face drops in next to everyone's. Signed out (401)
 * goes to sign in and comes back.
 */
export function JoinConfirm({ code, preview, limit, onCancel }: { code: string; preview: Previewed; limit?: number; onCancel: () => void }) {
  const queryClient = useQueryClient()
  const { budgets } = useSpaces()
  const me = useUser().data?._id
  const button = useButtonPhase()
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<string | null>(null)
  const budget = preview.budget

  async function join() {
    button.start()
    setError('')
    try {
      const { spaceId } = await joinBudget(code)
      // In it now. Someone with no budget of their own would otherwise be
      // switched (a reload) into it by useSpaces, before the welcome shows.
      setBudgetCookie(spaceId)
      // Fresh members for the welcome, you included.
      await queryClient.refetchQueries({ queryKey: spacesKey }).catch(() => {})
      button.succeed(() => setJoined(spaceId))
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) return signInToJoin(code)
      setError(joinError(err, preview, limit))
      button.fail()
    }
  }

  if (joined) {
    const members = budgets.find((b) => b.id === joined)?.members ?? []
    const mine = members.find((m) => m.userId === me)
    const others = members.filter((m) => m.userId !== me).slice(0, 4)
    const name = firstName(mine?.name)
    const title = name ? `You're in, ${name}` : "You're in"
    return (
      <Scrim className="erd-modal-overlay" onClick={() => openBudget(joined)}>
        <Sheet className="erd-modal-card join-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <span className="join-hero"><BudgetIcon budget={budget} size={36} /></span>
          <h3 className="archive-confirm-title">{title}</h3>
          <p className="account-row-meta">{`Everything anyone logs in ${budget.name} lands here, and you'll see who added what.`}</p>
          <div className="join-faces">
            {others.map((m) => <MemberAvatar key={m.userId} member={m} size={36} className="budget-avatar join-face" />)}
            <span className="join-you" data-testid="join-you">
              <MemberAvatar member={mine ?? { name: 'You', avatarUrl: null }} size={36} className="budget-avatar join-face" />
              <span className="join-splash" aria-hidden="true">
                {SPLASH.map((p) => (
                  <i key={p.angle} className={p.dash ? 'is-dash' : undefined} style={{ '--a': `${p.angle}deg`, '--d': `${p.delay}ms` } as React.CSSProperties} />
                ))}
              </span>
            </span>
          </div>
          <p className="join-tip">Switch budgets any time from the budget menu.</p>
          <div className="archive-confirm-actions">
            <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={() => openBudget(joined)} autoFocus>
              {"Let's go"}
            </button>
          </div>
        </Sheet>
      </Scrim>
    )
  }

  const title = preview.inviter ? `${preview.inviter} invited you to ${budget.name}` : `You're invited to ${budget.name}`
  const who = whoIsIn(preview.members, preview.inviter)
  return (
    <Scrim className="erd-modal-overlay" onClick={() => { if (!button.saving && !button.success) onCancel() }}>
      <Sheet className="erd-modal-card join-sheet" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="join-hero"><BudgetIcon budget={budget} size={36} /></span>
        <h3 className="archive-confirm-title">{title}</h3>
        {who && <p className="join-who">{who}</p>}
        <p className="account-row-meta">Your own budget stays exactly as it is.</p>
        {error && <p className="erd-log-error" role="alert">{error}</p>}
        <div className="archive-confirm-actions">
          <button type="button" className="account-pill-btn" onClick={onCancel} disabled={button.saving || button.success}>Not now</button>
          <SuccessButton
            type="button"
            baseClass="account-pill-btn account-pill-btn--primary"
            saving={button.saving}
            success={button.success}
            savingLabel="Joining…"
            successLabel="Joined"
            onClick={() => void join()}
            disabled={button.saving || button.success}
          >
            {`Join ${budget.name}`}
          </SuccessButton>
        </div>
      </Sheet>
    </Scrim>
  )
}

/** The switcher's "Join with a code": type the 6 characters, see what it's for, join. */
export function JoinCodeDialog({ memberOf, limit, onClose }: { memberOf: (id: string) => boolean; limit?: number; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // With the code it came from: the tiles can change while a lookup is out.
  const [preview, setPreview] = useState<{ code: string; invite: Previewed } | null>(null)
  // The code that matched nothing, so the tiles shake once per wrong code.
  const [wrong, setWrong] = useState('')

  async function lookup(value: string) {
    if (value.length !== CODE_LENGTH || busy) return
    setBusy(true)
    setError('')
    try {
      const p = await previewInvite(value)
      const blocked = inviteBlocked(p)
      if (p.status === 'not_found') setWrong(value)
      if (blocked) setError(blocked)
      else if (p.status !== 'not_found' && memberOf(p.budget.id)) return openBudget(p.budget.id)
      else setPreview({ code: value, invite: p as Previewed })
    } catch (err) {
      setError(tryAgainCopy(err))
    }
    setBusy(false)
  }

  if (preview) return <JoinConfirm code={preview.code} preview={preview.invite} limit={limit} onCancel={onClose} />
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card budget-sheet" role="dialog" aria-modal="true" aria-label="Join with a code" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => { e.preventDefault(); void lookup(code) }}>
          <div className="erd-modal-head">
            <h3>Join with a code</h3>
            <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <p className="account-row-meta">Got a code from someone? Pop it in here.</p>
          <label className="erd-log-label" htmlFor="join-code" style={{ display: 'block' }}>Invite code</label>
          <CodeTiles
            id="join-code"
            value={code}
            length={CODE_LENGTH}
            error={!!wrong && wrong === code}
            shakeFor={wrong}
            autoFocus
            onChange={(text) => {
              const next = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
              setCode(next)
              setError('')
              // The last letter looks it up: no need to reach for Next.
              if (next.length === CODE_LENGTH && next !== code) void lookup(next)
            }}
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
