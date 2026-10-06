import type { WeekRecap } from '@/src/api/weekRecap'
import { splitEmoji } from '@/src/lib/emoji'

/**
 * The first-week recap's slides: which ones show, in what order, and their
 * copy. The visual for each `kind` lives in WeekRecapVisuals.tsx. Mobile's twin is
 * Mobile/src/features/week-recap/slides.ts; keep the copy in step.
 */

/** Below this many expenses there's nothing to learn yet, so the recap asks for more instead. */
const LIGHT_WEEK = 3

// Twin of Mobile's TOP_CATEGORY_QUIPS in src/components/wrapped/WrappedCards.tsx.
const TOP_CATEGORY_QUIPS: Record<string, string> = {
  bills: "Nobody's ever posted a story about paying bills. You could be the first.",
  rent: 'The one non-negotiable of every single month.',
  food: 'No regrets, mostly.',
  'food order': 'No regrets, mostly.',
  groceries: 'Stocked and ready, always.',
  shopping: 'One more thing never hurt anyone. Probably.',
  investments: 'Future you says thanks.',
  travel: 'Home is wherever the itinerary says next.',
  entertainment: 'Main character energy.',
  outings: 'Main character energy.',
  transport: 'Always somewhere to be.',
}

function categoryQuip(category: string): string {
  return TOP_CATEGORY_QUIPS[splitEmoji(category).text.trim().toLowerCase()] ?? "That's commitment."
}

export type RecapSlideKind = 'intro' | 'light' | 'regulars' | 'hour' | 'categories' | 'biggest' | 'done'

export type RecapSlide = { kind: RecapSlideKind; color: string; ink: string; eyebrow: string; title: string; body: string }

/** Minutes after midnight, to the nearest half hour: 1230 -> "8:30pm", 1263 -> "9pm". */
export function formatMinute(minute: number): string {
  const rounded = (Math.round(minute / 30) * 30) % 1440
  const h = Math.floor(rounded / 60)
  return `${h % 12 || 12}${rounded % 60 ? ':30' : ''}${h < 12 ? 'am' : 'pm'}`
}

function hourQuip(minute: number): string {
  const h = minute / 60
  if (h < 11) return 'Early bird. We respect it.'
  if (h < 17) return 'A midday check-in. Very organised.'
  if (h < 21) return 'The evening wind-down, wallet edition.'
  return 'Night owl logging. The bird approves.'
}

export function recapSlides(recap: WeekRecap, money: (n: number) => string): RecapSlide[] {
  const n = recap.totalTransactions
  if (n < LIGHT_WEEK) {
    return [
      {
        kind: 'light', color: '#4b4fcc', ink: '#ffffff', eyebrow: 'Your first week', title: "Let's get to know you",
        body: n === 0
          ? "You haven't logged anything yet. Log a few expenses and we'll start spotting your patterns."
          : `You logged ${n} ${n === 1 ? 'expense' : 'expenses'} this week. Log a few more and we'll start spotting your patterns.`,
      },
    ]
  }

  const slides: RecapSlide[] = [
    {
      kind: 'intro', color: '#4b4fcc', ink: '#ffffff', eyebrow: 'Your first week', title: "Here's what we learned about you",
      body: `${n} expenses across ${recap.daysLogged} of 7 days.`,
    },
  ]
  const [first] = recap.repeats
  if (first) {
    slides.push({
      kind: 'regulars', color: '#cd7d00', ink: '#2e1200', eyebrow: 'Your regulars', title: `${first.item}, ${first.count} times`,
      body: first.count >= 3 ? "Not a habit. A ritual. We'll have it ready for you." : "Twice already. We'll have it ready for you.",
    })
  }
  if (recap.usualMinute !== null) {
    slides.push({
      kind: 'hour', color: '#ad2ca7', ink: '#ffffff', eyebrow: 'Your logging hour', title: `Around ${formatMinute(recap.usualMinute)}`,
      body: hourQuip(recap.usualMinute),
    })
  }
  if (recap.topCategory) {
    const name = splitEmoji(recap.topCategory.category).text || recap.topCategory.category
    slides.push({
      kind: 'categories', color: '#008140', ink: '#ffffff', eyebrow: 'Where it went', title: name,
      body: `${Math.round(recap.topCategory.pct)}% of your spending went here. ${categoryQuip(recap.topCategory.category)}`,
    })
  }
  if (recap.biggest) {
    const share = recap.totalSpent > 0 ? recap.biggest.amountInr / recap.totalSpent : 0
    slides.push({
      kind: 'biggest', color: '#c91f3a', ink: '#ffffff', eyebrow: 'Biggest spend', title: money(recap.biggest.amountInr),
      body: share >= 0.5 ? 'Half your week in one go. Bold.' : 'The splurge of the week.',
    })
  }
  slides.push({
    kind: 'done', color: '#4b4fcc', ink: '#ffffff', eyebrow: 'Week one · done', title: "You're off to a great start",
    body: "Keep logging and we'll get sharper every week.",
  })
  return slides
}
