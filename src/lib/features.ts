// Type-only: lib/users pulls in the DB driver, which can't reach the client bundle.
import type { HideableFeature } from '@/lib/users'

export type { HideableFeature }

/** Labels for More → Features. Twin of Mobile's src/lib/features.ts HIDEABLE_FEATURES, same order. */
export const FEATURE_LABELS: Record<HideableFeature, { label: string; hint: string }> = {
  askAviary: { label: 'Ask Aviary', hint: 'Ask about your spending' },
  insights: { label: 'Insights', hint: 'Trends and breakdowns' },
  investments: { label: 'Investments', hint: 'Portfolio at a glance' },
  billScan: { label: 'Scan a bill', hint: 'Split a cart or receipt' },
  income: { label: 'Income', hint: 'What comes in and when' },
  accounts: { label: 'Accounts', hint: 'Bank, card and cash' },
  recurring: { label: 'Recurring expenses', hint: 'Plan upcoming payments' },
  subscriptions: { label: 'Subscriptions', hint: 'What renews and when' },
  wrapped: { label: 'Expense Wrapped', hint: 'Your monthly recap' },
}

export const FEATURE_ORDER = Object.keys(FEATURE_LABELS) as HideableFeature[]

/** Extras a new account starts without; the core budget stays on. */
export const OPT_IN_FEATURES: HideableFeature[] = ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions', 'insights']

/**
 * Accounts created from this moment start with OPT_IN_FEATURES off. Older
 * accounts that never touched Features keep everything on.
 */
export const OPT_IN_SINCE = new Date('2026-10-12T00:00:00.000Z')

type FeatureUser = { hiddenFeatures?: HideableFeature[]; createdAt?: string | Date | null }

/**
 * What's hidden for this user: their saved choice, else the default for their account's age. Same rule as Mobile.
 * Until the profile loads, the extras stay hidden: one popping in beats one you turned off flashing and vanishing.
 */
export function hiddenFeatures(user: FeatureUser | null | undefined): HideableFeature[] {
  if (!user) return OPT_IN_FEATURES
  if (user.hiddenFeatures) return user.hiddenFeatures
  return user.createdAt && new Date(user.createdAt) >= OPT_IN_SINCE ? OPT_IN_FEATURES : []
}

/**
 * A new account that hasn't said which extras it wants, here or on Mobile.
 * Home's extras card shows until it has. Accounts from before OPT_IN_SINCE
 * started with everything on, so there's nothing to offer them. Same rule as Mobile.
 */
export function extrasUnchosen(user: (FeatureUser & { onboardedAt?: string | null }) | null | undefined): boolean {
  return !!user?.onboardedAt && !user.hiddenFeatures && !!user.createdAt && new Date(user.createdAt) >= OPT_IN_SINCE
}
