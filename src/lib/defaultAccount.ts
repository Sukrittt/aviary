import type { AccountRow } from '../types'

interface Spent {
  category: string
  account_id?: string
  timestamp?: string
  date: string
}

/**
 * The account a new expense starts on: the one this category is most often
 * paid from, else the one used last, else the first. Only live accounts
 * count. Twin of Mobile's src/lib/defaultAccount.ts.
 */
export function defaultAccountFor(rows: Spent[], category: string, accounts: AccountRow[]): string {
  const live = new Set(accounts.filter((a) => !a.archived).map((a) => a.id))
  if (live.size === 0) return ''
  const counts = new Map<string, number>()
  let latest: { id: string; at: string } | null = null
  for (const r of rows) {
    if (!r.account_id || !live.has(r.account_id)) continue
    if (category && r.category === category) counts.set(r.account_id, (counts.get(r.account_id) ?? 0) + 1)
    const at = r.timestamp || r.date
    if (!latest || at > latest.at) latest = { id: r.account_id, at }
  }
  let best = ''
  let bestCount = 0
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id
      bestCount = n
    }
  }
  return best || latest?.id || accounts.find((a) => !a.archived)!.id
}
