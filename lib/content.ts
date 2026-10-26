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
      ['/compare/ynab-alternative', 'YNAB alternative'],
      ['/compare/ynab-alternative-india', 'YNAB alternative in India'],
      ['/compare/walnut', 'Aviary vs Walnut'],
      ['/compare/money-manager', 'Aviary vs Money Manager'],
      ['/compare/monefy', 'Monefy alternative'],
      ['/compare/goodbudget', 'Aviary vs Goodbudget'],
      ['/compare/axio', 'Aviary vs Axio'],
      ['/compare/budget-spreadsheet', 'Aviary vs a budget spreadsheet'],
    ],
  },
  tools: {
    label: 'Free tools',
    path: '/tools',
    pages: [
      ['/tools/50-30-20-calculator', '50/30/20 calculator'],
      ['/tools/salary-budget-planner', 'Salary budget planner'],
      ['/tools/paycheck-budget-planner', 'Paycheck budget planner'],
      ['/tools/budget-for-15000-salary', 'Budget for a ₹15k salary'],
      ['/tools/budget-for-20000-salary', 'Budget for a ₹20k salary'],
      ['/tools/budget-for-25000-salary', 'Budget for a ₹25k salary'],
      ['/tools/budget-for-30000-salary', 'Budget for a ₹30k salary'],
      ['/tools/budget-for-40000-salary', 'Budget for a ₹40k salary'],
      ['/tools/budget-for-50000-salary', 'Budget for a ₹50k salary'],
      ['/tools/budget-for-60000-salary', 'Budget for a ₹60k salary'],
      ['/tools/budget-for-80000-salary', 'Budget for an ₹80k salary'],
      ['/tools/budget-for-1-lakh-salary', 'Budget for a ₹1 lakh salary'],
      ['/tools/emergency-fund-calculator', 'Emergency fund calculator'],
      ['/tools/sinking-fund-calculator', 'Sinking fund calculator'],
      ['/tools/rent-affordability-calculator', 'How much rent can I afford?'],
    ],
  },
  features: {
    label: 'Features',
    path: '/features',
    pages: [
      ['/features/shared-budgets', 'Shared budgets'],
      ['/features/bill-scanning', 'Bill scanning'],
      ['/features/catch-up-from-statements', 'Catch up from a statement'],
      ['/features/ask-aviary', 'Ask Aviary'],
      ['/features/recurring-expenses', 'Recurring expenses and subscriptions'],
      ['/features/budget-without-bank-linking', 'Budget without linking your bank'],
    ],
  },
  blog: {
    label: 'Blog',
    path: '/blog',
    // Posts are files in content/blog, listed by lib/blog.ts.
    pages: [],
  },
} satisfies Record<string, { label: string; path: PagePath; pages: [PagePath, string][] }>

export type ContentSection = keyof typeof CONTENT_SECTIONS

export const contentLabel = (path: PagePath) =>
  Object.values(CONTENT_SECTIONS).flatMap((s) => [[s.path, s.label] as const, ...s.pages]).find(([p]) => p === path)?.[1] ?? path

/** When the competitor facts on /compare pages were last checked against their own sites and store listings. */
export const COMPARE_CHECKED = 'October 2026'
