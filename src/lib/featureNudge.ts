import type { HideableFeature } from './features'

/**
 * Hidden extras Home can offer to turn on. Twin of Mobile's src/lib/homeBanner.ts
 * minus Wrapped, which web only opens in the mobile app.
 */
export type NudgeFeature = 'subscriptions' | 'insights' | 'askAviary' | 'billScan'

/** How many logged expenses earn the Insights nudge. */
export const INSIGHTS_NUDGE_AT = 30
/** How many days with a logged expense earn the Ask Aviary nudge. */
export const ASK_NUDGE_DAYS = 7
/** How many logged expenses earn the Scan a bill nudge. */
export const SCAN_NUDGE_AT = 10

export const FEATURE_NUDGES: Record<NudgeFeature, string> = {
  subscriptions: 'Looks like you pay for a few subscriptions. Want them in one place?',
  insights: `You've logged ${INSIGHTS_NUDGE_AT} expenses. Insights can show you where it all goes.`,
  askAviary: "You've logged a week of spending. Ask Aviary can answer questions about it.",
  billScan: 'Got a receipt? Scan it and skip the typing.',
}

/**
 * At most one offer, in priority order. `null` means still loading: a
 * dismissal not read yet, or subscription suggestions still on their way. An
 * unknown candidate holds the slot empty so a lower offer never flashes first.
 */
export function pickNudge({
  hidden,
  expenses,
  subscriptionSpotted,
  dismissed,
}: {
  hidden: readonly HideableFeature[]
  expenses: readonly { date: string }[]
  subscriptionSpotted: boolean | null
  dismissed: Record<NudgeFeature, boolean | null>
}): NudgeFeature | null {
  const loggedDays = new Set(expenses.map((e) => e.date.slice(0, 10))).size
  const candidates: [NudgeFeature, boolean, boolean | null][] = [
    ['subscriptions', hidden.includes('subscriptions') && subscriptionSpotted !== false, subscriptionSpotted === null ? null : dismissed.subscriptions],
    ['insights', hidden.includes('insights') && expenses.length >= INSIGHTS_NUDGE_AT, dismissed.insights],
    ['askAviary', hidden.includes('askAviary') && loggedDays >= ASK_NUDGE_DAYS, dismissed.askAviary],
    ['billScan', hidden.includes('billScan') && expenses.length >= SCAN_NUDGE_AT, dismissed.billScan],
  ]
  for (const [kind, applies, isDismissed] of candidates) {
    if (!applies || isDismissed === true) continue
    return isDismissed === false ? kind : null
  }
  return null
}
