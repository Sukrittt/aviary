// A budget wears an icon from the category catalog. Budgets from before icons
// only have an emoji, which resolves through the catalog's emoji map, so
// nothing needed migrating. Pure data, no React: the API validates against it.
import { categoryIconKey, isCategoryIconKey, type CategoryIconKey } from './categoryIcons'

/** The new-budget picker, in order: what a screen reader calls each, and the emoji older app builds still show. */
export const BUDGET_ICONS: Partial<Record<CategoryIconKey, { label: string; emoji: string }>> = {
  House: { label: 'Home', emoji: '🏠' },
  Airplane: { label: 'Trip', emoji: '✈️' },
  UsersThree: { label: 'Family', emoji: '👨‍👩‍👧' },
  Briefcase: { label: 'Work', emoji: '💼' },
  GraduationCap: { label: 'Study', emoji: '🎓' },
  PawPrint: { label: 'Pets', emoji: '🐾' },
  Car: { label: 'Car', emoji: '🚗' },
  Confetti: { label: 'Party', emoji: '🎉' },
  Heart: { label: 'Love', emoji: '❤️' },
  Island: { label: 'Holiday', emoji: '🏖️' },
  Wrench: { label: 'Projects', emoji: '🛠️' },
  PiggyBank: { label: 'Savings', emoji: '💰' },
}
export const BUDGET_ICON_KEYS = Object.keys(BUDGET_ICONS) as CategoryIconKey[]

/** A budget's icon: the one picked, else its emoji's match, else the wallet. */
export function budgetIconKey(budget: { icon?: string | null; emoji?: string | null }): CategoryIconKey {
  return isCategoryIconKey(budget.icon) ? budget.icon : categoryIconKey(budget.emoji ?? '')
}

/** The emoji an older app build shows for an icon. */
export const budgetEmoji = (icon: CategoryIconKey): string => BUDGET_ICONS[icon]?.emoji ?? (icon === 'Bird' ? '🐦' : '💰')
