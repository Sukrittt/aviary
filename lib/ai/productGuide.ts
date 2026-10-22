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
  'No currency conversion. One display currency per budget.',
  'No separate bills calendar. Subscriptions and recurring expenses are the upcoming bills.',
]

// Labels checked against the Mobile and Web code on 2026-10-22. Update these when a screen moves.
const PLACES = [
  'Android tabs: Home, Activity, Categories, More. On the web, settings and lists live under Account.',
  'Catch up from a statement: More, then Add from statement (also in the + menu). Pick screenshots (GPay, PhonePe, Paytm, a bank app) or a CSV, Excel or PDF statement, untick anything that isn\'t yours, then tap Log.',
  'Shared budget: More, then New budget. Your personal budget can\'t be shared. In the new budget, More, then Share this budget, to get a link and a six-letter code. Others tap the link or use Join with a code under More. Switch budgets with Switch budget under More.',
  'Recurring expense (rent, an EMI): More, then Recurring expenses, then Add a recurring expense. Web: Account, then Recurring expenses, then Add recurring.',
  'Subscription: More, then Subscriptions, then Add. Web: Account, then Subscriptions, then Add subscription. Each shows its price, how often it renews and the next due date, with monthly and yearly totals. Aviary nudges you a few days before a renewal, and suggests a recurring expense or subscription when you log the same thing at the same amount a few months running.',
  'Income (salary, a refund): on Home tap Income, then Add income, or use Add income in the + menu, or More, then Income, then One-off. Web: Account, then Income, then One-off. It lands in Ready to Assign.',
  'Cover an overspent category: tap the category, then Pull money from categories, then Cover overspend. Web: the category\'s menu, then Pull money from categories.',
  'Bill scanning: point the camera at a receipt or pick a photo. Mark shared items as split two or three ways and Aviary works out your share. Works on Android and the web.',
  'Currency: More, then Currency (web: Account, then Currency). In a shared budget only the owner can change it.',
  'Turn Ask Aviary off: More, then Features (web: Account, then Features).',
  'Habit nudges: More, then Notifications, then Log it reminders under Habits. Renewal reminders are under Bills.',
  'Export: More, then Your data, then Export. Delete your account: More, then Account & security, then Delete account. On the web both are under Account.',
  'On the web, the guided tour walks you through your own budget.',
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
