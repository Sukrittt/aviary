import type { Metadata } from 'next'

export const SITE_URL = new URL('https://useaviary.com')

// Only public content belongs in search results. Auth, personal finance and
// admin pages still get descriptive browser titles without exposing user data.
export const pages = {
  '/': { title: 'Envelope Budgeting & Expense Tracking', description: 'Give your money a job with Aviary. Plan envelopes, track expenses, subscriptions and investments in your currency, on Android and the web.', index: true },
  '/legal/privacy': { title: 'Privacy Policy', description: 'Learn how Aviary stores and processes your data, including encryption, AI features, analytics, and your options to export or delete it.', index: true },
  '/legal/terms': { title: 'Terms of Service', description: 'Read the terms for using Aviary, including account requirements, acceptable use, subscriptions, and your responsibilities.', index: true },
  '/legal/delete-account': { title: 'Delete Your Account', description: 'Learn how to delete your Aviary account and personal data from the app, or request account deletion through support.', index: true },
  '/sign-in': { title: 'Sign In', description: 'Sign in to Aviary with Google or a one-time email code to access your budget across Android and the web.' },
  '/email': { title: 'Sign In with Email', description: 'Enter your email to receive a one-time sign-in code for your Aviary account.' },
  '/code': { title: 'Verify Your Sign-In Code', description: 'Verify your one-time email code to securely sign in to Aviary.' },
  '/onboarding': { title: 'Set Up Your Budget', description: 'Choose your currency, add your income, and create your first budget envelopes in Aviary.' },
  '/expense': { title: 'Budget Dashboard', description: 'Review your monthly budget, available money, recent expenses, and spending plan in Aviary.' },
  '/expense/envelopes': { title: 'Budget Envelopes', description: 'Assign money to your envelopes, review available balances, and move money as your plans change.' },
  '/expense/transactions': { title: 'Transaction Activity', description: 'Review, search, and manage your expense history and transaction activity in Aviary.' },
  '/insights': { title: 'Spending Insights', description: 'Explore your spending by category and month, compare it with your budget, and understand where your money goes.' },
  '/investments': { title: 'Investments', description: 'Track your investment holdings, contributions, withdrawals, and progress in Aviary.' },
  '/wrapped': { title: 'Expense Wrapped', description: 'Explore your Aviary spending recap, with highlights and patterns from your year in expenses.' },
  '/account': { title: 'Account & Settings', description: 'Manage your Aviary profile, currency, appearance, and account preferences.' },
  '/account/archive': { title: 'Archived Entries', description: 'Review and restore your archived Aviary transactions and entries.' },
  '/account/bill-scans': { title: 'Bill Scans', description: 'Review your scanned receipts and the expenses created from them in Aviary.' },
  '/account/chat-history': { title: 'Money Brain Chat History', description: 'Browse your past Money Brain conversations about your Aviary budget and spending.' },
  '/account/data': { title: 'Data & Privacy', description: 'Manage analytics preferences, export your Aviary data, and review your data controls.' },
  '/account/feedback': { title: 'Feedback & Ideas', description: 'Report an issue or share an idea to improve Aviary.' },
  '/account/guided-tour': { title: 'Guided Tour', description: 'Learn how to assign money, log expenses, and use your budget with Aviary’s guided tour.' },
  '/account/help': { title: 'Help & Support', description: 'Learn how Aviary envelopes work and find help with your budget and account.' },
  '/account/recurring': { title: 'Recurring Expenses', description: 'Manage recurring expenses and reminders for regular purchases in your Aviary budget.' },
  '/account/security': { title: 'Account Security', description: 'Manage your sign-in methods, email, active sessions, and account security in Aviary.' },
  '/account/subscriptions': { title: 'Subscriptions', description: 'Track subscriptions, renewal dates, and recurring service costs in Aviary.' },
  '/account/trial-notice': { title: 'Your Trial Plan', description: 'Review how your Aviary trial works and what to expect when payments launch.' },
  '/admin': { title: 'Admin Overview', description: 'Aviary administration overview for authorized administrators.' },
  '/admin/ai': { title: 'Admin AI Usage', description: 'Review Aviary AI usage and processing costs.' },
  '/admin/audit': { title: 'Admin Audit Log', description: 'Review audited administrative actions in Aviary.' },
  '/admin/feedback': { title: 'Admin Feedback Inbox', description: 'Review and triage Aviary user feedback.' },
  '/admin/jobs': { title: 'Admin Jobs', description: 'Review scheduled Aviary jobs and their recent runs.' },
  '/admin/subscriptions': { title: 'Admin Billing & Subscriptions', description: 'Manage Aviary billing accounts and subscription access.' },
  '/admin/system': { title: 'Admin System Settings', description: 'Manage Aviary system settings and service availability.' },
  '/admin/users': { title: 'Admin Users', description: 'Review Aviary users and account status.' },
  '/admin/users/[id]': { title: 'Admin User Details', description: 'Review account details and administrative controls for an Aviary user.' },
} satisfies Record<string, { title: string; description: string; index?: boolean }>

export type PagePath = keyof typeof pages

export const publicPagePaths = (Object.keys(pages) as PagePath[]).filter(
  (path) => 'index' in pages[path] && pages[path].index,
)

export function pageMetadata(path: PagePath): Metadata {
  const page = pages[path]
  const title = `Aviary | ${page.title}`
  const index = 'index' in page && page.index
  // Dynamic admin IDs never enter public canonical or social URLs.
  const url = new URL(path.includes('[') ? '/admin/users' : path, SITE_URL).href
  const image = { url: '/icon.png', width: 512, height: 512, alt: 'Aviary bird app icon' }

  return {
    title,
    description: page.description,
    alternates: { canonical: url },
    robots: { index, follow: index, ...(!index && { noarchive: true }) },
    openGraph: {
      type: 'website',
      siteName: 'Aviary',
      title,
      description: page.description,
      url,
      images: [image],
    },
    twitter: { card: 'summary', title, description: page.description, images: [image] },
  }
}
