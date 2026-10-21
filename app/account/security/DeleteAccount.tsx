'use client'

import { useState } from 'react'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { getSharedBudgets, type OwnedSharedBudget } from '@/src/api/spaces'
import { BudgetIcon } from '@/src/components/CategoryIcon'

/** lib/archive.ts GRACE_DAYS: how long a deleted account (and the budgets it closed) can come back. */
const GRACE_DAYS = 7
const CLOSE = ''

/** Who a budget goes to. Unnamed members are told apart by the join date the member list shows. */
const handOffName = (m: OwnedSharedBudget['members'][number]) =>
  m.name ?? (m.joinedAt ? `whoever joined ${new Date(m.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'them')

/**
 * The account page's "Delete account" card. Owners of shared budgets first
 * pick who gets each one (or close it), then type their email to confirm.
 */
export function DeleteAccount({ email }: { email: string | undefined }) {
  const [step, setStep] = useState<'idle' | 'shared' | 'confirm'>('idle')
  const [shared, setShared] = useState<OwnedSharedBudget[]>([])
  // Budget id → the member it goes to, or CLOSE.
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState(false)
  const { data: billing } = useBillingStatus()
  // Deleting the account cannot cancel a Google Play subscription — only the Play Store can.
  // A web one is cancelled by the delete itself (DELETE /api/user), so it only needs a heads-up.
  const renewingSubscription = billing?.mode === 'paid' && billing.autoRenew
  const renewingOnWeb = renewingSubscription && billing?.store === 'web'
  const [deleteEmailDraft, setDeleteEmailDraft] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Without the list we can't ask, and skipping the step would close them all, so stop here.
  async function start() {
    setChecking(true)
    setDeleteError(null)
    try {
      const { budgets } = await getSharedBudgets()
      setShared(budgets)
      setPicks(Object.fromEntries(budgets.map((b) => [b.id, b.members[0]?.userId ?? CLOSE])))
      setStep(budgets.length ? 'shared' : 'confirm')
    } catch {
      setDeleteError('Check your connection and try again.')
    } finally {
      setChecking(false)
    }
  }

  function cancel() {
    setStep('idle')
    setDeleteEmailDraft('')
    setDeleteError(null)
  }

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    const transfers = Object.fromEntries(Object.entries(picks).filter(([, to]) => to !== CLOSE))
    const res = await fetch('/api/user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shared.length ? { email: deleteEmailDraft.trim(), transfers } : { email: deleteEmailDraft.trim() }),
    })
    if (res.ok) {
      window.location.href = '/sign-in'
      return
    }
    // 503: the web subscription couldn't be cancelled, so the server refused
    // the delete rather than keep billing a gone account.
    setDeleteError(
      res.status === 503
        ? "We couldn't cancel your subscription just now, so your account wasn't deleted. Try again in a bit."
        : "Your account wasn't deleted. Check your connection and try again.",
    )
    setDeleting(false)
  }

  return (
    <div className="account-danger-card">
      <div className="account-danger-title">Delete account</div>
      <div className="account-danger-copy">
        Removes categories, transactions and recaps. You have {GRACE_DAYS} days to sign back in and restore before it&apos;s
        gone for good.
      </div>
      {step === 'shared' ? (
        <div className="account-confirm-panel">
          <div className="account-confirm-copy">
            <strong>Your shared budgets</strong>
            <br />
            Other people use these. Pick who gets each one.
          </div>
          {shared.map((b) => (
            <fieldset key={b.id} className="delete-shared-budget">
              <legend className="account-confirm-copy">
                <strong className="budget-title"><BudgetIcon budget={b} /> {b.name}</strong>
              </legend>
              {[...b.members.map((m) => ({ value: m.userId, label: `Hand it to ${handOffName(m)}` })), { value: CLOSE, label: 'Close it' }].map((o) => (
                <label key={o.value || 'close'} className="delete-shared-option">
                  <input
                    type="radio"
                    name={`shared-${b.id}`}
                    checked={picks[b.id] === o.value}
                    onChange={() => setPicks((p) => ({ ...p, [b.id]: o.value }))}
                  />
                  {o.label}
                </label>
              ))}
              {picks[b.id] === CLOSE && (
                <div className="account-confirm-copy">
                  {`Everyone in it loses access. It comes back if you restore your account within ${GRACE_DAYS} days.`}
                </div>
              )}
            </fieldset>
          ))}
          <div className="account-confirm-actions">
            <button type="button" className="account-confirm-cancel" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="account-danger-btn" onClick={() => setStep('confirm')}>
              Continue
            </button>
          </div>
        </div>
      ) : step === 'confirm' ? (
        <div className="account-confirm-panel">
          <div className="account-confirm-copy">
            You&apos;ll have {GRACE_DAYS} days to restore before this is permanent. Type <strong>{email}</strong> to
            confirm.
          </div>
          {renewingOnWeb ? (
            <div className="account-confirm-copy">
              <strong>Your subscription is still active.</strong> Deleting your account cancels it, so you won&apos;t be
              charged again.
            </div>
          ) : renewingSubscription ? (
            <div className="account-confirm-copy">
              <strong>Your subscription is still active.</strong> Deleting your account doesn&apos;t cancel it. Cancel in
              the Google Play Store first, or you&apos;ll keep being billed.
            </div>
          ) : null}
          <input
            type="email"
            className="account-inline-input"
            aria-label="Your email"
            value={deleteEmailDraft}
            onChange={(e) => setDeleteEmailDraft(e.target.value)}
            placeholder={email ?? ''}
            disabled={deleting}
            autoComplete="off"
          />
          <div className="account-confirm-actions">
            <button type="button" className="account-confirm-cancel" onClick={cancel} disabled={deleting}>
              Cancel
            </button>
            <button
              type="button"
              className="account-danger-btn"
              onClick={deleteAccount}
              disabled={deleting || !email || deleteEmailDraft.trim().toLowerCase() !== email.toLowerCase()}
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
          {deleteError ? (
            <div className="account-confirm-copy" role="alert">
              {deleteError}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <button type="button" className="account-danger-btn" onClick={() => void start()} disabled={checking}>
            {checking ? 'Checking…' : 'Delete account'}
          </button>
          {deleteError ? (
            <div className="account-confirm-copy" role="alert">
              {deleteError}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
