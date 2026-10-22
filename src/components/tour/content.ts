// Static copy and demo data for the guided tour (app/account/guided-tour).
// Every number here is fake. Nothing in this file reads or writes real money,
// which is what lets each chapter be poked at without consequence.
//
// Twin of Mobile's src/components/tour/content.ts. `href` targets Web routes
// instead of Expo routes — chapter 2 and 5 have no route of their own on Web
// (log-expense and money-brain are a modal and a drawer, not pages), so their
// `linkNote` spells out how to reach them from the page they link to instead.

import type { HideableFeature } from '@/src/lib/features'
import { ArchiveIcon, BowlFoodIcon, BrainIcon, CameraIcon, ChartBarIcon, CreditCardIcon, HeadphonesIcon, HouseIcon, LockIcon, ReceiptIcon, RepeatIcon, ShoppingBagIcon, ShoppingCartIcon, TelevisionIcon, TicketIcon, TrendUpIcon } from '@/src/components/icons'

export interface Chapter {
  /** Row title on the hub, and the header subtitle while the chapter is open. */
  title: string
  blurb: string
  kicker: string
  lede: string
  /** The one thing to try. Swapped for a done line once the chapter completes. */
  nudge: string
  /** "Try it for real" row: label plus the real route it opens. */
  linkLabel: string
  href: string
  /** Overrides the row's default subtitle — for a chapter whose real screen
   * needs an extra step spelled out (e.g. opening a modal from elsewhere). */
  linkNote?: string
  /** The extra the real page belongs to; its link hides while that extra is off. */
  feature?: HideableFeature
}

export const CHAPTERS: Chapter[] = [
  {
    title: 'Categories & Ready to Assign',
    blurb: 'Money gets a job before it gets spent.',
    kicker: 'CHAPTER 1 OF 7',
    lede: "Your income shows up as one number, Ready to Assign. Hand it out to your categories until there's nothing left.",
    nudge: 'Fund all four. Get Ready to Assign to zero.',
    linkLabel: 'Open Home',
    href: '/expense',
    linkNote: 'Click a category, then "Edit assigned amount"',
  },
  {
    title: 'Logging money',
    blurb: 'One expense drains one category. Nothing else.',
    kicker: 'CHAPTER 2 OF 7',
    lede: 'Log what you spent and it comes out of that category only. So Fun going wild never quietly eats Groceries.',
    nudge: 'Log one and watch exactly one bar move.',
    linkLabel: 'Open Log expense',
    href: '/expense',
    linkNote: 'Click "Log expense" on Home',
  },
  {
    title: 'Pull money',
    blurb: 'Short somewhere? Borrow from somewhere with slack.',
    kicker: 'CHAPTER 3 OF 7',
    lede: "A category can't cover a bill. Pull the difference from one that can. Sources are ranked by how much room they actually have.",
    nudge: 'Cover the ₹1,400 shortfall. Pick a source.',
    linkLabel: 'Open Home',
    href: '/expense',
    linkNote: 'Click a category, then "Pull money from categories"',
  },
  {
    title: 'The new month',
    blurb: 'Your plan carries. So does whatever you didn\'t spend.',
    kicker: 'CHAPTER 4 OF 7',
    lede: 'This is the bit everyone gets wrong, so we made it a quiz.',
    nudge: 'Answer, then flip to October 1.',
    linkLabel: 'Open Insights',
    href: '/insights',
    feature: 'insights',
  },
  {
    title: 'Understanding your money',
    blurb: 'Insights, plus a brain you can interrogate.',
    kicker: 'CHAPTER 5 OF 7',
    lede: 'Insights steps back month by month: normal or not, where it went, a daily heatmap. Ask Aviary answers in plain language, having actually read your categories.',
    nudge: 'Ask it something nosy.',
    linkLabel: 'Open Ask Aviary',
    href: '/expense',
    linkNote: 'Opens the Ask Aviary drawer',
    feature: 'askAviary',
  },
  {
    title: 'Notifications',
    blurb: 'What pings you, when, and how to hush it.',
    kicker: 'CHAPTER 6 OF 7',
    lede: 'Nothing here pings you for fun. Every notification is tied to your categories, your bills or your month, and every one has a switch.',
    nudge: 'Push Groceries past its thresholds, then try three kinds.',
    linkLabel: 'Open Account',
    href: '/account',
    linkNote: 'Digest cadence lives under Notifications',
  },
  {
    title: 'Everything else',
    blurb: 'Six smaller things, one line each.',
    kicker: 'CHAPTER 7 OF 7',
    lede: "The rest of the app on one screen. Click whatever you're curious about.",
    nudge: 'Open a couple.',
    linkLabel: 'Open Archive',
    href: '/account/archive',
  },
]

export const TOUR_INCOME = 42000

export const ASSIGN_ROWS = [
  { id: 'rent', name: 'Rent', icon: HouseIcon, plan: 22000 },
  { id: 'groceries', name: 'Groceries', icon: ShoppingCartIcon, plan: 9000 },
  { id: 'bills', name: 'Bills', icon: ReceiptIcon, plan: 6000 },
  { id: 'fun', name: 'Fun', icon: TicketIcon, plan: 5000 },
] as const

export const SPEND_ROWS = [
  { id: 'groceries', name: 'Groceries', icon: ShoppingCartIcon, plan: 9000, spent: 3000 },
  { id: 'eatout', name: 'Eating Out', icon: BowlFoodIcon, plan: 4000, spent: 2200 },
  { id: 'shopping', name: 'Shopping', icon: ShoppingBagIcon, plan: 6000, spent: 1500 },
] as const

export const LOG_CHIPS = [
  { id: 'g', category: 'groceries', amount: 450, what: 'Grocery run', method: 'Bank', icon: ShoppingCartIcon },
  { id: 'e', category: 'eatout', amount: 700, what: 'Pizza night', method: 'Card', icon: BowlFoodIcon },
  { id: 's', category: 'shopping', amount: 1900, what: 'Running shoes', method: 'Card', icon: ShoppingBagIcon },
] as const

/** The bill chapter 3 is short on, and how much is already in its envelope. */
export const MOVE_NEED = 2000
export const MOVE_IN_ENVELOPE = 600
export const MOVE_AMOUNT = 1400

export const MOVE_SOURCES = [
  { id: 'fun', name: 'Fun', icon: TicketIcon, available: 4000, note: 'Mostly unspent · safe to borrow' },
  { id: 'shopping', name: 'Shopping', icon: ShoppingBagIcon, available: 2000, note: '45% of budget left' },
  { id: 'rent', name: 'Rent', icon: HouseIcon, available: 9000, note: 'Set aside · bill due 5th', protected: true },
] as const

export const ROLLOVER_ROWS = [
  { name: 'Groceries', icon: ShoppingCartIcon, plan: 9000, left: 1200, creditCard: false },
  { name: 'Fun', icon: TicketIcon, plan: 5000, left: 2600, creditCard: false },
  { name: 'Rent', icon: HouseIcon, plan: 22000, left: 0, creditCard: false },
  { name: 'Credit Card Payment', icon: CreditCardIcon, plan: 2600, left: 2600, creditCard: true },
] as const

export const QUIZ_QUESTION = 'You end September with ₹2,600 still sitting in Fun. On the 1st, what happens to it?'

export const QUIZ_OPTIONS = [
  {
    id: 'a',
    label: "It rolls into October's Fun. ₹7,600 to play with",
    correct: true,
    feedback:
      "Exactly. Your ₹5,000 plan carries, and the ₹2,600 you didn't spend comes along on top. Want it somewhere else? Move it.",
  },
  {
    id: 'b',
    label: 'It is gone. October starts fresh, with the same ₹5,000 plan',
    correct: false,
    feedback: "Not here. Money you don't spend stays in its category, so nothing you saved up disappears on the 1st.",
  },
  {
    id: 'c',
    label: 'It goes back to Ready to Assign to redistribute',
    correct: false,
    feedback:
      'Close, but no. It stays in Fun. You can move it to Ready to Assign yourself, and there\'s no "start new month" button to press.',
  },
] as const

/** Chapter 5's normal-month comparison, mirroring what Insights actually plots. */
export const NORMAL_BARS = [
  { label: 'This month so far', value: 18400, accent: true },
  { label: 'Usual by day 22', value: 16500, accent: false },
] as const
export const NORMAL_BAR_MAX = 22000

export const BRAIN_ASKS = [
  {
    q: 'Am I overspending?',
    a: "You're ₹1,900 ahead of your usual pace and it's almost entirely Shopping, the shoes. Groceries and Fun are both tracking normal.",
  },
  {
    q: 'Where did Fun go?',
    a: "₹2,400 of Fun this month: two dinners out and a concert ticket. There's still ₹2,600 left in Fun.",
  },
  {
    q: 'Can I afford a ₹8,000 trip?',
    a: "Not without borrowing. Fun and Shopping together have ₹6,600 of slack. The rest would have to come out of next month's plan.",
  },
] as const

export const EXTRAS = [
  {
    name: 'Expense Wrapped',
    icon: HeadphonesIcon,
    desc: 'A monthly story of your spending: total, top category, biggest buy, streaks, badges and a spending archetype, with music and a card worth sharing. It unlocks on the 1st once you\'ve logged enough.',
  },
  {
    name: 'Subscriptions',
    icon: TelevisionIcon,
    desc: 'Every recurring service with its cycle and next due date, an allocation bar in Insights with brand colors, and a nudge before it renews.',
  },
  {
    name: 'Activity & Archive',
    icon: ArchiveIcon,
    desc: 'Every transaction in one searchable, filterable list with a running total. Delete something and it waits in the Archive on a countdown. Restore one thing, or all of it.',
  },
  {
    name: 'Investments',
    icon: TrendUpIcon,
    desc: 'Log holdings by type, from equity and FDs to mutual funds, gold, crypto and bonds, then see the portfolio total plus allocation at a glance.',
  },
  {
    name: 'Scan a bill',
    icon: CameraIcon,
    desc: 'Photograph or drag in a receipt and it reads the line items, splits them by however many people ate, and files each into a category before logging.',
  },
  {
    name: 'Your data & privacy',
    icon: LockIcon,
    desc: 'Export everything to a file or wipe your transactions. Yours, always. Light, dark or system theme, and a switch that blurs every amount the moment the page opens.',
  },
] as const

/** Chapter 6's envelope: tap to spend and watch the alert thresholds fire. */
export const NOTIFY_ENVELOPE = { name: 'Groceries', icon: ShoppingCartIcon, plan: 9000, spent: 3000, step: 1700 } as const
export const NOTIFY_PCTS = [50, 90, 100] as const

export type NotifyCadence = 'off' | 'weekly' | 'daily'

/**
 * Every other kind of push the app sends, mirroring Web's
 * lib/notifications/rules.ts and the cron in app/api/notifications/run.
 * `digestGated` kinds go quiet when the digest cadence is Off, same as the server.
 */
export const NOTIFY_KINDS = [
  {
    id: 'bill',
    label: 'Bill reminder',
    icon: ReceiptIcon,
    title: 'Netflix renews soon',
    body: '₹649 due in 3 days (Oct 3).',
    when: 'Before a subscription renews: 1, 3 or 7 days ahead, you pick.',
    control: 'Its own switch, plus lead time. Rides along with the digest, so Off silences it.',
    digestGated: true,
  },
  {
    id: 'digest',
    label: 'Digest',
    icon: ChartBarIcon,
    title: 'Your spending update',
    body: '₹18,400 spent this month · ₹23,600 left · 8 days to go.',
    when: 'Daily: one line every day, so the month never sneaks up on you. Weekly: the same line once a week, if daily feels chatty.',
    control: 'Off, Weekly or Daily. Off by default.',
    digestGated: true,
  },
  {
    id: 'coach',
    label: 'AI coach',
    icon: BrainIcon,
    title: 'Heads up on this month',
    body: 'Shopping is running hot. Fun has ₹4,000 of slack that could cover it guilt-free.',
    when: "At most once a week, and only when you're on pace to overspend or a category already has. AI reads your real categories and writes one concrete fix. It never invents a number, and if AI is down you get the plain math instead.",
    control: 'Smart nudge switch. Rides along with the digest, so Off silences it.',
    digestGated: true,
  },
  {
    id: 'auto',
    label: 'Auto-added',
    icon: RepeatIcon,
    title: 'Spotify charged',
    body: '₹119 auto-added for Spotify.',
    when: 'The day a subscription, recurring expense or SIP comes due, it logs itself and tells you. Think receipt, not nudge.',
    control: 'Always on while the recurring item exists. Pause or delete the item to stop it.',
    digestGated: false,
  },
  {
    id: 'wrapped',
    label: 'Wrapped',
    icon: HeadphonesIcon,
    title: 'Your Wrapped is ready',
    body: 'Your September Expense Wrapped just unlocked.',
    when: "Once a month, on the 1st, when last month's story is ready.",
    control: 'Its own switch. Works even with the digest Off.',
    digestGated: false,
  },
] as const
