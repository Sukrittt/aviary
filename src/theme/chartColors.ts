/** Stable semantic chart palette shared by every insights primitive.
 * Order matches Mobile's CHART_COLOR_CYCLE index-for-index (blue, mint,
 * violet, accent, coral, warn). The category breakdown doesn't use it: it
 * takes avatarInkFor() so each category matches its tile on the Categories card. */
export const CHART_COLORS = [
  'var(--blue)',
  'var(--mint)',
  'var(--violet)',
  'var(--gold)',
  'var(--coral)',
  'var(--warn)',
] as const
