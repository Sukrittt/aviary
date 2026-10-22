// Every icon a category or group can wear, keyed by its Phosphor name. Drawn
// from categoryIconPaths.ts (scripts/gen-category-icons.mjs) rather than
// Phosphor's modules: those carry all six weights, ~650 KB for this catalog.
// Bundled, not an external sprite, so icons draw with the first paint.
import type { CSSProperties, SVGProps } from 'react'
import type { IconWeight } from './icons'
import { CATEGORY_ICON_PATHS } from './categoryIconPaths'
import { CATEGORY_ICONS, categoryIconKey, groupIconKey, type CategoryIconKey } from '@/src/lib/categoryIcons'
import { budgetIconKey } from '@/src/lib/budgetIcons'

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: number | string
  /** Only regular is in the sprite; accepted so call sites match Phosphor's. */
  weight?: IconWeight
  style?: CSSProperties
}
export type CategoryGlyph = (props: GlyphProps) => React.JSX.Element

function glyph(key: CategoryIconKey): CategoryGlyph {
  const Glyph = ({ size = '1em', weight: _weight, color, ...rest }: GlyphProps) => (
    <svg width={size} height={size} viewBox="0 0 256 256" fill={color ?? 'currentColor'} {...rest}>
      <path d={CATEGORY_ICON_PATHS[key]} />
    </svg>
  )
  Glyph.displayName = `${key}Glyph`
  return Glyph
}

export const CATEGORY_ICON_COMPONENTS = Object.fromEntries(
  (Object.keys(CATEGORY_ICONS) as CategoryIconKey[]).map((key) => [key, glyph(key)]),
) as Record<CategoryIconKey, CategoryGlyph>

interface Props {
  /** The category's (or group's) full name, emoji and all. */
  name: string
  /** The icon the user picked, from the category's `icon` field. */
  icon?: string
  group?: string
  kind?: 'category' | 'group'
  size?: number | string
  weight?: IconWeight
  className?: string
}

/** A category's icon, resolved from its picked icon, emoji or name. */
export function CategoryIcon({ name, icon, group, kind = 'category', size = '1em', weight = 'regular', className }: Props) {
  const key = kind === 'group' ? groupIconKey(name, icon) : categoryIconKey(name, icon, group)
  const Icon = CATEGORY_ICON_COMPONENTS[key]
  return <Icon size={size} weight={weight} className={className} aria-hidden />
}

/** A budget's icon: the one picked, else its emoji's match (budgets from before icons). */
export function BudgetIcon({ budget, size = '1em', className }: { budget: { icon?: string | null; emoji?: string | null }; size?: number | string; className?: string }) {
  const Icon = CATEGORY_ICON_COMPONENTS[budgetIconKey(budget)]
  return <Icon size={size} className={className} aria-hidden />
}
