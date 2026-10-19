// A category's or group's picked colour: one of the six tints the hash picks
// from (Mobile's src/lib/emoji.ts), stored in the optional `color` field.
export const CATEGORY_COLORS = ['mint', 'violet', 'blue', 'accent', 'warn', 'coral'] as const
export type CategoryColor = (typeof CATEGORY_COLORS)[number]

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && (CATEGORY_COLORS as readonly string[]).includes(value)
}
