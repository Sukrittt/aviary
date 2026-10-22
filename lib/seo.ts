import type { Metadata } from 'next'

export const SITE_URL = new URL('https://www.useaviary.com')

// Only public content belongs in search results. Auth, personal finance and
// admin pages still get descriptive browser titles without exposing user data.
export const pages = {
  '/': { title: 'Aviary: Budget App & Expense Tracker for India', description: 'A budget app for India that learns when you spend and nudges you to log it in one tap. Give every rupee a job. No bank link. Android and web, free for 30 days.', index: true },
  '/intl': { title: 'Aviary: Budget App & Expense Tracker That Learns Your Habits', description: 'A budget app that learns when you spend and nudges you to log it in one tap. Give every dollar a job, no bank link. Android and web, free for 30 days.', index: true },
  '/changelog': { title: 'Aviary Changelog: What’s New in the Budget App', description: 'Every Aviary release in one place: new features, improvements and fixes for the budget app on the web, newest first.', index: true },
  '/help': { title: 'Aviary Help: How Categories, Logging and Budgets Work', description: 'How Aviary’s categories and Ready to Assign work, how to log fast or catch up on missed days, plus answers on pricing, privacy and bank linking.', index: true },
  '/compare': { title: 'Aviary vs Other Budget Apps in India: Honest Comparisons', description: 'How Aviary compares with YNAB, Walnut, Money Manager, Goodbudget, Axio and a budget spreadsheet on price, bank sync, platforms and budgeting method.', index: true },
  '/compare/ynab-alternative-india': { title: 'YNAB Alternative in India: Aviary vs YNAB', description: 'Looking for a YNAB alternative in India? How Aviary and YNAB compare on price in rupees, bank sync for Indian banks, platforms and the budgeting method.', index: true },
  '/compare/walnut': { title: 'Walnut App Alternative: Aviary vs Walnut', description: 'What happened to the Walnut expense tracker, and how Aviary compares if you want to keep tracking spending and budgeting in India.', index: true },
  '/compare/money-manager': { title: 'Aviary vs Money Manager (Realbyte): Which Fits You?', description: 'Aviary vs Money Manager by Realbyte: price, platforms, budgets, bank sync and how logging works. Where each one is stronger, checked against their listings.', index: true },
  '/compare/goodbudget': { title: 'Aviary vs Goodbudget: Envelope Budgeting Apps Compared', description: 'Aviary and Goodbudget both use envelope-style budgeting without bank sync. How they compare on price in India, platforms, limits and logging.', index: true },
  '/compare/budget-spreadsheet': { title: 'Budget Spreadsheet vs App: Aviary vs Excel and Google Sheets', description: 'Looking for a budget Excel template for India? How Aviary compares with Excel and Google Sheets, plus a free envelope budget template in rupees.', index: true },
  '/compare/axio': { title: 'Aviary vs Axio: Expense Tracking in India Compared', description: 'Axio reads your SMS to track spending and offers credit. Aviary is a budget you log yourself. How they differ on privacy, price and budgeting.', index: true },
  '/tools': { title: 'Free Budget Calculators for India (₹)', description: 'Free budget calculators in rupees: 50/30/20 split, salary planner, emergency fund, sinking funds and how much rent you can afford. No sign-up.', index: true },
  '/tools/50-30-20-calculator': { title: '50/30/20 Budget Calculator in Rupees (₹)', description: 'Split your monthly salary into needs, wants and savings with the 50/30/20 rule. Free calculator in ₹ with lakh and crore, plus how to make it work in India.', index: true },
  '/tools/salary-budget-planner': { title: 'Salary Budget Planner: Monthly Budget in ₹', description: 'Enter your take-home salary and rent to get a monthly budget in rupees: rent, groceries, bills, transport, wants and savings. Free, no sign-up.', index: true },
  '/tools/budget-for-25000-salary': { title: 'How to Budget a ₹25,000 Salary (Monthly Plan)', description: 'A realistic monthly budget for a ₹25,000 salary in India: rent, food, travel and how to still save ₹5,000. Adjust it with your own rent.', index: true },
  '/tools/budget-for-30000-salary': { title: 'How to Budget a ₹30,000 Salary (Monthly Plan)', description: 'A monthly budget for a ₹30,000 salary in India: rent around ₹9,000, food and travel that fit, and how to save ₹6,000 a month.', index: true },
  '/tools/budget-for-40000-salary': { title: 'How to Budget a ₹40,000 Salary (Monthly Plan)', description: 'A monthly budget for a ₹40,000 salary in India: where rent should land, what to spend on food and fun, and how to save ₹8,000 a month.', index: true },
  '/tools/budget-for-50000-salary': { title: 'How to Budget a ₹50,000 Salary (Monthly Plan)', description: 'A monthly budget for a ₹50,000 salary in India: ₹15,000 for rent, ₹15,000 for wants, and ₹10,000 a month toward savings.', index: true },
  '/tools/budget-for-60000-salary': { title: 'How to Budget a ₹60,000 Salary (Monthly Plan)', description: 'A monthly budget for a ₹60,000 salary in India: rent in a metro, an emergency fund in under a year, and ₹12,000 a month toward savings.', index: true },
  '/tools/budget-for-80000-salary': { title: 'How to Budget an ₹80,000 Salary (Monthly Plan)', description: 'A monthly budget for an ₹80,000 salary in India: metro rent, room for wants, and ₹16,000 a month toward savings and big goals.', index: true },
  '/tools/budget-for-1-lakh-salary': { title: 'How to Budget a ₹1 Lakh Salary (Monthly Plan)', description: 'A monthly budget for a ₹1 lakh salary in India: keep lifestyle creep in check, save ₹20,000 or more, and plan for big yearly costs.', index: true },
  '/tools/emergency-fund-calculator': { title: 'Emergency Fund Calculator (India, ₹)', description: 'How big should your emergency fund be? Enter your monthly essentials in rupees to get a target and how many months it’ll take to build.', index: true },
  '/tools/sinking-fund-calculator': { title: 'Sinking Fund Calculator for Yearly Costs (₹)', description: 'A sinking fund calculator in rupees. List your yearly costs like insurance and Diwali, and see how much to set aside each month. Free, no sign-up.', index: true },
  '/tools/rent-affordability-calculator': { title: 'How Much Rent Can I Afford? Calculator in ₹', description: 'Find a comfortable and a stretch rent for your take-home salary, with your EMIs counted. Free rent calculator in rupees for India.', index: true },
  '/features': { title: 'Aviary Features: Budgeting Built for Logging Fast', description: 'Shared budgets, bill scanning, Ask Aviary, catching up from a statement, recurring expenses, and budgeting without linking your bank. How each one works.', index: true },
  '/features/bill-scanning': { title: 'Bill Scanner for Expenses: Scan Receipts into Your Budget', description: 'Snap a bill and Aviary reads every line into your budget, picks categories and splits shared items. A receipt scanner built into a budget app.', index: true },
  '/features/ask-aviary': { title: 'Ask Aviary: an AI Expense Tracker You Can Talk To', description: 'Type “auto 240, lunch 150” and Aviary logs both. Ask how this month compares to last. An AI chat for your budget that you check before it logs.', index: true },
  '/features/recurring-expenses': { title: 'Subscription Tracker and Recurring Expenses App', description: 'Track rent, EMIs and subscriptions like Netflix and Spotify. Aviary logs recurring expenses on their date and warns you before renewals.', index: true },
  '/features/shared-budgets': { title: 'Shared Budget App for Couples and Flatmates', description: 'One budget on every phone. Invite your partner or flatmates with a link, log into the same categories, see who spent what. Up to 6 people on one plan.', index: true },
  '/features/catch-up-from-statements': { title: 'Upload a Bank Statement or UPI Screenshots to Your Budget', description: 'Fell behind? Upload screenshots of GPay, PhonePe or Paytm, or a CSV, Excel or PDF statement. Aviary reads the payments and you tick what to log.', index: true },
  '/features/budget-without-bank-linking': { title: 'Expense Tracker Without Bank Linking or SMS Access', description: 'A budget app that never asks for your bank login or SMS. Log spends in one tap, with nudges, so you notice where your money goes.', index: true },
  '/blog': { title: 'Aviary Blog: Budgeting in India, Explained Simply', description: 'Plain guides to budgeting in India: envelope and zero-based budgeting, tracking UPI spends, and making your salary last. Real ₹ examples, no jargon.', index: true },
  '/legal/privacy': { title: 'Privacy Policy | Aviary', description: 'How Aviary stores and processes your data: encryption, AI features, analytics, and how you export or delete everything. No ads, and your data is never sold.', index: true },
  '/legal/terms': { title: 'Terms of Service | Aviary', description: 'The terms for using Aviary, the budget app: account requirements, acceptable use, subscriptions, and your responsibilities.', index: true },
  '/legal/pricing': { title: 'Aviary Pricing: Free 30-Day Trial, Then Monthly or Yearly', description: 'Try the whole Aviary budget app free for 30 days, no card needed. Then pick a monthly or yearly plan on the web or Google Play. Cancel any time.', index: true },
  '/legal/refunds': { title: 'Refunds and Cancellation | Aviary', description: 'How to cancel your Aviary subscription, what happens to your access, and which charges can be refunded.', index: true },
  '/legal/contact': { title: 'Contact Aviary Support', description: 'Reach the person who builds Aviary for help with your account, billing, refunds or privacy. You’ll hear back within 3 working days.', index: true },
  '/legal/delete-account': { title: 'Delete Your Aviary Account', description: 'How to delete your Aviary account and personal data from the app, or ask support to do it for you.', index: true },
  '/emails': { title: 'Email preferences', description: 'Turn Aviary’s money tips by email on or off.' },
  '/join/[code]': { title: 'Join a budget', description: 'Someone invited you to share a budget on Aviary. Join it in the app or on the web.' },
  '/sign-in': { title: 'Sign In', description: 'Sign in to Aviary with Google or a one-time email code to access your budget across Android and the web.' },
  '/email': { title: 'Sign In with Email', description: 'Enter your email to receive a one-time sign-in code for your Aviary account.' },
  '/code': { title: 'Verify Your Sign-In Code', description: 'Verify your one-time email code to securely sign in to Aviary.' },
  '/onboarding': { title: 'Set Up Your Budget', description: 'Choose your currency, add your income, and create your first budget categories in Aviary.' },
  '/expense': { title: 'Budget Dashboard', description: 'Review your monthly budget, available money, recent expenses, and spending plan in Aviary.' },
  '/expense/envelopes': { title: 'Budget Categories', description: 'Assign money to your categories, review available balances, and move money as your plans change.' },
  '/expense/transactions': { title: 'Transaction Activity', description: 'Review, search, and manage your expense history and transaction activity in Aviary.' },
  '/insights': { title: 'Spending Insights', description: 'Explore your spending by category and month, compare it with your budget, and understand where your money goes.' },
  '/investments': { title: 'Investments', description: 'Track your investment holdings, contributions, withdrawals, and progress in Aviary.' },
  '/wrapped': { title: 'Expense Wrapped', description: 'Explore your Aviary spending recap, with highlights and patterns from your year in expenses.' },
  '/account': { title: 'Account & Settings', description: 'Manage your Aviary profile, currency, appearance, and account preferences.' },
  '/account/changelog': { title: 'Changelog', description: 'Read the latest Aviary web features, improvements, and fixes.' },
  '/account/accounts': { title: 'Accounts', description: 'Name your bank accounts, cards and cash so every Aviary expense shows where it came from.' },
  '/account/archive': { title: 'Archived Entries', description: 'Review and restore your archived Aviary transactions and entries.' },
  '/account/bill-scans': { title: 'Bill Scans', description: 'Review your scanned receipts and the expenses created from them in Aviary.' },
  '/account/chat-history': { title: 'Ask Aviary Chat History', description: 'Browse your past Ask Aviary conversations about your Aviary budget and spending.' },
  '/account/data': { title: 'Data & Privacy', description: 'Manage analytics preferences, export your Aviary data, and review your data controls.' },
  '/account/features': { title: 'Features', description: 'Choose which Aviary extras show up, like Ask Aviary, Insights and Scan a bill.' },
  '/account/feedback': { title: 'Report a Bug', description: 'Tell the Aviary team about something that isn’t working.' },
  '/account/ideas': { title: 'Feedback Board', description: 'Post ideas and vote on what Aviary builds next.' },
  '/account/guided-tour': { title: 'Guided Tour', description: 'Learn how to assign money, log expenses, and use your budget with Aviary’s guided tour.' },
  '/account/help': { title: 'Help & Support', description: 'Learn how Aviary categories work and find help with your budget and account.' },
  '/account/import': { title: 'Import from Another App', description: 'Bring your history from YNAB, Money Manager, Wallet and more into a budget you already use.' },
  '/account/income': { title: 'Income', description: 'Set your salary and other income so Aviary counts it toward Ready to Assign.' },
  '/account/recurring': { title: 'Recurring Expenses', description: 'Manage recurring expenses and reminders for regular purchases in your Aviary budget.' },
  '/account/security': { title: 'Account Security', description: 'Manage your sign-in methods, email, active sessions, and account security in Aviary.' },
  '/account/subscriptions': { title: 'Subscriptions', description: 'Track subscriptions, renewal dates, and recurring service costs in Aviary.' },
  '/account/trial-notice': { title: 'Your Trial Plan', description: 'Review how your Aviary trial works and what to expect when it ends.' },
  '/admin': { title: 'Admin Overview', description: 'Aviary administration overview for authorized administrators.' },
  '/admin/changelog': { title: 'Admin Changelog', description: 'Draft, preview, and publish Aviary web release notes.' },
  '/admin/ai': { title: 'Admin AI Usage', description: 'Review Aviary AI usage and processing costs.' },
  '/admin/audit': { title: 'Admin Audit Log', description: 'Review audited administrative actions in Aviary.' },
  '/admin/feedback': { title: 'Admin Feedback Inbox', description: 'Review and triage Aviary bug reports.' },
  '/admin/ideas': { title: 'Admin Ideas', description: 'Moderate the Aviary feedback board.' },
  '/admin/jobs': { title: 'Admin Jobs', description: 'Review scheduled Aviary jobs and their recent runs.' },
  '/admin/revenue': { title: 'Admin Revenue', description: 'Review Aviary revenue, subscribers, churn, and trial conversion.' },
  '/admin/subscriptions': { title: 'Admin Billing & Subscriptions', description: 'Manage Aviary billing accounts and subscription access.' },
  '/admin/system': { title: 'Admin System Settings', description: 'Manage Aviary system settings and service availability.' },
  '/admin/users': { title: 'Admin Users', description: 'Review Aviary users and account status.' },
  '/admin/users/[id]': { title: 'Admin User Details', description: 'Review account details and administrative controls for an Aviary user.' },
} satisfies Record<string, { title: string; description: string; index?: boolean }>

export type PagePath = keyof typeof pages

export const publicPagePaths = (Object.keys(pages) as PagePath[]).filter(
  (path) => 'index' in pages[path] && pages[path].index,
)

/** / and /intl are the same page for two markets: tell search engines which is which. */
const MARKET_ALTERNATES = { 'en-IN': '/', en: '/intl', 'x-default': '/' }
export const marketAlternates = (path: string) => (path === '/' || path === '/intl' ? MARKET_ALTERNATES : undefined)

/** 1200×630 share card, rendered by app/og.png/route.tsx; /intl has its own at app/intl/og.png. */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'Aviary: the budget app that learns your spending' }

/** Indexed pages with a card of their own (app/og/[...path]); the home pages keep the brand card. Blog posts are added from lib/blog.ts. */
export const ogCardPaths = () => (Object.keys(pages) as PagePath[]).filter((p) => p !== '/' && p !== '/intl' && 'index' in pages[p] && pages[p].index)

/** "Privacy Policy | Aviary" reads as just "Privacy Policy" on a card that already shows the logo. */
export const ogTitle = (title: string) => title.replace(/ \| Aviary$/, '')

/** The share card for a public page: its own card when it has one, else the brand card. */
export function ogImage(path: string, index: boolean, alt: string) {
  if (path === '/intl') return { ...OG_IMAGE, url: '/intl/og.png' }
  const own = index && path !== '/'
  return own ? { ...OG_IMAGE, url: `/og${path}`, alt } : OG_IMAGE
}

export function pageMetadata(path: PagePath): Metadata {
  const page = pages[path]
  const index = 'index' in page && page.index
  // Public pages carry their own keyword titles; private ones are just labelled in the tab.
  const title = index ? page.title : `Aviary | ${page.title}`
  // Dynamic IDs (an admin's user id, an invite code) never enter public canonical or social URLs.
  const canonical = path.startsWith('/admin') && path.includes('[') ? '/admin/users' : path.replace(/\/\[[^\]]+\]/g, '')
  return seoMetadata({ path: canonical, title, description: page.description, index })
}

/** Title, description, canonical, robots and social cards for any URL, including ones not in `pages` (blog posts). */
export function seoMetadata({ path, title, description, index, openGraph }: { path: string; title: string; description: string; index: boolean; openGraph?: Metadata['openGraph'] }): Metadata {
  const url = new URL(path, SITE_URL).href
  const languages = marketAlternates(path)
  const image = ogImage(path, index, title)
  return {
    title,
    description,
    alternates: { canonical: url, ...(languages && { languages }), ...(path.startsWith('/blog') && { types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'Aviary Blog' }] } }) },
    robots: { index, follow: index, ...(!index && { noarchive: true }) },
    openGraph: { type: 'website', siteName: 'Aviary', title, description, url, images: [image], ...openGraph } as Metadata['openGraph'],
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}
