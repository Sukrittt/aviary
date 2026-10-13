'use client'

import type { ReactNode } from 'react'
import type { AccountRow } from '../types'
import { splitEmoji } from '../lib/emoji'
import { categoryIconKey, type CategoryIconKey } from '../lib/categoryIcons'
import { CATEGORY_ICON_COMPONENTS } from './CategoryIcon'

export const ACCOUNT_TYPE_ICON: Record<string, CategoryIconKey> = { bank: 'Bank', cash: 'Money', credit_card: 'CreditCard' }

/** A legacy leading emoji in the name picks the account's icon, like categories; else its type's. */
export function accountIconKey(a: { name: string; type: string }): CategoryIconKey {
  return splitEmoji(a.name).icon ? categoryIconKey(a.name) : ACCOUNT_TYPE_ICON[a.type] ?? 'Bank'
}

export function AccountIcon({ account, size = '1em' }: { account: { name: string; type: string }; size?: number | string }) {
  const Icon = CATEGORY_ICON_COMPONENTS[accountIconKey(account)]
  return <Icon size={size} aria-hidden />
}

/** The name without its leading emoji, for next to `AccountIcon`. */
export function accountLabel(a: { name: string }): string {
  return splitEmoji(a.name).text
}

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
  trailing,
}: {
  accounts: AccountRow[]
  value: string
  onChange: (id: string) => void
  allowNone?: boolean
  label?: string
  /** Rendered after the last chip, e.g. an Add button. */
  trailing?: ReactNode
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
            <AccountIcon account={a} /> {accountLabel(a)}
          </button>
        ))}
        {trailing}
      </div>
    </div>
  )
}

/** The account's name for a row, or '' for none or one that's gone. */
export function accountName(accounts: AccountRow[] | undefined, id: string | undefined): string {
  if (!id) return ''
  return accounts?.find((a) => a.id === id)?.name ?? ''
}
