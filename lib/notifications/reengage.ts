import { nowIn } from '@/lib/http'

/**
 * Come-back nudges for users who've stopped opening the app. A push on quiet
 * day 3, 7, 14 and 30, then silence until they're back. Sent from the evening
 * check's window, which pauses itself once these take over.
 */

export const REENGAGE_STEPS = [3, 7, 14, 30] as const
export type ReengageStep = (typeof REENGAGE_STEPS)[number]

const COPY: Record<ReengageStep, Array<{ title: string; body: string }>> = {
  3: [
    { title: 'Psst', body: 'Your wallet\'s been quiet. Too quiet. Log a spend?' },
    { title: 'Lowkey miss you', body: 'Three days, zero spends. Catch up in a minute.' },
  ],
  7: [
    { title: 'It\'s been a week', body: 'Your envelopes are giving abandoned. Pop back in?' },
    { title: 'Not us checking on you', body: 'A week off the books. Let\'s get you caught up.' },
  ],
  14: [
    { title: 'Two weeks, bestie', body: 'Your budget\'s out here guessing. Give it some numbers.' },
    { title: 'Your birds miss you', body: '14 days of mystery spending. Let\'s fix that.' },
  ],
  30: [
    { title: 'We\'re not mad', body: 'Just a little disappointed. A fresh start\'s one tap away.' },
    { title: 'Fresh start?', body: 'No backlog guilt. Log today and pick up from here.' },
  ],
}

/** Whole local calendar days between `lastSeen` and `at`, in the user's zone. */
export function quietDays(lastSeen: Date, tz: string | undefined, at: Date): number {
  const from = Date.parse(`${nowIn(tz, lastSeen).date}T00:00:00Z`)
  const to = Date.parse(`${nowIn(tz, at).date}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}

/** The furthest step passed, or null before day 3. Someone gone 60 days gets day 30's line once, not all four. */
export function reengageStep(days: number): ReengageStep | null {
  let step: ReengageStep | null = null
  for (const s of REENGAGE_STEPS) if (days >= s) step = s
  return step
}

/** Two lines per step, alternating by date like the evening check's copy. */
export function reengageCopy(step: ReengageStep, date: string): { title: string; body: string } {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
  const lines = COPY[step]
  return lines[day % lines.length]
}
