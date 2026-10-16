import { avatarHash } from '@/src/lib/emoji'

/** Stable semantic chart palette shared by every insights primitive.
 * Order matches Mobile's CHART_COLOR_CYCLE index-for-index (blue, mint,
 * violet, accent, coral, warn). The category breakdown uses
 * CATEGORY_CHART_COLORS instead. */
export const CHART_COLORS = [
  'var(--blue)',
  'var(--mint)',
  'var(--violet)',
  'var(--gold)',
  'var(--coral)',
  'var(--warn)',
] as const

/** The "Where it went" donut's palette (tokens.ts chart1..chart8). */
export const CATEGORY_CHART_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--tk-chart${n})`)

/** A category's (or group's) wedge colour: its position in the user's own
 *  list, so the first eight never share a colour and a colour doesn't move
 *  with this month's spend rank. Keys missing from the list fall back to a
 *  name hash. */
// ponytail: reordering the list repaints wedges; a stored per-category colour fixes that once the picker lands.
export function categoryChartColor(key: string, order: readonly string[]): string {
  const index = order.indexOf(key)
  return CATEGORY_CHART_COLORS[(index >= 0 ? index : avatarHash(key)) % CATEGORY_CHART_COLORS.length]
}
