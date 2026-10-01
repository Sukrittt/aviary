/**
 * "Spending faster than usual" detection for the pace notification: compares
 * each category's spend so far this month with what the user usually has
 * spent by the same day of the month. Pure; the rows come from
 * `buildExpenseContext`, which already loads six months of expenses.
 */

export interface PaceExpense {
  date: string // 'YYYY-MM-DD'
  amount_inr: number
  category: string
}

export interface PaceOutlier {
  category: string
  /** Spent this month up to and including today. */
  spent: number
  /** Average spend by this day of the month over prior months. */
  usual: number
  /** Average spend from tomorrow to month end over prior months. */
  usualRest: number
  /** spent / usual, rounded to one decimal. */
  ratio: number
}

const HISTORY_MONTHS = 3
/** Before this day, a single purchase dominates the ratio. */
const MIN_DAY = 7
const MIN_RATIO = 2
/** Categories below this share of usual monthly spend are too small to push about. */
const MIN_SHARE = 0.05
const SENTINELS = new Set(['__income__', '__credit_card__'])

function priorMonths(month: string, n: number): string[] {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** The category furthest over its usual pace this month, by money overshoot, or null. */
export function paceOutlier(expenses: PaceExpense[], today: string): PaceOutlier | null {
  const day = Number(today.slice(8, 10))
  if (day < MIN_DAY) return null
  const month = today.slice(0, 7)
  const prior = new Set(priorMonths(month, HISTORY_MONTHS))

  const spent = new Map<string, number>()
  const toDate = new Map<string, number>()
  const full = new Map<string, number>()
  const monthsSeen = new Map<string, Set<string>>()
  const activeMonths = new Set<string>()
  const add = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n)

  for (const e of expenses) {
    const amount = Number(e.amount_inr) || 0
    if (amount <= 0 || SENTINELS.has(e.category)) continue
    const m = e.date.slice(0, 7)
    if (m === month) {
      if (e.date <= today) add(spent, e.category, amount)
    } else if (prior.has(m)) {
      activeMonths.add(m)
      add(full, e.category, amount)
      if (Number(e.date.slice(8, 10)) <= day) add(toDate, e.category, amount)
      monthsSeen.set(e.category, (monthsSeen.get(e.category) ?? new Set()).add(m))
    }
  }

  // Divide by months the account actually has, so a new user isn't compared
  // against zero-filled months from before they signed up.
  const n = activeMonths.size
  if (n === 0) return null
  const usualTotal = [...full.values()].reduce((a, b) => a + b, 0) / n

  let best: PaceOutlier | null = null
  for (const [category, s] of spent) {
    if ((monthsSeen.get(category)?.size ?? 0) < 2) continue
    const usual = (toDate.get(category) ?? 0) / n
    const usualMonth = (full.get(category) ?? 0) / n
    if (usual <= 0 || s < usual * MIN_RATIO || usualMonth < usualTotal * MIN_SHARE) continue
    if (best && s - usual <= best.spent - best.usual) continue
    best = { category, spent: s, usual, usualRest: usualMonth - usual, ratio: Math.round((s / usual) * 10) / 10 }
  }
  return best
}
