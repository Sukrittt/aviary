// A category's or group's picked colour (Mobile's src/lib/emoji.ts, same
// keys), stored in the optional `color` field.
// Picker order, by hue.
export const CATEGORY_COLORS = [
  'coral', 'accent', 'warn', 'mint', 'blue', 'indigo', 'violet', 'pink', 'brown', 'slate',
] as const
export type CategoryColor = (typeof CATEGORY_COLORS)[number]
/** The tints an unpicked category hashes to, in their original order:
 *  changing it recolours every category without a picked colour. */
export const HASH_COLORS: readonly CategoryColor[] = ['mint', 'violet', 'blue', 'accent', 'warn', 'coral']

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && (CATEGORY_COLORS as readonly string[]).includes(value)
}
