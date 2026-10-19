/**
 * The forecast's words, from `GET /api/forecast`. Twin of
 * Mobile/src/lib/forecastCopy.ts, so both clients say the same thing.
 */
import type { Forecast, NextMonth } from '@/lib/forecast'
import { splitEmoji } from './emoji'
import { formatDateShort } from './format'

type Money = (n: number) => string

/** "About" figures: to the nearest 100 from 1,000 up, else the nearest 10. */
export function aboutAmount(n: number): number {
  const step = Math.abs(n) >= 1000 ? 100 : 10
  return Math.round(n / step) * step || 0
}

/** The one line on Home, or null when there's no forecast yet. */
export function forecastHeadline(f: Forecast, money: Money): string | null {
  if (!f.basis || f.totalLeft === null) return null
  const first = f.envelopes
    .filter((e) => e.runsOutOn)
    .sort((a, b) => a.runsOutOn!.localeCompare(b.runsOutOn!))[0]
  if (first) return `${splitEmoji(first.category).text} runs out around ${formatDateShort(first.runsOutOn!)}`
  const total = aboutAmount(f.totalLeft)
  return total < 0 ? `About ${money(-total)} over by month end` : `About ${money(total)} left at month end`
}

/** "₹X is already spoken for next month", or null with nothing scheduled. */
export function nextMonthLine(n: NextMonth, money: Money): { title: string; detail: string | null } | null {
  if (n.spokenFor <= 0) return null
  const title = `${money(n.spokenFor)} is already spoken for next month`
  if (n.income <= 0) return { title, detail: null }
  const detail =
    n.free >= 0
      ? `That leaves ${money(n.free)} of your ${money(n.income)} income.`
      : `That's ${money(-n.free)} more than your ${money(n.income)} income.`
  return { title, detail }
}
