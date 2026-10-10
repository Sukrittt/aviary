'use client'

import type { AccountRow } from '../types'

export const ACCOUNT_TYPE_EMOJI: Record<string, string> = { bank: '🏦', cash: '💵', credit_card: '💳' }

/**
 * One chip per live account. Replaces the old Bank / Credit card toggle once a
 * user has made accounts; with none, callers keep showing that toggle, so a
 * user who never opens Accounts sees nothing new. `allowNone` adds a leading
 * "No account" chip for rows where the account is optional (income).
 */
export function AccountChips({
  accounts,
  value,
  onChange,
  allowNone = false,
  label = 'Paid from',
}: {
  accounts: AccountRow[]
  value: string
  onChange: (id: string) => void
  allowNone?: boolean
  label?: string
}) {
  return (
    <div>
      <div className="erd-log-label">{label}</div>
      <div className="erd-chip-row" role="radiogroup" aria-label={label}>
        {allowNone && (
          <button type="button" role="radio" aria-checked={value === ''} className={`erd-chip ${value === '' ? 'is-selected' : ''}`} onClick={() => onChange('')}>
            No account
          </button>
        )}
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={value === a.id}
            className={`erd-chip ${value === a.id ? 'is-selected' : ''}`}
            onClick={() => onChange(a.id)}
          >
            <span aria-hidden="true">{ACCOUNT_TYPE_EMOJI[a.type] ?? '🏦'}</span> {a.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The account's name for a row, or '' for none or one that's gone. */
export function accountName(accounts: AccountRow[] | undefined, id: string | undefined): string {
  if (!id) return ''
  return accounts?.find((a) => a.id === id)?.name ?? ''
}
