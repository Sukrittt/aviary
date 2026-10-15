/**
 * Presentation helpers shared by every envelope surface. The mobile twins live
 * inline in EnvelopeRow.tsx and ProgressBar.tsx, which is why web's copies in
 * EnvelopeGrid.tsx had drifted — see `lastSpentLabel`.
 */
import { parseLocalDate, toLocalDateString } from './date'
import type { Envelope } from './envelope'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Spend as a percentage of assigned. Infinity means spending against nothing assigned. */
export function usedPct(e: Pick<Envelope, 'assigned' | 'spent'>): number {
  if (e.assigned > 0) return Math.round((e.spent / e.assigned) * 100)
  return e.spent > 0 ? Infinity : 0
}

/** The same number as a label, with mobile's glyphs for the two edge cases. */
export function usedPctLabel(e: Pick<Envelope, 'assigned' | 'spent'>): string {
  const pct = usedPct(e)
  if (pct === Infinity) return '∞'
  if (e.assigned === 0) return '—'
  return `${pct}%`
}

/**
 * "Today" / "Yesterday" / "5d ago" / "3 Mar" for a stored date string.
 *
 * Compares against the device-local calendar date, not the UTC one. Web's previous copy
 * used `new Date().toISOString().slice(0, 10)`, which is a day behind IST
 * between 00:00 and 05:29 — so anything logged in those hours read as
 * "Yesterday" on the day it happened. Written by hand rather than through
 * Intl, matching the mobile twin, so both apps format a date identically.
 */
export function lastSpentLabel(iso: string | undefined): string {
  if (!iso) return '—'
  const d = parseLocalDate(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const today = new Date()
  if (iso === toLocalDateString(today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === toLocalDateString(yesterday)) return 'Yesterday'
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((midnight.getTime() - d.getTime()) / 86400000)
  if (days >= 1 && days <= 31) return `${days}d ago`
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

export type FillTone = 'spent' | 'danger' | 'warn' | 'ok'

/**
 * Where the progress bar changes hands. Twin of ProgressBar.tsx's `fillColor`,
 * returning a tone rather than a colour: web resolves it to `--tk-*` through a
 * class, so the thresholds live in one place and the palette in another.
 */
export function fillTone(pct: number): FillTone {
  if (pct >= 100) return 'spent'
  if (pct > 90) return 'danger'
  if (pct > 75) return 'warn'
  return 'ok'
}
