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

/**
 * Home's heads-up when an envelope runs dry before month end, or null when
 * nothing does. `key` changes with the envelope or the date, so a dismissed
 * warning comes back once the forecast moves.
 */
export function runOutWarning(f: Forecast): { text: string; key: string } | null {
  if (!f.basis) return null
  const first = f.envelopes
    .filter((e) => e.runsOutOn)
    .sort((a, b) => a.runsOutOn!.localeCompare(b.runsOutOn!))[0]
  if (!first) return null
  // Same key as Mobile, whose SecureStore allows only [A-Za-z0-9._-]: anything
  // else is spelled out as its code point. Lossless, so two envelopes never
  // share a dismissal.
  const id = Array.from(first.category, (c) => (/[A-Za-z0-9]/.test(c) ? c : `_${c.codePointAt(0)!.toString(16)}`)).join('')
  return {
    // Non-breaking, so a wrapped line never strands the month from its day.
    text: `${splitEmoji(first.category).text} runs out around ${formatDateShort(first.runsOutOn!).replace(' ', '\u00a0')}`,
    key: `forecast-${id}-${first.runsOutOn}`,
  }
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
