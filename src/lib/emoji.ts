import { CATEGORY_COLORS, isCategoryColor, type CategoryColor } from './categoryColors'

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

// A soft tint and the icon colour on it, by the key a category or group
// stores when the user picks a colour (Mobile's src/lib/emoji.ts, same order,
// so a hashed category gets the same slot on both). Gold is Web's accent.
const TINTS: Record<CategoryColor, { background: string; color: string }> = {
  mint: { background: 'var(--mint-soft)', color: 'var(--mint)' },
  violet: { background: 'var(--violet-soft)', color: 'var(--violet)' },
  blue: { background: 'var(--blue-soft)', color: 'var(--blue)' },
  accent: { background: 'var(--gold-soft)', color: 'var(--gold-ink)' },
  warn: { background: 'var(--warn-soft)', color: 'var(--warn-ink)' },
  coral: { background: 'var(--coral-soft)', color: 'var(--coral)' },
}

/** Background and icon colour for a colour key, for a tile's `style`. */
export function colorStyle(color: CategoryColor): { background: string; color: string } {
  return TINTS[color]
}

/** A category's colour: the one the user picked, else one cycled by a hash of
 *  the name, shared by every surface so one category is never two colours. */
export function categoryColor(category: string, color?: string): CategoryColor {
  return isCategoryColor(color) ? color : CATEGORY_COLORS[avatarHash(category) % CATEGORY_COLORS.length]
}

/** A group's colour: the one the user picked, else the accent. */
export function groupColor(color?: string): CategoryColor {
  return isCategoryColor(color) ? color : 'accent'
}

/** The icon colour that sits on {@link avatarStyleFor}'s tint. */
export function avatarInkFor(category: string, color?: string): string {
  return TINTS[categoryColor(category, color)].color
}

/** Background and icon colour together, for a category tile's `style`. */
export function avatarStyleFor(category: string, color?: string): { background: string; color: string } {
  return TINTS[categoryColor(category, color)]
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
