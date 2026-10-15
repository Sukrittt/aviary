import type { Metadata } from 'next'

export const SITE_URL = new URL('https://useaviary.com')

// Only public content belongs in search results. Auth, personal finance and
// admin pages still get descriptive browser titles without exposing user data.
export const pages = {
  '/': { title: 'Aviary: Budget App & Expense Tracker for India', description: 'A budget app for India that learns when you spend and nudges you to log it in one tap. Give every rupee a job. No bank link. Android and web, free for 30 days.', index: true },
  '/intl': { title: 'Aviary: Budget App & Expense Tracker That Learns Your Habits', description: 'A budget app that learns when you spend and nudges you to log it in one tap. Give every dollar a job, no bank link. Android and web, free for 30 days.', index: true },
  '/changelog': { title: 'Aviary Changelog: What’s New in the Budget App', description: 'Every Aviary release in one place: new features, improvements and fixes for the budget app on the web, newest first.', index: true },
  '/help': { title: 'Aviary Help: How Categories, Logging and Budgets Work', description: 'How Aviary’s categories and Ready to Assign work, how to log fast or catch up on missed days, plus answers on pricing, privacy and bank linking.', index: true },
  '/legal/privacy': { title: 'Privacy Policy | Aviary', description: 'How Aviary stores and processes your data: encryption, AI features, analytics, and how you export or delete everything. No ads, and your data is never sold.', index: true },
  '/legal/terms': { title: 'Terms of Service | Aviary', description: 'The terms for using Aviary, the budget app: account requirements, acceptable use, subscriptions, and your responsibilities.', index: true },
  '/legal/pricing': { title: 'Aviary Pricing: Free 30-Day Trial, Then Monthly or Yearly', description: 'Try the whole Aviary budget app free for 30 days, no card needed. Then pick a monthly or yearly plan on the web or Google Play. Cancel any time.', index: true },
  '/legal/refunds': { title: 'Refunds and Cancellation | Aviary', description: 'How to cancel your Aviary subscription, what happens to your access, and which charges can be refunded.', index: true },
  '/legal/contact': { title: 'Contact Aviary Support', description: 'Reach the person who builds Aviary for help with your account, billing, refunds or privacy. You’ll hear back within 3 working days.', index: true },
  '/legal/delete-account': { title: 'Delete Your Aviary Account', description: 'How to delete your Aviary account and personal data from the app, or ask support to do it for you.', index: true },
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

/** 1200×630 share card, rendered by app/og.png/route.tsx. */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'Aviary: the budget app that learns your spending' }

export function pageMetadata(path: PagePath): Metadata {
  const page = pages[path]
  const index = 'index' in page && page.index
  // Public pages carry their own keyword titles; private ones are just labelled in the tab.
  const title = index ? page.title : `Aviary | ${page.title}`
  // Dynamic admin IDs never enter public canonical or social URLs.
  const url = new URL(path.includes('[') ? '/admin/users' : path, SITE_URL).href
  const languages = marketAlternates(path)

  return {
    title,
    description: page.description,
    alternates: { canonical: url, ...(languages && { languages }) },
    robots: { index, follow: index, ...(!index && { noarchive: true }) },
    openGraph: {
      type: 'website',
      siteName: 'Aviary',
      title,
      description: page.description,
      url,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description: page.description, images: [OG_IMAGE] },
  }
}
