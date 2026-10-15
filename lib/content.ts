import type { PagePath } from './seo'

/**
 * The public content pages, grouped the way the footer, hub pages and
 * "related pages" blocks show them. Titles and descriptions live in lib/seo.ts;
 * this is just the short link label.
 */
export const CONTENT_SECTIONS = {
  compare: {
    label: 'Compare',
    path: '/compare',
    pages: [
      ['/compare/ynab-alternative-india', 'YNAB alternative in India'],
      ['/compare/walnut', 'Aviary vs Walnut'],
      ['/compare/money-manager', 'Aviary vs Money Manager'],
      ['/compare/goodbudget', 'Aviary vs Goodbudget'],
      ['/compare/axio', 'Aviary vs Axio'],
    ],
  },
  tools: {
    label: 'Free tools',
    path: '/tools',
    pages: [
      ['/tools/50-30-20-calculator', '50/30/20 calculator'],
      ['/tools/salary-budget-planner', 'Salary budget planner'],
      ['/tools/budget-for-25000-salary', 'Budget for a ₹25k salary'],
      ['/tools/budget-for-40000-salary', 'Budget for a ₹40k salary'],
      ['/tools/budget-for-60000-salary', 'Budget for a ₹60k salary'],
      ['/tools/budget-for-1-lakh-salary', 'Budget for a ₹1 lakh salary'],
      ['/tools/emergency-fund-calculator', 'Emergency fund calculator'],
      ['/tools/rent-affordability-calculator', 'How much rent can I afford?'],
    ],
  },
  features: {
    label: 'Features',
    path: '/features',
    pages: [
      ['/features/bill-scanning', 'Bill scanning'],
      ['/features/ask-aviary', 'Ask Aviary'],
      ['/features/recurring-expenses', 'Recurring expenses and subscriptions'],
      ['/features/budget-without-bank-linking', 'Budget without linking your bank'],
    ],
  },
} satisfies Record<string, { label: string; path: PagePath; pages: [PagePath, string][] }>

export type ContentSection = keyof typeof CONTENT_SECTIONS

export const contentLabel = (path: PagePath) =>
  Object.values(CONTENT_SECTIONS).flatMap((s) => [[s.path, s.label] as const, ...s.pages]).find(([p]) => p === path)?.[1] ?? path

/** When the competitor facts on /compare pages were last checked against their own sites and store listings. */
export const COMPARE_CHECKED = 'October 2026'
