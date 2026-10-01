'use client'

import { Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { clearLocalPrefs } from '../../../src/lib/localPref'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'

interface UserDoc {
  email: string
  emailVerified: boolean
  name: string | null
  avatarUrl: string | null
  deletionScheduledFor: string | null
}

interface SessionRow {
  id: string
  userAgent: string | null
  authMethod: string
  createdAt: string
  current: boolean
}

interface ProofDoc {
  fields: string[]
  sample: Record<string, string> | null
}

/** Whole days from now until `ts`, floored at 0. */
function daysUntil(ts: string): number {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

function sessionLabel(s: SessionRow): string {
  if (s.userAgent) return s.userAgent
  const method = s.authMethod === 'oauth' ? 'Google' : s.authMethod === 'magic_code' ? 'Email code' : s.authMethod
  return `Signed in with ${method}`
}

function SecurityContent() {
  const params = useSearchParams()

  const [doc, setDoc] = useState<UserDoc | null>(null)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null)
  const [proof, setProof] = useState<ProofDoc | null>(null)
  const [showProof, setShowProof] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resent, setResent] = useState(false)

  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmingSignOutAll, setConfirmingSignOutAll] = useState(false)
  const [signingOutAll, setSigningOutAll] = useState(false)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { data: billing } = useBillingStatus()
  // Deleting the account cannot cancel a Google Play subscription — only the Play Store can.
  const renewingSubscription = billing?.mode === 'paid' && billing.autoRenew
  const [deleteEmailDraft, setDeleteEmailDraft] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(false)

  const loadUser = async () => {
    const res = await fetch('/api/user')
    if (!res.ok) return
    setDoc(await res.json())
  }
  const loadSessions = async () => {
    const res = await fetch('/api/user/sessions')
    if (!res.ok) return
    const body: { data: SessionRow[] } = await res.json()
    setSessions(body.data)
  }
  const loadIdentities = async () => {
    const res = await fetch('/api/user/identities')
    if (!res.ok) return
    const body: { providers: string[] } = await res.json()
    setGoogleLinked(body.providers.includes('GoogleOAuth'))
  }
  const loadProof = async () => {
    const res = await fetch('/api/privacy/proof')
    if (!res.ok) return
    setProof(await res.json())
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([loadUser(), loadSessions(), loadIdentities(), loadProof()])
    })()
  }, [])

  async function saveName() {
    const name = nameDraft.trim()
    setSavingName(true)
    const res = await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setSavingName(false)
    setEditingName(false)
    if (res.ok) setDoc(await res.json())
  }

  async function verifyCode() {
    setVerifying(true)
    setCodeError('')
    const res = await fetch('/api/user/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    setVerifying(false)
    if (!res.ok) {
      setCodeError('Wrong or expired code.')
      return
    }
    setCode('')
    await loadUser()
  }

  async function resendCode() {
    setResent(false)
    await fetch('/api/user/email/resend', { method: 'POST' })
    setResent(true)
  }

  async function revokeSession(id: string) {
    setRevokingId(id)
    const res = await fetch(`/api/user/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setRevokingId(null)
    if (res.ok) await loadSessions()
  }

  async function signOutEverywhere() {
    setSigningOutAll(true)
    await fetch('/api/user/sessions', { method: 'DELETE' })
    clearLocalPrefs()
    window.location.href = '/logout'
  }

  async function restoreAccount() {
    setRestoring(true)
    setRestoreError(false)
    const res = await fetch('/api/user/restore', { method: 'POST' })
    setRestoring(false)
    if (res.ok) {
      await loadUser()
      return
    }
    setRestoreError(true)
  }

  async function deleteAccount() {
    setDeleting(true)
    const res = await fetch('/api/user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: deleteEmailDraft.trim() }),
    })
    if (res.ok) {
      window.location.href = '/sign-in'
      return
    }
    setDeleting(false)
  }

  const initial = (doc?.name || doc?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <>
      <div className="account-profile-card">
        {doc?.avatarUrl ? (
          <Image
            className="account-avatar"
            src={doc.avatarUrl}
            alt=""
            width={52}
            height={52}
            unoptimized
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="account-avatar" aria-hidden="true">
            {initial}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div className="account-inline-actions" style={{ marginTop: 0 }}>
              <input
                className="account-inline-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
              <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={saveName} disabled={savingName}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="account-profile-name">{doc?.name || 'You'}</div>
          )}
          <div className="account-profile-email">{doc?.email ?? ''}</div>
        </div>
        {!editingName && (
          <button
            type="button"
            className="account-pill-btn"
            onClick={() => {
              setNameDraft(doc?.name ?? '')
              setEditingName(true)
            }}
          >
            Edit
          </button>
        )}
      </div>

      {doc?.deletionScheduledFor && (
        <div className="account-warn-banner">
          <div className="account-warn-title">Account scheduled for deletion</div>
          <div className="account-warn-copy">
            {daysUntil(doc.deletionScheduledFor)} day{daysUntil(doc.deletionScheduledFor) === 1 ? '' : 's'} left to
            restore it.
          </div>
          {restoreError && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--coral)' }}>
              Could not restore account. Check your connection and try again.
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={restoreAccount} disabled={restoring}>
              {restoring ? 'Restoring…' : 'Restore account'}
            </button>
          </div>
        </div>
      )}

      <div className="account-card">
        <div style={{ padding: 16 }}>
          <div className="account-section-label">Email</div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{doc?.email}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: doc?.emailVerified ? 'var(--mint)' : 'var(--gold)' }}>
                {doc?.emailVerified ? '✓ Verified' : 'Unverified'}
              </div>
            </div>
          </div>

          {doc && !doc.emailVerified && (
            <div className="account-warn-banner">
              <div className="account-warn-title">Verify your new email</div>
              <div className="account-warn-copy">Enter the 6-digit code sent to {doc.email}.</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <input
                  className="account-inline-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  style={{ maxWidth: 140 }}
                />
                <button
                  type="button"
                  className="account-pill-btn account-pill-btn--primary"
                  onClick={verifyCode}
                  disabled={verifying || code.length < 6}
                >
                  {verifying ? 'Verifying…' : 'Verify'}
                </button>
              </div>
              {codeError && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--coral)' }}>{codeError}</div>}
              <div className="account-warn-actions">
                <button type="button" onClick={resendCode}>
                  {resent ? 'Code resent' : 'Resend code'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="account-row" style={{ cursor: 'default' }}>
          <span className="account-row-icon" aria-hidden="true" style={{ color: 'var(--gold)' }}>
            G
          </span>
          <span className="account-row-label">Google</span>
          {googleLinked ? (
            <span className="account-row-meta">Linked</span>
          ) : (
            <a href="/api/auth/google?link=1" className="account-pill-btn">
              Link
            </a>
          )}
        </div>
      </div>

      {params.get('linkError') === '1' && (
        <div className="account-confirm-copy">That Google account belongs to a different user — nothing was changed.</div>
      )}
      {params.get('linked') === '1' && <div className="account-confirm-copy">Google linked.</div>}

      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          Active sessions
        </div>
        <div className="account-card">
          {(sessions ?? []).map((s) => (
            <div className="account-row" key={s.id} style={{ cursor: 'default' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="account-row-label" style={{ fontWeight: 700 }}>
                  {sessionLabel(s)}
                </div>
                <div className="account-row-meta">{new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
              {s.current ? (
                <span className="account-badge">Current</span>
              ) : (
                <button type="button" className="account-pill-btn" onClick={() => revokeSession(s.id)} disabled={revokingId === s.id}>
                  {revokingId === s.id ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
          {sessions?.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--erd-text2)' }}>No active sessions.</div>
          )}
        </div>
      </div>

      {proof && (
        <div>
          <div className="account-section-label" style={{ marginBottom: 10 }}>
            Your data, encrypted
          </div>
          <div className="account-card account-proof-card">
            <p className="account-proof-copy">
              Before an expense, budget number or Ask Aviary chat reaches our database, we encrypt
              it with AES-256-GCM. A leaked database backup or an open connection string only turns
              up ciphertext, never your amounts, item names or notes.
            </p>
            <p className="account-proof-copy">
              Dates, categories and payment methods stay readable so search and filtering still work.
            </p>
            <p className="account-proof-copy">
              This isn&apos;t end-to-end encryption, and we won&apos;t call it that. Our server still
              decrypts your data to run your budget, digests and Ask Aviary, so it protects you if
              the database leaks, not if the app server itself is compromised.
            </p>
            <button
              type="button"
              className="account-pill-btn"
              style={{ marginTop: 12 }}
              onClick={() => setShowProof((v) => !v)}
            >
              {showProof ? 'Hide proof' : 'Show me'}
            </button>
            {showProof && (
              <div style={{ marginTop: 8 }}>
                {proof.sample ? (
                  Object.entries(proof.sample).map(([key, value]) => (
                    <div className="account-proof-row" key={key}>
                      <span className="account-proof-row-key">
                        {key}
                        {proof.fields.includes(key) ? ' (encrypted)' : ''}
                      </span>
                      <span className="account-proof-row-value">{value || '—'}</span>
                    </div>
                  ))
                ) : (
                  <div className="account-proof-row">
                    <span className="account-proof-row-key">Log an expense to see this in action.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        {confirmingSignOutAll ? (
          <div className="account-confirm-panel">
            <div className="account-confirm-copy">This signs out every device, including this one.</div>
            <div className="account-confirm-actions">
              <button
                type="button"
                className="account-confirm-cancel"
                onClick={() => setConfirmingSignOutAll(false)}
                disabled={signingOutAll}
              >
                Cancel
              </button>
              <button type="button" className="account-danger-btn" onClick={signOutEverywhere} disabled={signingOutAll}>
                {signingOutAll ? 'Signing out…' : 'Sign out everywhere'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="account-row account-card"
            style={{ color: 'var(--gold)' }}
            onClick={() => setConfirmingSignOutAll(true)}
          >
            <span className="account-row-label">Sign out everywhere</span>
          </button>
        )}
      </div>

      <div className="account-danger-card">
        <div className="account-danger-title">Delete account</div>
        <div className="account-danger-copy">
          Removes envelopes, transactions and recaps. You have 7 days to sign back in and restore before it&apos;s
          gone for good.
        </div>
        {confirmingDelete ? (
          <div className="account-confirm-panel">
            <div className="account-confirm-copy">
              You&apos;ll have 7 days to restore before this is permanent. Type <strong>{doc?.email}</strong> to
              confirm.
            </div>
            {renewingSubscription ? (
              <div className="account-confirm-copy">
                <strong>Your subscription is still active.</strong> Deleting your account doesn&apos;t cancel it. Cancel in
                the Google Play Store first, or you&apos;ll keep being billed.
              </div>
            ) : null}
            <input
              type="email"
              className="account-inline-input"
              value={deleteEmailDraft}
              onChange={(e) => setDeleteEmailDraft(e.target.value)}
              placeholder={doc?.email ?? ''}
              disabled={deleting}
              autoComplete="off"
            />
            <div className="account-confirm-actions">
              <button
                type="button"
                className="account-confirm-cancel"
                onClick={() => {
                  setConfirmingDelete(false)
                  setDeleteEmailDraft('')
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="account-danger-btn"
                onClick={deleteAccount}
                disabled={deleting || !doc?.email || deleteEmailDraft.trim().toLowerCase() !== doc.email.toLowerCase()}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="account-danger-btn" onClick={() => setConfirmingDelete(true)}>
            Delete account
          </button>
        )}
      </div>
    </>
  )
}

export default function SecurityPage() {
  return (
    <Suspense fallback={null}>
      <SecurityContent />
    </Suspense>
  )
}
