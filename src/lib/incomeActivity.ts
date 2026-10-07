import type { IncomeRow } from '../types'

export interface IncomeWindow {
  /** The period's bounds, YYYY-MM-DD inclusive. */
  from: string
  to: string
  /** Oldest expense date on this page, or null for an empty page. */
  pageMin: string | null
  /** Oldest expense date on the page before this one, when known. Page 1 has none. */
  prevPageMin: string | null
  page: number
  isLastPage: boolean
  /** Text search: an income shows when its label matches. */
  q?: string
  /** An account filter: only income paid into it. */
  account?: string
}

/**
 * Which income rows belong on this page of Activity. Expenses are paged by the
 * server, newest first; income is a handful of rows fetched whole and slotted
 * in by date. Each page owns the dates from its oldest expense up to (not
 * including) the previous page's oldest, page 1 owns everything newer, and the
 * last page everything older, so every income lands on exactly one page.
 */
export function incomesForPage(incomes: IncomeRow[], w: IncomeWindow): IncomeRow[] {
  const lower = w.isLastPage || !w.pageMin ? w.from : w.pageMin
  const q = w.q?.trim().toLowerCase()
  return incomes.filter((i) => {
    if (i.date < lower || i.date > w.to) return false
    if (w.page > 1 && w.prevPageMin && i.date >= w.prevPageMin) return false
    if (q && !i.label.toLowerCase().includes(q)) return false
    if (w.account && i.account_id !== w.account) return false
    return true
  })
}

/**
 * The last day income can fall on for a week or month view. Expenses end the
 * window at the newest expense, but a payday after it, in the same week or
 * month, still belongs there.
 */
export function periodEnd(period: string, to: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return to
  const d = new Date(`${to}T00:00:00Z`)
  if (period === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  if (period === 'week') {
    d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
    return d.toISOString().slice(0, 10)
  }
  return to
}
