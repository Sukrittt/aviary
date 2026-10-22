import { HOW_CATEGORIES_WORK, LOGGING_WAYS, landingFaqs } from '@/src/components/landing/faqs'
import type { ChangelogRelease } from '@/src/lib/changelog'

/**
 * What Ask Aviary knows about the app itself, sent only on turns the router
 * flags as product questions (chatRouter's isProductHelp), so money answers
 * don't pay for it. Built from the same copy as /help and the landing FAQ, so
 * the chat can't drift from what the site says. No em dashes: the model
 * mirrors the punctuation it's shown.
 */

// Ruled-out features people still ask for. Without these the model tends to
// describe a bank sync or an IOU tracker that doesn't exist.
const NOT_IN_AVIARY = [
  'No bank linking. Aviary never reads SMS or notifications. You log spends yourself; for a missed week, upload payment app screenshots or a statement.',
  "No account balances. Payment methods (UPI, card, cash) are labels on a spend. The number that matters is what's left in each category.",
  'No tracking of money lent or owed. Log only your own share of a shared spend.',
  'No EMI or loan type. Add an EMI as a recurring expense.',
  'No refund matching. Log a refund as income; it lands in Ready to Assign, and you assign it to whichever category you like.',
  'No currency conversion, and no logging in two currencies at once: each budget has one currency. For a trip abroad, make a separate budget in that currency (More, then New budget) and switch to it while you travel.',
  'No separate bills calendar. Subscriptions and recurring expenses are the upcoming bills.',
]

// Labels checked against the Mobile and Web code on 2026-10-22. Update these when a screen moves.
const PLACES = [
  'Android tabs: Home, Activity, Categories, More, plus a + button to log a spend. On the web: Home, Activity, Insights, More in the tab bar, a sidebar, and settings under Account.',
  'Log a spend: tap + (web: Log expense in the sidebar, or +). Type several at once in Ask Aviary: More, then Ask Aviary.',
  'Categories: the Categories tab, then Add category, or New group for a group. Tap a category to Edit or Delete it. Web: Categories in the sidebar, or Manage on Home.',
  "Change how much a category gets: on Home tap the category, then Edit assigned amount. Web: the category's menu on Home, then Edit assigned amount, or Assign from Ready to Assign.",
  "Edit or delete a spend: on Activity tap it, then Edit or Delete (or long-press it). Web: the row's menu on Activity, then Edit transaction or Delete transaction. Deleted spends sit in More, then Archive (web: Account, then Archive) for seven days, where you can restore them.",
  'Current prices: the Pricing page on the website, or More, then Plan & billing. Web prices depend on your country and Google Play sets its own, so there is no single number to quote.',
  "Aviary's own plan: More, then Plan & billing. On Android the plan is a Google Play subscription: cancel it with Manage in Google Play. Web: Account, then Plan & billing, then Cancel subscription. The Subscriptions screen is for tracking your own subscriptions, not Aviary's plan.",
  'Dark mode: More, then Appearance (Light, Dark or Auto). Web: Account, then Appearance, or Dark mode in the sidebar.',
  'Widget (Android only): More, then Add widget to home screen.',
  'Scan a bill: More, then Scan a bill, then Take a photo or Choose a screenshot. Web: Account, then Scan a bill. Mark shared items as split two or three ways and Aviary works out your share.',
  'Expense Wrapped, your spending story: More, then Expense Wrapped, once it is ready. Android only.',
  'Help, bugs and ideas: More, then Help & feedback (web: Account, then Help & feedback) for the Feedback board, Report a bug, the guided tour and the changelog.',
  'Who builds Aviary: one person in India. The code is open source on GitHub.',
  'Catch up from a statement: More, then Add from statement (also in the + menu). Pick screenshots (GPay, PhonePe, Paytm, a bank app) or a CSV, Excel or PDF statement, untick anything that isn\'t yours, then tap Log.',
  'Shared budget: More, then New budget. Your personal budget can\'t be shared. In the new budget, More, then Share this budget, to get a link and a six-letter code. Others tap the link or use Join with a code under More. Switch budgets with Switch budget under More.',
  'Recurring expense (rent, an EMI): More, then Recurring expenses, then Add a recurring expense. Web: Account, then Recurring expenses, then Add recurring.',
  'Subscription: More, then Subscriptions, then Add. Web: Account, then Subscriptions, then Add subscription. Each shows its price, how often it renews and the next due date, with monthly and yearly totals. Aviary nudges you a few days before a renewal, and suggests a recurring expense or subscription when you log the same thing at the same amount a few months running.',
  'Income (salary, a refund): on Home tap Income, then Add income, or use Add income in the + menu, or More, then Income, then One-off. Web: Account, then Income, then One-off. It lands in Ready to Assign.',
  'Cover an overspent category: tap the category, then Pull money from categories, then Cover overspend. Web: the category\'s menu, then Pull money from categories.',
  'Currency: More, then Currency (web: Account, then Currency). In a shared budget only the owner can change it.',
  'Turn Ask Aviary off: More, then Features (web: Account, then Features).',
  'Habit nudges: More, then Notifications, then Log it reminders under Habits. Renewal reminders are under Bills.',
  'Export: More, then Your data, then Export. Delete your account: More, then Account & security, then Delete account. On the web both are under Account.',
]

function releaseLine(r: ChangelogRelease): string {
  const app = r.platform === 'mobile' ? 'Android' : 'Web'
  const when = r.publishedAt?.slice(0, 10) ?? ''
  const label = [when, `${app}${r.version ? ` ${r.version}` : ''}`].filter(Boolean).join(', ')
  return `- ${label}: ${r.title}.${r.highlights.length ? ` ${r.highlights.join(' ')}` : ''}`
}

/** `releases`: newest first, from lib/changelog.ts recentReleases(). */
export function buildProductGuide(currencyCode: string | undefined, releases: ChangelogRelease[]): string {
  return [
    'PRODUCT GUIDE (how the Aviary app works):',
    `How categories work: ${HOW_CATEGORIES_WORK}`,
    'Ways to log:',
    ...LOGGING_WAYS.map(({ title, text }) => `- ${title} ${text}`),
    'Where things are:',
    ...PLACES.map((p) => `- ${p}`),
    'Not in Aviary:',
    ...NOT_IN_AVIARY.map((p) => `- ${p}`),
    'Common questions:',
    ...landingFaqs((currencyCode ?? 'INR') !== 'INR').map(({ q, a }) => `Q: ${q}\nA: ${a}`),
    ...(releases.length ? ['RECENT UPDATES (newest first):', ...releases.map(releaseLine)] : []),
  ].join('\n')
}
