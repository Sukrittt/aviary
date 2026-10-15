// Older category/group names embed an emoji as the leading character (e.g.
// "🏠 Rent", see productivity/categories.csv). splitEmoji() pulls it off for
// display; src/lib/categoryIcons.ts turns it into an icon.
const LEADING_EMOJI_RE = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u

export function splitEmoji(raw: string): { icon: string; text: string } {
  const trimmed = raw.trim()
  const match = trimmed.match(LEADING_EMOJI_RE)
  if (match) {
    const text = trimmed.slice(match[0].length).trim()
    if (text) return { icon: match[1], text }
  }
  return { icon: '', text: trimmed }
}

// Keep the same stable, soft-hue cycle as Mobile's Activity avatars.
const AVATAR_HUES = [
  'var(--mint-soft)',
  'var(--violet-soft)',
  'var(--blue-soft)',
  'var(--gold-soft)',
  'var(--warn-soft)',
  'var(--coral-soft)',
]
// The icon colour on each tint above, same order.
const AVATAR_INKS = ['var(--mint)', 'var(--violet)', 'var(--blue)', 'var(--gold-ink)', 'var(--warn-ink)', 'var(--coral)']

/** Deterministic avatar tint for a category, shared by Activity and Insights
 *  so one category is never two colours in the same session. */
function avatarColorFor(category: string): string {
  return AVATAR_HUES[avatarHash(category) % AVATAR_HUES.length]
}

/** The icon colour that sits on {@link avatarColorFor}'s tint. */
export function avatarInkFor(category: string): string {
  return AVATAR_INKS[avatarHash(category) % AVATAR_INKS.length]
}

/** Background and icon colour together, for a category tile's `style`. */
export function avatarStyleFor(category: string): { background: string; color: string } {
  return { background: avatarColorFor(category), color: avatarInkFor(category) }
}

function avatarHash(category: string): number {
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  }
  return hash
}

/** A chart fill for an ink: mixed toward white by --tk-chart-soften (15% in
 *  light, 0 in dark), matching Mobile's chartInk. Icon glyphs keep the raw ink. */
export function chartInk(ink: string): string {
  return `color-mix(in srgb, ${ink}, white var(--tk-chart-soften))`
}
