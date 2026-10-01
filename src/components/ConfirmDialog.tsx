'use client'

import { useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Scrim, Sheet } from './MotionSheet'
import { clearAccess } from '../services/accessMode'

/** Small confirm modal; the caller supplies the confirm button(s) as children. Render inside <AnimatePresence>. */
export function ConfirmDialog({
  title,
  body,
  cancelLabel,
  onCancel,
  busy = false,
  children,
}: {
  title: string
  body?: string
  cancelLabel: string
  onCancel: () => void
  busy?: boolean
  children: ReactNode
}) {
  return (
    <Scrim className="erd-modal-overlay" onClick={() => { if (!busy) onCancel() }}>
      <Sheet className="erd-modal-card archive-confirm" role="alertdialog" aria-modal="true" aria-busy={busy || undefined} aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 className="archive-confirm-title">{title}</h3>
        {body && <p className="account-row-meta">{body}</p>}
        <div className="archive-confirm-actions">
          <button type="button" className="account-pill-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          {children}
        </div>
      </Sheet>
    </Scrim>
  )
}

/** Shared by the sidebar's Log out and the account page's Sign out. */
export function SignOutDialog({ onCancel }: { onCancel: () => void }) {
  const [signingOut, setSigningOut] = useState(false)
  function signOut() {
    if (signingOut) return
    // Commit the feedback before clearAccess starts a full-page navigation.
    flushSync(() => setSigningOut(true))
    clearAccess()
  }
  return (
    <ConfirmDialog title="Sign out of Aviary?" body="You'll need to sign in again to see your budget." cancelLabel="Cancel" onCancel={onCancel} busy={signingOut}>
      <button type="button" className="account-danger-btn" style={{ marginTop: 0 }} onClick={signOut} disabled={signingOut} aria-busy={signingOut || undefined}>
        {signingOut ? <span role="status">Signing out…</span> : 'Sign out'}
      </button>
    </ConfirmDialog>
  )
}
