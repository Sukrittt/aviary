import type { Experimental_EvaluationQuestion } from 'ai'
import { resolveCurrency } from '@/src/lib/currencies'
import { runJev } from './jev'
import type { AiCaller } from './usage'
import type { SummarizeExpensesResult } from './expenseContext'

/**
 * The brief's cards and follow-up questions are built here, in code, from the
 * same numbers the dashboard shows. Jev only chooses which of them to surface
 * (see `rankBrief`), and Gemini only writes the narrative line, so no model
 * ever authors a figure the user reads.
 */

export interface BriefCard {
  icon: string
  title: string
  subtitle: string
  valueLabel: string
  amount: number
  tone: 'mint' | 'violet' | 'coral' | 'warn'
}

export interface BriefCandidates {
  cards: BriefCard[]
  questions: string[]
}

/** Candidates are listed best-guess first, so ties and a Jev outage both degrade to a sane order. */
export function buildBriefCandidates(ctx: SummarizeExpensesResult, currencyCode: string): BriefCandidates {
  const valueLabel = resolveCurrency(currencyCode)
  const { meta, highlights } = ctx
  const spending = ctx.envelopes.filter((e) => !e.isCreditCardPayment)
  const cards: BriefCard[] = []
  // One card per category, so the same envelope can't win two of the three slots.
  const used = new Set<string>()

  const worstOverspent = [...spending].filter((e) => e.isOverspent).sort((a, b) => a.available - b.available)[0]
  if (worstOverspent) {
    cards.push({
      icon: '🚨',
      title: worstOverspent.category,
      subtitle: "You've gone past this budget",
      valueLabel,
      amount: Math.round(Math.abs(worstOverspent.available)),
      tone: 'warn',
    })
    used.add(worstOverspent.category)
  }

  const heaviest = [...spending].sort((a, b) => b.spent - a.spent).find((e) => !used.has(e.category))
  if (heaviest && heaviest.spent > 0) {
    cards.push({
      icon: '🔥',
      title: heaviest.category,
      subtitle: 'Your heaviest category this month',
      valueLabel,
      amount: Math.round(heaviest.spent),
      tone: 'violet',
    })
    used.add(heaviest.category)
  }

  const remaining = Math.round(meta.totalAssigned - meta.totalSpent)
  cards.push({
    icon: '⏳',
    title: 'Left to spend',
    subtitle: `${meta.daysLeft} days left in the month`,
    valueLabel,
    amount: Math.abs(remaining),
    tone: remaining < 0 ? 'warn' : 'mint',
  })

  if (highlights.topItem && highlights.topItem.amount > 0) {
    cards.push({
      icon: '🧾',
      title: highlights.topItem.item || highlights.topItem.category,
      subtitle: `Biggest single spend · ${highlights.topItem.category}`,
      valueLabel,
      amount: highlights.topItem.amount,
      tone: 'coral',
    })
  }

  if (highlights.riser && !used.has(highlights.riser.category)) {
    cards.push({
      icon: '📈',
      title: highlights.riser.category,
      subtitle: `Up from a ${highlights.riser.priorAverage} average`,
      valueLabel,
      amount: highlights.riser.thisMonth,
      tone: 'coral',
    })
    used.add(highlights.riser.category)
  }

  if (highlights.subscriptionMonthlyBurn > 0) {
    cards.push({
      icon: '🔁',
      title: 'Subscriptions',
      subtitle: 'What your active subs cost each month',
      valueLabel,
      amount: highlights.subscriptionMonthlyBurn,
      tone: 'violet',
    })
  }

  const lightest = [...spending]
    .filter((e) => e.assigned > 0 && !e.isOverspent && !used.has(e.category))
    .sort((a, b) => a.available - b.available)[0]
  if (lightest) {
    cards.push({
      icon: '🪫',
      title: lightest.category,
      subtitle: 'Closest to empty without going over',
      valueLabel,
      amount: Math.round(lightest.available),
      tone: 'coral',
    })
  }

  if (highlights.investmentTotal > 0) {
    cards.push({
      icon: '💎',
      title: 'Investments',
      subtitle: 'Total value across your holdings',
      valueLabel,
      amount: highlights.investmentTotal,
      tone: 'mint',
    })
  }

  return { cards, questions: buildQuestions(ctx) }
}

function buildQuestions(ctx: SummarizeExpensesResult): string[] {
  const spending = ctx.envelopes.filter((e) => !e.isCreditCardPayment)
  const heaviest = [...spending].sort((a, b) => b.spent - a.spent)[0]
  const questions = [
    'Where did most of my money go this month?',
    'What can I cut back on?',
    'Am I on track for the rest of the month?',
    'How does this month compare to last month?',
  ]
  if (heaviest && heaviest.spent > 0) questions.push(`Why is ${heaviest.category} so high?`)
  if (ctx.highlights.subscriptionMonthlyBurn > 0) questions.push('Which subscriptions should I drop?')
  if (spending.some((e) => e.isOverspent)) questions.push('Which categories did I overspend?')
  questions.push('What was my biggest spend?', 'Which category is closest to empty?')
  return [...new Set(questions)]
}

/**
 * Highest scores win; ties keep candidate order, which is the priority order.
 * An empty `scores` array means Jev didn't answer, so the priority order is
 * the whole answer.
 */
export function selectTop<T>(items: T[], scores: number[], n: number): T[] {
  return items
    .map((item, index) => ({ item, index, score: scores[index] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, n)
    .map((entry) => entry.item)
}

export const BRIEF_CARD_COUNT = 3
export const BRIEF_QUESTION_COUNT = 4

const USEFULNESS = [
  'Not worth showing: the figure is trivial, or it repeats something else the brief already says.',
  'Mildly interesting, but nothing the user would act on today.',
  'Useful: it tells the user something about this month they would want to know.',
  'The most important thing about this month right now; it should be the first thing the user sees.',
]

const QUESTION_USEFULNESS = [
  'The facts cannot answer this, or the answer is obvious from the cards already shown.',
  'Answerable, but unlikely to interest this user this month.',
  'A natural next question for this user, answerable from the facts.',
  'Exactly what this user would want to ask next, given how this month is going.',
]

/**
 * Jev scores every candidate in one call and the top few win. On any Jev
 * failure the candidate order (already priority-ordered) is the answer, so a
 * gateway outage costs relevance, never the brief itself.
 */
export async function rankBrief(
  candidates: BriefCandidates,
  facts: string,
  caller: AiCaller,
): Promise<BriefCandidates> {
  const questions: Record<string, Experimental_EvaluationQuestion> = {}
  candidates.cards.forEach((card, i) => {
    questions[`card_${i}`] = {
      type: 'score',
      instructions: `A money brief shows the user three cards about this month. How useful is this card: "${card.title} · ${card.subtitle} · ${card.valueLabel} ${card.amount}"?`,
      criteria: USEFULNESS,
    }
  })
  candidates.questions.forEach((question, i) => {
    questions[`question_${i}`] = {
      type: 'score',
      instructions: `The brief offers four follow-up questions the user can tap. How good a suggestion is "${question}"?`,
      criteria: QUESTION_USEFULNESS,
    }
  })

  let scores: Record<string, number> = {}
  try {
    const answers = await runJev({ summary: facts }, questions, caller)
    scores = Object.fromEntries(
      Object.entries(answers).map(([key, answer]) => [key, answer.type === 'score' ? answer.score : 0]),
    )
  } catch (err) {
    console.warn('[brief] Jev ranking unavailable, using candidate order:', (err as Error).message)
  }

  return {
    cards: selectTop(candidates.cards, candidates.cards.map((_, i) => scores[`card_${i}`] ?? 0), BRIEF_CARD_COUNT),
    questions: selectTop(
      candidates.questions,
      candidates.questions.map((_, i) => scores[`question_${i}`] ?? 0),
      BRIEF_QUESTION_COUNT,
    ),
  }
}
