import type { HideableFeature, UserDoc } from './users'

/** Extras an account created on or after OPT_IN_SINCE starts without. Mirrors Mobile's src/lib/features.ts. */
export const OPT_IN_FEATURES: HideableFeature[] = ['askAviary', 'billScan', 'wrapped', 'investments', 'subscriptions', 'insights']
export const OPT_IN_SINCE = new Date('2026-10-12T00:00:00.000Z')

/** What's hidden for this user: their saved choice, else the default for their account's age. Same rule as Mobile. */
export function hiddenFeatures(user: Pick<UserDoc, 'hiddenFeatures' | 'createdAt'>): HideableFeature[] {
  if (user.hiddenFeatures) return user.hiddenFeatures
  return user.createdAt && new Date(user.createdAt) >= OPT_IN_SINCE ? OPT_IN_FEATURES : []
}
