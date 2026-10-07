'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { popIn, staggerDelay } from '../components/landing/mobile/kit'
import { LoadingCaption } from '../components/LoadingCaption'
import { Scrim, Sheet } from '../components/MotionSheet'
import { SuccessButton, useButtonPhase } from '../components/SuccessButton'
import { ACCOUNT_TYPE_EMOJI } from '../components/AccountChips'
import { AccountWriteError } from '../api/accounts'
import { liveAccounts, useAccounts, useAddAccount, useUpdateAccount } from '../hooks/useAccounts'
import { useBalanceStatus } from '../hooks/useBalanceCheck'
import type { AccountRow, AccountType } from '../types'

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
]
const TYPE_LABEL: Record<string, string> = { bank: 'Bank account', cash: 'Cash', credit_card: 'Credit card' }

/** Server messages worth showing as they are: the limits and the duplicate name. */
function friendly(err: unknown): string {
  if (err instanceof AccountWriteError && err.status === 409) return err.message
  return 'Check your connection and try again.'
}

/**
 * `/account/accounts`: name where money lives so each expense can say which
 * one it came from. Labels only: no balances here, the weekly balance check
 * covers that. Twin of Mobile's app/account/accounts.tsx.
 */
export function AccountsPage() {
  const accountsQ = useAccounts()
  const all = accountsQ.data ?? []
  const live = liveAccounts(all)
  const archived = all.filter((a) => a.archived)
  const update = useUpdateAccount()
  // undefined: closed. '': adding. An id: editing.
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [error, setError] = useState('')

  async function restore(a: AccountRow) {
    setError('')
    try {
      await update.mutateAsync({ id: a.id, updates: { archived: false } })
    } catch (err) {
      setError(friendly(err))
    }
  }

  return (
    <>
      <div className="account-page-heading">
        <div>
          <div className="account-section-label">Accounts</div>
          <div className="account-row-meta" style={{ padding: '2px 4px 0' }}>
            {live.length === 0 ? 'Where your money lives' : `${live.length} in use`}
          </div>
        </div>
        <button type="button" className="account-compact-btn" onClick={() => setEditing('')}>+ Add</button>
      </div>

      {accountsQ.isLoading ? (
        <LoadingCaption placement="page" />
      ) : accountsQ.isError ? (
        <div className="account-empty">
          <p className="account-row-meta">Couldn&apos;t load your accounts. Check your connection and try again.</p>
        </div>
      ) : live.length === 0 && archived.length === 0 ? (
        <StarterAccounts />
      ) : (
        <>
          <ul className="account-card recurring-list" aria-label="Accounts">
            {live.map((a, i) => (
              <motion.li key={a.id} {...popIn(staggerDelay(i))}>
                <button type="button" className="account-row" onClick={() => setEditing(a.id)}>
                  <span aria-hidden="true" style={{ fontSize: 20 }}>{ACCOUNT_TYPE_EMOJI[a.type] ?? '🏦'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="account-row-label recurring-title">{a.name}</span>
                    <span className="account-row-meta">{TYPE_LABEL[a.type] ?? 'Account'}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
          <p className="recurring-hint" style={{ padding: '0 4px' }}>
            Pick one when you log an expense. Your weekly balance check asks about each bank account.
          </p>
          {archived.length > 0 && (
            <div>
              <div className="account-section-label" style={{ marginBottom: 10 }}>Archived</div>
              <ul className="account-card recurring-list" aria-label="Archived accounts">
                {archived.map((a) => (
                  <li key={a.id} className="account-row" style={{ cursor: 'default' }}>
                    <span aria-hidden="true" style={{ fontSize: 20, opacity: 0.5 }}>{ACCOUNT_TYPE_EMOJI[a.type] ?? '🏦'}</span>
                    <span style={{ flex: 1, minWidth: 0, opacity: 0.6 }} className="account-row-label">{a.name}</span>
                    <button type="button" className="scan-link-btn is-mint" disabled={update.isPending} onClick={() => restore(a)}>Restore</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="erd-log-error">{error}</p>}
        </>
      )}

      <AnimatePresence>
        {editing !== undefined && <AccountModal id={editing || undefined} onClose={() => setEditing(undefined)} />}
      </AnimatePresence>
    </>
  )
}

/**
 * First visit: offer the names the user already typed into the balance check,
 * plus cash and a card, ticked or not, so setting up is one tap.
 */
function StarterAccounts() {
  const balance = useBalanceStatus()
  // The picks are seeded once, so wait for the names to arrive first.
  if (balance.isLoading) return <LoadingCaption placement="page" />
  return <StarterPicks names={balance.data?.accounts ?? []} />
}

function StarterPicks({ names }: { names: string[] }) {
  const add = useAddAccount()
  const fromCheck = names.map((name) => ({ name, type: 'bank' as AccountType, picked: true }))
  const base = fromCheck.length > 0 ? fromCheck : [{ name: 'Bank', type: 'bank' as AccountType, picked: true }]
  const [choices, setChoices] = useState(() => [
    ...base,
    { name: 'Cash', type: 'cash' as AccountType, picked: true },
    { name: 'Credit card', type: 'credit_card' as AccountType, picked: false },
  ])
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const [error, setError] = useState('')
  const picked = choices.filter((c) => c.picked)

  async function addAll() {
    if (picked.length === 0 || saving) return
    setError('')
    start()
    try {
      // One at a time, so a duplicate stops the rest instead of racing them.
      for (const c of picked) await add.mutateAsync({ name: c.name, type: c.type })
      succeed()
    } catch (err) {
      fail()
      setError(friendly(err))
    }
  }

  return (
    <div className="account-card" style={{ padding: 18 }}>
      <div className="account-row-label">Start with these?</div>
      <p className="account-row-meta" style={{ margin: '4px 0 12px' }}>
        Name where your money lives. Then each expense can say which one it came from.
      </p>
      <div className="erd-chip-row">
        {choices.map((c, i) => (
          <button
            key={`${c.type}:${c.name}`}
            type="button"
            className={`erd-chip ${c.picked ? 'is-selected' : ''}`}
            aria-pressed={c.picked}
            onClick={() => setChoices((all) => all.map((x, j) => (j === i ? { ...x, picked: !x.picked } : x)))}
          >
            <span aria-hidden="true">{ACCOUNT_TYPE_EMOJI[c.type]}</span> {c.name}
          </button>
        ))}
      </div>
      {error && <p className="erd-log-error">{error}</p>}
      <div style={{ marginTop: 14 }}>
        <SuccessButton type="button" baseClass="erd-log-submit" saving={saving} success={success} successLabel="Added" disabled={picked.length === 0 || saving || success} onClick={addAll}>
          {picked.length === 0 ? 'Pick at least one' : `Add ${picked.length === 1 ? 'it' : `these ${picked.length}`}`}
        </SuccessButton>
      </div>
    </div>
  )
}

function AccountModal({ id, onClose }: { id?: string; onClose: () => void }) {
  const accounts = useAccounts().data ?? []
  const existing = id ? accounts.find((a) => a.id === id) : undefined
  const add = useAddAccount()
  const update = useUpdateAccount()
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [error, setError] = useState('')
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const busy = saving || success || update.isPending
  const canSubmit = name.trim() !== '' && name.trim().length <= 30

  async function submit() {
    if (!canSubmit || busy) return
    setError('')
    start()
    try {
      if (existing) await update.mutateAsync({ id: existing.id, updates: { name: name.trim(), type } })
      else await add.mutateAsync({ name: name.trim(), type })
      succeed(onClose)
    } catch (err) {
      fail()
      setError(friendly(err))
    }
  }

  async function archive() {
    if (!existing || busy) return
    setError('')
    try {
      await update.mutateAsync({ id: existing.id, updates: { archived: true } })
      onClose()
    } catch (err) {
      setConfirmArchive(false)
      setError(friendly(err))
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card erd-recurring-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={existing ? 'Edit account' : 'New account'}>
        <div className="erd-modal-head">
          <h3>{existing ? 'Edit account' : 'New account'}</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={success}>✕</button>
        </div>
        <div className="erd-recurring-body">
          <section className="erd-recurring-section">
            <label className="erd-log-label" htmlFor="account-name">Name</label>
            <input id="account-name" className="erd-log-input" placeholder="e.g. HDFC" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
          </section>
          <section className="erd-recurring-section">
            <div className="erd-log-label">Type</div>
            <div className="erd-chip-row">
              {ACCOUNT_TYPES.map((t) => (
                <button key={t.value} type="button" className={`erd-chip ${type === t.value ? 'is-selected' : ''}`} aria-pressed={type === t.value} onClick={() => setType(t.value)}>
                  <span aria-hidden="true">{ACCOUNT_TYPE_EMOJI[t.value]}</span> {t.label}
                </button>
              ))}
            </div>
            <p className="recurring-hint">
              {type === 'credit_card'
                ? 'Spends on a card set money aside in your Credit Card envelope.'
                : type === 'cash'
                  ? "Cash spends don't count in your balance check."
                  : 'Your weekly balance check asks about this one.'}
            </p>
          </section>
          {error && <p className="erd-log-error">{error}</p>}
        </div>
        <div className="erd-recurring-footer">
          <SuccessButton type="button" baseClass="erd-log-submit" saving={saving} success={success} successLabel="Saved" disabled={!canSubmit || busy} onClick={submit}>
            {existing ? 'Save changes' : 'Add account'}
          </SuccessButton>
          {existing && !success && (
            <div className="recurring-danger-zone">
              {confirmArchive ? (
                <div className="account-confirm-panel">
                  <div className="account-confirm-copy">
                    Archive &quot;{existing.name}&quot;? Expenses on it keep the label.{existing.type === 'bank' ? ' Your next balance check starts fresh.' : ''}
                  </div>
                  <div className="account-confirm-actions">
                    <button type="button" className="account-confirm-cancel" disabled={busy} onClick={() => setConfirmArchive(false)}>Back</button>
                    <button type="button" className="account-danger-btn" style={{ marginTop: 0 }} disabled={busy} onClick={archive}>
                      {update.isPending ? 'Working…' : 'Archive'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="scan-link-btn is-coral" disabled={busy} onClick={() => setConfirmArchive(true)}>Archive</button>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </Scrim>
  )
}
