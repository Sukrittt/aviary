import { groupEmoji, splitEmoji } from '@/src/lib/emoji'

/** Sample month for the landing playground. Static on purpose: the page is prerendered. */

export const MONTH_LABEL = 'September 2026'
export const DAYS_LEFT = 20

export interface DemoCategory {
  name: string
  group: string
  assigned: number
  spent: number
  lastSpentDaysAgo: number
  /** vs the trailing average, shown beside the row in Where it went. */
  deltaPct: number | null
}

export const GROUPS = ['🏠 House', '🎬 Lifestyle', '⚽ Fun', '📈 Investments']

export const CATEGORIES: DemoCategory[] = [
  { name: '🏠 Rent', group: '🏠 House', assigned: 9500, spent: 9500, lastSpentDaysAgo: 8, deltaPct: null },
  { name: '👨‍🍳 Cook', group: '🏠 House', assigned: 4000, spent: 4000, lastSpentDaysAgo: 6, deltaPct: null },
  { name: '⚡ Electricity', group: '🏠 House', assigned: 2000, spent: 964, lastSpentDaysAgo: 12, deltaPct: -9 },
  { name: '🍅 Groceries', group: '🏠 House', assigned: 3000, spent: 1259.75, lastSpentDaysAgo: 2, deltaPct: -13 },
  { name: '🎡 Outings', group: '🎬 Lifestyle', assigned: 4000, spent: 0, lastSpentDaysAgo: 19, deltaPct: null },
  { name: '📺 Subscriptions', group: '🎬 Lifestyle', assigned: 5900, spent: 5217, lastSpentDaysAgo: 4, deltaPct: null },
  { name: '🛍️ Shopping', group: '🎬 Lifestyle', assigned: 2000, spent: 638.1, lastSpentDaysAgo: 3, deltaPct: 22 },
  { name: '🛵 Travel', group: '🎬 Lifestyle', assigned: 3000, spent: 606.71, lastSpentDaysAgo: 1, deltaPct: -8 },
  { name: '💇 Haircut', group: '🎬 Lifestyle', assigned: 300, spent: 100, lastSpentDaysAgo: 3, deltaPct: null },
  { name: '⚽ Football', group: '⚽ Fun', assigned: 3000, spent: 1092, lastSpentDaysAgo: 1, deltaPct: 96 },
  { name: '🧺 Laundry', group: '⚽ Fun', assigned: 800, spent: 190, lastSpentDaysAgo: 0, deltaPct: null },
  { name: '📈 Investments', group: '📈 Investments', assigned: 40000, spent: 40000, lastSpentDaysAgo: 10, deltaPct: null },
]

/** The same month in dollars for visitors outside India, with Takeout in place of a cook. */
export const CATEGORIES_INTL: DemoCategory[] = [
  { name: '🏠 Rent', group: '🏠 House', assigned: 1400, spent: 1400, lastSpentDaysAgo: 8, deltaPct: null },
  { name: '⚡ Electricity', group: '🏠 House', assigned: 120, spent: 58, lastSpentDaysAgo: 12, deltaPct: -9 },
  { name: '🍅 Groceries', group: '🏠 House', assigned: 400, spent: 168.4, lastSpentDaysAgo: 2, deltaPct: -13 },
  { name: '🥡 Takeout', group: '🎬 Lifestyle', assigned: 200, spent: 86.5, lastSpentDaysAgo: 1, deltaPct: 14 },
  { name: '🎡 Outings', group: '🎬 Lifestyle', assigned: 150, spent: 0, lastSpentDaysAgo: 19, deltaPct: null },
  { name: '📺 Subscriptions', group: '🎬 Lifestyle', assigned: 60, spent: 45.97, lastSpentDaysAgo: 4, deltaPct: null },
  { name: '🛍️ Shopping', group: '🎬 Lifestyle', assigned: 150, spent: 48.2, lastSpentDaysAgo: 3, deltaPct: 22 },
  { name: '🛵 Travel', group: '🎬 Lifestyle', assigned: 200, spent: 61.75, lastSpentDaysAgo: 1, deltaPct: -8 },
  { name: '💇 Haircut', group: '🎬 Lifestyle', assigned: 40, spent: 15, lastSpentDaysAgo: 3, deltaPct: null },
  { name: '⚽ Football', group: '⚽ Fun', assigned: 100, spent: 36, lastSpentDaysAgo: 1, deltaPct: 96 },
  { name: '🧺 Laundry', group: '⚽ Fun', assigned: 40, spent: 12, lastSpentDaysAgo: 0, deltaPct: null },
  { name: '📈 Investments', group: '📈 Investments', assigned: 1000, spent: 1000, lastSpentDaysAgo: 10, deltaPct: null },
]

/** Stand-in for the category-map dictionary log-expense auto-suggests from. */
export const WORDS: Record<string, string> = {
  rent: '🏠 Rent',
  cook: '👨‍🍳 Cook',
  maid: '👨‍🍳 Cook',
  electricity: '⚡ Electricity',
  bescom: '⚡ Electricity',
  groceries: '🍅 Groceries',
  vegetables: '🍅 Groceries',
  blinkit: '🍅 Groceries',
  zepto: '🍅 Groceries',
  milk: '🍅 Groceries',
  chai: '🎡 Outings',
  coffee: '🎡 Outings',
  movie: '🎡 Outings',
  dinner: '🎡 Outings',
  netflix: '📺 Subscriptions',
  spotify: '📺 Subscriptions',
  prime: '📺 Subscriptions',
  amazon: '🛍️ Shopping',
  myntra: '🛍️ Shopping',
  shoes: '🛍️ Shopping',
  uber: '🛵 Travel',
  ola: '🛵 Travel',
  auto: '🛵 Travel',
  metro: '🛵 Travel',
  petrol: '🛵 Travel',
  rapido: '🛵 Travel',
  haircut: '💇 Haircut',
  salon: '💇 Haircut',
  football: '⚽ Football',
  turf: '⚽ Football',
  laundry: '🧺 Laundry',
  sip: '📈 Investments',
  takeout: '🥡 Takeout',
  doordash: '🥡 Takeout',
  ubereats: '🥡 Takeout',
  pizza: '🥡 Takeout',
  starbucks: '🎡 Outings',
  walmart: '🍅 Groceries',
  costco: '🍅 Groceries',
  hulu: '📺 Subscriptions',
  target: '🛍️ Shopping',
  lyft: '🛵 Travel',
  bus: '🛵 Travel',
  subway: '🛵 Travel',
  gas: '🛵 Travel',
  soccer: '⚽ Football',
  etf: '📈 Investments',
}

export interface Envelope {
  category: string
  group: string
  assigned: number
  spent: number
  available: number
  spentPct: number
  isOverspent: boolean
  lastSpentDaysAgo: number
}

export function toEnvelope(c: DemoCategory): Envelope {
  const available = c.assigned - c.spent
  return {
    category: c.name,
    group: c.group,
    assigned: c.assigned,
    spent: c.spent,
    available,
    spentPct: c.assigned > 0 ? (c.spent / c.assigned) * 100 : c.spent > 0 ? 100 : 0,
    isOverspent: available < 0,
    lastSpentDaysAgo: c.lastSpentDaysAgo,
  }
}

export interface BreakdownRow {
  key: string
  label: string
  emoji: string
  spent: number
  assigned: number
  assignedIsCarried: boolean
  deltaPct: number | null
}

function row(key: string, spent: number, assigned: number, deltaPct: number | null, emoji: string): BreakdownRow {
  return { key, label: splitEmoji(key).text, emoji, spent, assigned, assignedIsCarried: false, deltaPct }
}

const bySpend = (a: BreakdownRow, b: BreakdownRow) => b.spent - a.spent

export function breakdownRows(categories: DemoCategory[]) {
  const spentCats = categories.filter((c) => c.spent > 0)
  const categoryRows = spentCats
    .map((c) => row(c.name, c.spent, c.assigned, c.deltaPct, splitEmoji(c.name).icon))
    .sort(bySpend)
  const groupRows = GROUPS.map((g) => {
    const members = spentCats.filter((c) => c.group === g)
    return row(
      g,
      members.reduce((s, c) => s + c.spent, 0),
      members.reduce((s, c) => s + c.assigned, 0),
      null,
      groupEmoji(g),
    )
  })
    .filter((r) => r.spent > 0)
    .sort(bySpend)
  const categoryGroupMap = new Map(categories.map((c) => [c.name, c.group]))
  return { categoryRows, groupRows, categoryGroupMap }
}
