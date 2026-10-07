// The weekly balance check (app/api/balance-checks). The user types the
// balance of each account they pay from; the server compares the drop in the
// total since the last check with what they logged. A gap comes back as
// estimated rows in Ask Aviary's proposal shape, reviewed on the same card
// (src/components/CaptureReview.tsx). Twin of Mobile's src/api/balanceChecks.ts.
import { apiFetch } from './client'
import type { CaptureProposal } from './ai'

export interface BalanceStatus {
  /** 7+ days since the last settled check, no check yet, or a gap still unexplained. */
  due: boolean
  /** The newest check found a gap the user hasn't explained yet. */
  open: boolean
  /** The last settled balance minus bank spends logged since: the number to prefill. */
  expected: number | null
  anchor: { timestamp: string; date: string; balance: number } | null
  /** Share of the bank's outflow the user logged themselves, at the last check that measured one. */
  loggedPct: number | null
  /** Names of the accounts typed last time, to ask about again. Empty before the first named check. */
  accounts: string[]
}

export interface AccountBalance {
  name: string
  balance: number
}

export type CheckKind = 'baseline' | 'square' | 'unlogged' | 'surplus'

export type BalanceResult =
  /** `accounts_changed`: an account was added or removed, so this check starts over. */
  | { id: string; kind: 'baseline'; reason: 'first' | 'accounts_changed'; balance: number }
  | {
      id: string
      kind: Exclude<CheckKind, 'baseline'>
      balance: number
      expected: number
      logged: number
      /** Positive: money left that wasn't logged. Negative: more money than expected. */
      gap: number
      tolerance: number
      /** Card spends logged in the last 30 days, for the card bill question. */
      cardSpendRecent: number
      loggedPct: number | null
    }

export type MoneyInReason = 'income' | 'refund' | 'moved_in'

export type ResolveAnswer = { cardBill?: number; movedOut?: number } | { moneyIn: MoneyInReason }

export interface ResolveResult {
  status: 'resolved'
  forgotten: number
  cardShortfall: number
  /** Estimated rows to review, or null when there's nothing to log. */
  proposal: CaptureProposal | null
  loggedPct: number
}

// The status stays in these messages on purpose, like every other module
// here, so a failed request still says what the server answered.
export async function getBalanceStatus(): Promise<BalanceStatus> {
  const resp = await apiFetch('/api/balance-checks')
  if (!resp.ok) throw new Error(`Failed to load balance check: ${resp.status}`)
  return resp.json()
}

export async function submitBalance(accounts: AccountBalance[]): Promise<BalanceResult> {
  const resp = await apiFetch('/api/balance-checks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accounts }),
  })
  if (!resp.ok) throw new Error(`Failed to save balance: ${resp.status}`)
  return resp.json()
}

export async function resolveBalanceCheck(id: string, answer: ResolveAnswer): Promise<ResolveResult> {
  const resp = await apiFetch(`/api/balance-checks/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(answer),
  })
  if (!resp.ok) throw new Error(`Failed to resolve balance check: ${resp.status}`)
  return resp.json()
}
