'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AnimatePresence } from 'motion/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretRightIcon, UserPlusIcon } from '@/src/components/icons'
import {
  cancelInvite, createInvite, deleteBudget, getMembers, removeMember, renameBudget, setNotifyOthers, switchBudget, transferBudget,
  type BudgetMember, type BudgetSummary, type Invite,
} from '../api/spaces'
import { HttpError } from '../api/client'
import { spacesKey, useSpaces } from '../hooks/useSpaces'
import { firstName } from '../hooks/useAuthors'
import { useUser } from '../hooks/useUser'
import { Scrim, Sheet } from './MotionSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { SuccessButton, useButtonPhase } from './SuccessButton'

const GENERIC = 'Check your connection and try again.'

/** A member's photo, or their initial. */
export function MemberAvatar({ member, size = 20, className = 'budget-avatar' }: { member: Pick<BudgetMember, 'name' | 'avatarUrl'> | undefined; size?: number; className?: string }) {
  if (member?.avatarUrl) return <Image className={className} src={member.avatarUrl} alt="" width={size} height={size} unoptimized />
  return <span className={className} style={{ width: size, height: size }}>{(member?.name ?? '?').charAt(0).toUpperCase()}</span>
}

const joinedOn = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** The share message the owner sends. */
export const inviteMessage = (budgetName: string, invite: Invite) => `Join our ${budgetName} budget on Aviary: ${invite.url} (code ${invite.code})`

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** "Copy" that says "Copied" for a beat. */
function CopyButton({ text, label, className = 'account-pill-btn' }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        setState((await copy(text)) ? 'copied' : 'failed')
        setTimeout(() => setState('idle'), 1500)
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : label}
    </button>
  )
}

function actionError(err: unknown, budgetName: string): string {
  if (err instanceof HttpError) {
    if (err.message === 'FULL') return `${budgetName} is full. 6 people is the most a budget can have.`
    if (err.message === 'NOT_OWNER') return 'Only the owner can do that.'
    if (err.status === 402) return 'That needs an active plan.'
  }
  return GENERIC
}

type Confirm = { kind: 'leave' } | { kind: 'remove'; member: BudgetMember } | { kind: 'delete' } | { kind: 'pick-owner' } | { kind: 'transfer'; member: BudgetMember }

/**
 * A budget's settings: who's in it, invites, rename, leave or delete. Opened
 * from a row in the budget switcher, or from the account page for the open one.
 */
export function BudgetMembersDialog({ budget, onClose }: { budget: BudgetSummary; onClose: () => void }) {
  const qc = useQueryClient()
  const { budgets, active } = useSpaces()
  const me = useUser().data?._id
  const key = ['space-members', budget.id]
  const q = useQuery({ queryKey: key, queryFn: () => getMembers(budget.id), staleTime: 10_000 })
  const owner = budget.role === 'owner'
  const members = q.data?.members ?? budget.members
  const invites = q.data?.invites ?? []
  const [name, setName] = useState(budget.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState<Invite | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [notify, setNotify] = useState<boolean | null>(null)
  const notifyOn = notify ?? q.data?.notifyOthers ?? false

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key })
    void qc.invalidateQueries({ queryKey: spacesKey })
  }

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
      refresh()
      after?.()
    } catch (err) {
      setError(actionError(err, budget.name))
    } finally {
      setBusy(false)
    }
  }

  /** Out of this budget: if it was the open one, land in your own (or the first one left). */
  function leftBudget() {
    if (active?.id !== budget.id) return onClose()
    const next = budgets.find((b) => b.personal && b.id !== budget.id) ?? budgets.find((b) => b.id !== budget.id)
    switchBudget(next ?? { id: '', personal: true })
  }

  const renamed = name.trim() && name.trim() !== budget.name

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card budget-sheet budget-members" role="dialog" aria-modal="true" aria-label={`${budget.name} budget settings`} onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>{`${budget.emoji} ${budget.name}`}</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {owner && (
          <form className="budget-rename" onSubmit={(e) => { e.preventDefault(); if (renamed) void run(() => renameBudget(budget.id, name.trim())) }}>
            <label className="erd-log-label" htmlFor="budget-rename">Name</label>
            <div className="budget-rename-row">
              <input id="budget-rename" className="erd-log-input" style={{ marginTop: 0 }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              {renamed && <button type="submit" className="account-pill-btn account-pill-btn--primary" disabled={busy}>Save</button>}
            </div>
          </form>
        )}

        <div className="budget-members-head">
          <div className="erd-log-label">{`Members · ${members.length} of 6`}</div>
          {owner && members.length < 6 && (
            <button type="button" className="account-pill-btn account-pill-btn--primary" disabled={busy} onClick={() => void run(async () => setSharing(await createInvite(budget.id)))}>
              <UserPlusIcon size={14} aria-hidden="true" /> Invite
            </button>
          )}
        </div>
        <ul className="budget-list budget-member-list">
          {members.map((m) => (
            <li key={m.userId} className="budget-member">
              <MemberAvatar member={m} size={32} className="budget-avatar is-large" />
              <span className="budget-member-body">
                <span className="budget-row-name">{m.userId === me ? `${m.name ?? 'You'} (you)` : m.name ?? 'Someone'}</span>
                <span className="account-row-hint">{m.joinedAt ? `Joined ${joinedOn(m.joinedAt)}` : 'Started this budget'}</span>
              </span>
              {m.role === 'owner' ? (
                <span className="budget-owner-badge">Owner</span>
              ) : owner ? (
                <button type="button" className="account-pill-btn" disabled={busy} onClick={() => setConfirm({ kind: 'remove', member: m })}>Remove</button>
              ) : (
                <span className="budget-member-role">Member</span>
              )}
            </li>
          ))}
        </ul>

        {owner && invites.length > 0 && (
          <>
            <div className="erd-log-label">Waiting to join</div>
            <ul className="budget-list">
              {invites.map((inv) => (
                <li key={inv.code} className="budget-member">
                  <span className="budget-member-body">
                    <span className="budget-row-name budget-code-small">{inv.code}</span>
                    <span className="account-row-hint">{`Expires ${joinedOn(inv.expiresAt)}`}</span>
                  </span>
                  <CopyButton text={inviteMessage(budget.name, inv)} label="Copy again" />
                  <button type="button" className="account-pill-btn" disabled={busy} onClick={() => void run(() => cancelInvite(budget.id, inv.code))}>Cancel</button>
                </li>
              ))}
            </ul>
          </>
        )}

        {members.length > 1 && (
          <label className="account-row budget-copy">
            <span className="account-row-label">
              Tell me when others log
              <span className="account-row-hint">A ping each time someone else adds an expense here.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="account-switch"
              checked={notifyOn}
              disabled={busy || !q.data}
              onChange={(e) => {
                const on = e.target.checked
                setNotify(on)
                void run(() => setNotifyOthers(budget.id, on).catch((err) => { setNotify(!on); throw err }))
              }}
            />
          </label>
        )}

        {error && <p className="erd-log-error" role="alert">{error}</p>}

        {owner && !budget.personal && members.length > 1 && (
          <button type="button" className="account-row budget-copy" disabled={busy} onClick={() => setConfirm({ kind: 'pick-owner' })}>
            <span className="account-row-label">
              Make someone else the owner
              <span className="account-row-hint">They take over the plan. You stay in it.</span>
            </span>
            <CaretRightIcon size={14} aria-hidden="true" />
          </button>
        )}
        {owner && budget.personal && members.length > 1 && <p className="account-row-hint budget-copy">Your personal budget stays yours.</p>}

        <div className="budget-members-danger">
          {!owner && <button type="button" className="account-danger-btn" disabled={busy} onClick={() => setConfirm({ kind: 'leave' })}>Leave budget</button>}
          {owner && !budget.personal && <button type="button" className="account-danger-btn" disabled={busy} onClick={() => setConfirm({ kind: 'delete' })}>Delete budget</button>}
        </div>
      </Sheet>

      <AnimatePresence>
        {sharing && <InviteDialog budgetName={budget.name} invite={sharing} onClose={() => setSharing(null)} />}
        {confirm?.kind === 'leave' && (
          <ConfirmDialog
            title={`Leave ${budget.name} budget?`}
            body={`You'll lose access to ${budget.name} budget. Expenses you logged stay in it.`}
            cancelLabel="Stay"
            busy={busy}
            onCancel={() => setConfirm(null)}
          >
            <button type="button" className="account-danger-btn" disabled={busy} onClick={() => void run(() => removeMember(budget.id, 'me'), () => { setConfirm(null); leftBudget() })}>
              Leave
            </button>
          </ConfirmDialog>
        )}
        {confirm?.kind === 'remove' && (
          <ConfirmDialog
            title={`Remove ${firstName(confirm.member.name) ?? 'them'}?`}
            body={`${firstName(confirm.member.name) ?? 'They'} loses access to ${budget.name}. What they logged stays.`}
            cancelLabel="Keep"
            busy={busy}
            onCancel={() => setConfirm(null)}
          >
            <button type="button" className="account-danger-btn" disabled={busy} onClick={() => void run(() => removeMember(budget.id, confirm.member.userId), () => setConfirm(null))}>
              Remove
            </button>
          </ConfirmDialog>
        )}
        {confirm?.kind === 'pick-owner' && (
          <PickOwnerDialog members={members.filter((m) => m.role !== 'owner')} onPick={(member) => setConfirm({ kind: 'transfer', member })} onClose={() => setConfirm(null)} />
        )}
        {confirm?.kind === 'transfer' && <TransferDialog budget={budget} member={confirm.member} onCancel={() => setConfirm(null)} onDone={() => { refresh(); setConfirm(null); onClose() }} />}
        {confirm?.kind === 'delete' && <DeleteBudgetDialog budget={budget} onCancel={() => setConfirm(null)} onDeleted={() => { refresh(); setConfirm(null); leftBudget() }} />}
      </AnimatePresence>
    </Scrim>
  )
}

function InviteDialog({ budgetName, invite, onClose }: { budgetName: string; invite: Invite; onClose: () => void }) {
  const message = inviteMessage(budgetName, invite)
  return (
    <Scrim className="erd-modal-overlay" style={{ zIndex: 210 }} onClick={onClose}>
      <Sheet className="erd-modal-card budget-sheet" role="dialog" aria-modal="true" aria-label="Invite someone" onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>Invite someone</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="account-row-meta">Send them the link, or read out the code. It works once and lasts 7 days.</p>
        <p className="budget-code" aria-label={`Invite code ${invite.code.split('').join(' ')}`}>{invite.code}</p>
        <div className="budget-share-actions">
          <CopyButton text={invite.code} label="Copy code" />
          <CopyButton text={invite.url} label="Copy link" />
        </div>
        <div className="erd-log-label">Ready to send</div>
        <p className="budget-share-message">{message}</p>
        <div className="archive-confirm-actions">
          <CopyButton text={message} label="Copy message" className="account-pill-btn account-pill-btn--primary" />
        </div>
      </Sheet>
    </Scrim>
  )
}

function PickOwnerDialog({ members, onPick, onClose }: { members: BudgetMember[]; onPick: (m: BudgetMember) => void; onClose: () => void }) {
  return (
    <Scrim className="erd-modal-overlay" style={{ zIndex: 210 }} onClick={onClose}>
      <Sheet className="erd-modal-card budget-sheet" role="dialog" aria-modal="true" aria-label="Who's the new owner?" onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>Who&apos;s the new owner?</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul className="budget-list">
          {members.map((m) => (
            <li key={m.userId}>
              <button type="button" className="budget-row" onClick={() => onPick(m)}>
                <MemberAvatar member={m} />
                <span className="budget-row-name">{m.name ?? 'Someone'}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </Scrim>
  )
}

function TransferDialog({ budget, member, onCancel, onDone }: { budget: BudgetSummary; member: BudgetMember; onCancel: () => void; onDone: () => void }) {
  const button = useButtonPhase()
  const busy = button.saving || button.success
  const [error, setError] = useState('')
  const who = firstName(member.name) ?? 'They'

  async function submit() {
    if (busy) return
    setError('')
    button.start()
    try {
      await transferBudget(budget.id, member.userId)
      button.succeed(onDone)
    } catch (err) {
      button.fail()
      setError(err instanceof HttpError && err.message === 'INVALID' ? `${who} needs to be in ${budget.name} first.` : actionError(err, budget.name))
    }
  }

  return (
    <ConfirmDialog
      title={`Make ${who} the owner of ${budget.name}?`}
      body={`${who}'s plan covers ${budget.name} from now on, and only they can invite, remove or delete. You stay in it.`}
      cancelLabel="Keep it"
      busy={busy}
      onCancel={onCancel}
    >
      <SuccessButton
        type="button"
        className="is-active erd-accent-action"
        saving={button.saving}
        success={button.success}
        savingLabel="Handing over…"
        successLabel="Done"
        disabled={busy}
        onClick={() => void submit()}
      >
        {`Make ${who} owner`}
      </SuccessButton>
      {error && <p className="erd-log-error" role="alert">{error}</p>}
    </ConfirmDialog>
  )
}

function DeleteBudgetDialog({ budget, onCancel, onDeleted }: { budget: BudgetSummary; onCancel: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = typed.trim().toLowerCase() === budget.name.trim().toLowerCase()

  async function submit() {
    if (!matches || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteBudget(budget.id, typed.trim())
      onDeleted()
    } catch (err) {
      setError(err instanceof HttpError && err.message === 'INVALID' ? "That name doesn't match. Type it just as it's shown." : GENERIC)
      setBusy(false)
    }
  }

  return (
    <Scrim className="erd-modal-overlay" style={{ zIndex: 210 }} onClick={busy ? undefined : onCancel}>
      <Sheet className="erd-modal-card archive-confirm" role="alertdialog" aria-modal="true" aria-label={`Delete ${budget.name} budget?`} onClick={(e) => e.stopPropagation()}>
        <h3 className="archive-confirm-title">{`Delete ${budget.name} budget?`}</h3>
        <p className="account-row-meta">{`Everyone in it loses access, you included. You can restore it for 30 days.`}</p>
        <label className="erd-log-label" htmlFor="budget-delete-name" style={{ display: 'block' }}>{`Type ${budget.name} to confirm`}</label>
        <input id="budget-delete-name" className="erd-log-input" style={{ marginTop: 0 }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        {error && <p className="erd-log-error" role="alert">{error}</p>}
        <div className="archive-confirm-actions">
          <button type="button" className="account-pill-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="account-danger-btn" onClick={() => void submit()} disabled={!matches || busy}>
            {busy ? 'Deleting…' : 'Delete budget'}
          </button>
        </div>
      </Sheet>
    </Scrim>
  )
}

/** Account page's "Members" row for the open budget. */
export function BudgetMembersEntry({ render }: { render: (open: () => void, budget: BudgetSummary) => React.ReactNode }) {
  const { active } = useSpaces()
  const [open, setOpen] = useState(false)
  if (!active) return null
  return (
    <>
      {render(() => setOpen(true), active)}
      <AnimatePresence>{open && <BudgetMembersDialog budget={active} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}
