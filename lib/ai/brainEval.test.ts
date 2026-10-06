// @vitest-environment node
/**
 * Opt-in live eval of the money-brain chat: real Jev routing, real FACTS
 * builder, real prompt, real Gemini call, over a synthetic account. Skipped
 * unless BRAIN_EVAL=1 (it costs API calls and takes minutes).
 *
 *   BRAIN_EVAL=1 GEMINI_API_KEY=... AI_GATEWAY_API_KEY=... npx vitest run lib/ai/brainEval.test.ts
 *
 * Writes every reply to BRAIN_EVAL_OUT (default /tmp/brain-eval.md) for a human to judge.
 * The capture eval (logging spends from chat) writes to BRAIN_EVAL_CAPTURE_OUT
 * (default /tmp/brain-eval-capture.md), with the routing and amounts checked
 * against what each message should produce, so CAPTURE_AT in chatRouter.ts can
 * be tuned from it.
 */
import { describe, it, vi } from 'vitest'
import fs from 'node:fs'

vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('@/lib/systemSettings', () => ({ getSystemSettings: async () => ({ aiDisabled: false }), AI_DISABLED_MESSAGE: 'off' }))
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: async () => {} }))
vi.mock('./usage', () => ({ logAiUsage: async () => {} }))
vi.mock('../systemSettings', () => ({ getSystemSettings: async () => ({ aiDisabled: false }), AI_DISABLED_MESSAGE: 'off' }))

const { summarizeExpenses, factsFor } = await import('./expenseContext')
const { buildSystemPrompt, currencyInstruction, SCOPE_REFUSAL } = await import('./moneyBrainPrompt')
const { routeChat } = await import('./chatRouter')
const { streamText } = await import('./gemini')
const { extractCapture } = await import('./capture')

// --- Synthetic account: salaried, rent-heavy, eating out and shopping creeping up. ---
const TODAY = '2026-09-25'
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const categories = [
  ['Rent', 'Fixed'], ['Utilities', 'Fixed'], ['Groceries', 'Living'], ['Transport', 'Living'], ['Health', 'Living'],
  ['Eating Out', 'Fun'], ['Shopping', 'Fun'], ['Entertainment', 'Fun'], ['Personal Care', 'Fun'],
  ['Emergency Fund', 'Savings'], ['Travel Fund', 'Savings'],
].map(([name, group]) => ({ name, group }))
const groups = ['Fixed', 'Living', 'Fun', 'Savings'].map((name) => ({ name }))
const assigned: Record<string, number> = {
  Rent: 30000, Utilities: 4000, Groceries: 12000, Transport: 5000, Health: 3000, 'Eating Out': 6000,
  Shopping: 8000, Entertainment: 3000, 'Personal Care': 2000, 'Emergency Fund': 15000, 'Travel Fund': 10000,
}
const budgets = [
  ...MONTHS.map((month) => ({ month, category: '__income__', assigned: 120000, rolled_over: 0 })),
  ...MONTHS.flatMap((month) => Object.entries(assigned).map(([category, a]) => ({ month, category, assigned: a, rolled_over: 0 }))),
]

const expenses: Array<{ date: string; item: string; amount_inr: number; category: string; payment_method: string }> = []
const add = (date: string, item: string, amount: number, category: string, pm = 'upi') =>
  expenses.push({ date, item, amount_inr: Math.round(amount), category, payment_method: pm })
MONTHS.forEach((m, i) => {
  const lastDay = m === '2026-09' ? 25 : 28
  const d = (n: number) => `${m}-${String(Math.min(n, lastDay)).padStart(2, '0')}`
  add(d(1), 'Rent', 30000, 'Rent')
  add(d(18), 'Electricity', 1900 + rand() * 600, 'Utilities')
  add(d(6), 'Airtel broadband', 999, 'Utilities', 'card')
  add(d(3), 'BigBasket monthly', 4000 + rand() * 800, 'Groceries')
  for (let k = 0; k < 6; k++) add(d(4 + k * 4), 'Blinkit', 400 + rand() * 500, 'Groceries')
  for (let k = 0; k < 8; k++) add(d(2 + k * 3), 'Uber', 180 + rand() * 250, 'Transport')
  // Eating out climbs month over month (delivery habit growing).
  const deliveries = 4 + i * 2
  for (let k = 0; k < deliveries; k++) add(d(1 + Math.floor((k * 24) / deliveries)), k % 2 ? 'Zomato' : 'Swiggy', 350 + rand() * 500, 'Eating Out')
  for (let k = 0; k < 3 + i; k++) add(d(5 + k * 3), 'Starbucks', 380 + rand() * 200, 'Eating Out', 'card')
  if (m === '2026-09') add(d(8), 'Birthday dinner Toit', 3400, 'Eating Out', 'card')
  // Shopping: lumpy.
  add(d(12), 'Amazon order', 1200 + rand() * 2500, 'Shopping', 'card')
  if (i >= 3) add(d(20), 'Myntra order', 2000 + rand() * 1500, 'Shopping', 'card')
  if (m === '2026-09') add(d(14), 'Nike running shoes', 6499, 'Shopping', 'card')
  if (m === '2026-08') add(d(15), 'Zara', 4800, 'Shopping', 'card')
  add(d(9), 'PVR movie', 600 + rand() * 500, 'Entertainment', 'card')
  add(d(16), 'Haircut', 500, 'Personal Care')
  if (i % 2) add(d(22), 'Apollo pharmacy', 700 + rand() * 900, 'Health')
})

const subscriptions = [
  ['Netflix', 649, 'monthly'], ['Spotify', 119, 'monthly'], ['YouTube Premium', 189, 'monthly'], ['Cult.fit', 2500, 'monthly'],
  ['iCloud', 75, 'monthly'], ['ChatGPT Plus', 1999, 'monthly'], ['Amazon Prime', 1499, 'yearly'], ['Hotstar', 1499, 'yearly'],
  ['Audible', 199, 'monthly', 'cancelled'],
].map(([service, amount_inr, billing_cycle, status]) => ({ service: String(service), amount_inr: Number(amount_inr), billing_cycle: String(billing_cycle), status: status ? String(status) : 'active' }))
const holdings = [
  { name: 'Nifty 50 Index Fund', type: 'mutual_fund', value: 240000, updated_at: '2026-09-01' },
  { name: 'HDFC FD', type: 'fixed_deposit', value: 100000, updated_at: '2026-08-15' },
]

const ctx = summarizeExpenses({ expenses, budgets, categories, groups, subscriptions, holdings, currentMonth: '2026-09', today: TODAY })

// --- Scenarios: each is a conversation; later turns are the natural follow-ups. ---
const SCENARIOS: Array<[string, string[]]> = [
  ['afford-recurring-sub', ["I'm thinking of adding a 7K a month subscription. Can I afford it?", 'Which of my current subscriptions should I cancel to make room?', 'Ok, if I cancel those, what exactly should I change in my budget?']],
  ['afford-phone', ['Can I afford a new phone for 60k?', 'What if I pay it as a 6 month EMI instead?', 'Which envelopes would I pull the EMI from?']],
  ['buy-ps5', ['Should I buy a PS5 for 55k this month?']],
  ['trip-goa', ['I want to go to Goa next month, around 25k. Can I do it?', 'Where do I find the money?']],
  ['save-10k', ['How do I save 10k more next month?', 'Give me a concrete plan, envelope by envelope.']],
  ['cut-back', ['Where can I cut back?']],
  ['rent-hike', ['My rent is going up by 5k from next month. What should I change?']],
  ['bonus', ['I got a 20k bonus. What should I do with it?']],
  ['fix-overspend', ['I overspent on eating out. How do I fix it this month?']],
  ['weekend-eating', ['Can I afford to eat out this weekend?']],
  ['concert', ['Is it okay to spend 3k on a concert ticket?']],
  ['emergency-fund-goal', ['I want an emergency fund of 1 lakh. How long will that take?']],
  ['cancel-cult', ['Should I cancel Cult.fit? I only went twice this month.']],
  ['credit-card', ['My credit card spend is high. What should I do?']],
  ['rent-40k', ['Can I afford to move to a place with 40k rent?']],
  ['why-overspending', ['Why am I overspending this month?', "What's driving the eating out increase?", "What's a realistic eating out budget for me?"]],
  ['how-am-i-doing', ['How am I doing this month?']],
  ['on-track', ['Am I on track to end the month within budget?']],
  ['vs-last-month', ['What changed compared to last month?']],
  ['money-leak', ["What's my biggest money leak?"]],
  ['food-delivery', ['How much am I spending on food delivery?']],
  ['unneeded-subs', ['Which subscriptions am I paying for that I might not need?']],
  ['subs-yearly', ['How much do my subscriptions cost me per year?']],
  ['avg-shopping', ["What's my average monthly spending on shopping?"]],
  ['daily-allowance', ['How much can I safely spend per day for the rest of the month?']],
  ['groceries-normal', ['Is my grocery spending normal?']],
  ['starbucks', ['How much did I spend at Starbucks in the last 3 months?']],
  ['money-left', ['How much money is left?']],
  ['savings-rate', ["What's my savings rate?"]],
  ['invest-advice', ['Should I put my bonus in index funds or an FD?']],
  ['portfolio', ["How's my portfolio?"]],
  ['stressed', ["I'm stressed about money. Help me."]],
  ['plan-october', ['Plan my budget for October.']],
  ['followup-context', ['Can I afford a Kindle?', "It's 12k.", 'And if I also upgrade Netflix to premium, 300 more a month?']],
]

const HISTORY_LIMIT = 8
const OUT = process.env.BRAIN_EVAL_OUT ?? '/tmp/brain-eval.md'
const ONLY = process.env.BRAIN_EVAL_ONLY?.split(',')

describe.skipIf(!process.env.BRAIN_EVAL)('Ask Aviary live eval', () => {
  it('runs every scenario', { timeout: 1_800_000 }, async () => {
    const caller = { userId: 'eval', feature: 'chat' as const }
    const out: string[] = [`# Ask Aviary eval ${new Date().toISOString()}\n`]
    const scenarios = SCENARIOS.filter(([id]) => !ONLY || ONLY.includes(id))
    const results = new Map<string, string>()
    const queue = [...scenarios]
    await Promise.all(Array.from({ length: Number(process.env.BRAIN_EVAL_CONCURRENCY ?? 1) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const [id, turns] = s
        const history: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = []
        const lines = [`## ${id}\n`]
        for (const turn of turns) {
          history.push({ role: 'user', parts: [{ text: turn }] })
          const startedAt = Date.now()
          const earlier = history.filter((h) => h.role === 'user').map((h) => h.parts[0].text).slice(-3, -1)
          const route = await routeChat(turn, caller, earlier)
          let reply = SCOPE_REFUSAL
          if (route.onTopic) {
            const facts = `${currencyInstruction('INR')}\n${factsFor(ctx.sections, route.sections)}`
            // The local key is free tier (15 requests a minute): wait out 429s instead of failing the run.
            for (let attempt = 0; ; attempt++) {
              try {
                const stream = await streamText(buildSystemPrompt(facts, 'INR', route.decision), history.slice(-HISTORY_LIMIT), caller, route.decision)
                reply = ''
                let last
                for await (const chunk of stream) {
                  reply += chunk.text ?? ''
                  last = chunk
                }
                if (!reply) reply = `(EMPTY: finishReason=${last?.candidates?.[0]?.finishReason} usage=${JSON.stringify(last?.usageMetadata)})`
                break
              } catch (err) {
                if (attempt >= 5 || !/429|503|fetch failed|timeout/i.test(String(err) + String((err as Error).cause))) throw err
                await new Promise((r) => setTimeout(r, 30_000))
              }
            }
          }
          history.push({ role: 'model', parts: [{ text: reply }] })
          lines.push(`**User:** ${turn}\n\n_route: decision=${route.decision} sections=${route.sections.join(',')} ${Date.now() - startedAt}ms_\n\n${reply}\n`)
        }
        results.set(id, lines.join('\n'))
        console.log('done', id)
      }
    }))
    for (const [id] of scenarios) out.push(results.get(id)!)
    fs.writeFileSync(OUT, out.join('\n'))
  })
})

// --- Capture: logging spends by typing them. `capture` is what the router should decide
// (omitted when either is fine); amounts/splits/dates are what extraction should return. ---
const CAPTURE_SCENARIOS: Array<{ id: string; message: string; capture?: boolean; amounts?: number[]; splits?: number[]; dates?: string[] }> = [
  { id: 'two-items', message: 'auto 240, lunch 150', capture: true, amounts: [240, 150] },
  { id: 'k-suffix', message: 'sneakers 5k', capture: true, amounts: [5000] },
  { id: 'lakh', message: 'laptop 1.2L', capture: true, amounts: [120000] },
  { id: 'split', message: 'turf 1200 split 6', capture: true, amounts: [1200], splits: [6] },
  { id: 'split-between', message: 'birthday dinner 3400 between 4 of us', capture: true, amounts: [3400], splits: [4] },
  { id: 'hinglish', message: 'chai 20, dedh sau ka auto', capture: true, amounts: [20, 150] },
  { id: 'hinglish-words', message: 'dhai sau ki sabzi aur do hazaar ka jacket', capture: true, amounts: [250, 2000] },
  { id: 'skipped', message: 'skipped lunch, coffee 180', capture: true, amounts: [180] },
  { id: 'yesterday', message: 'yesterday dinner 800', capture: true, amounts: [800], dates: ['2026-09-24'] },
  { id: 'sentence', message: 'went to dmart and spent 1340 on groceries then took an uber home for 210', capture: true, amounts: [1340, 210] },
  { id: 'no-amount', message: 'coffee', amounts: [] },
  { id: 'salary', message: 'got my salary, 52000', capture: false },
  { id: 'q-food', message: 'how much did I spend on food?', capture: false },
  { id: 'q-afford', message: 'can I afford a 60k phone?', capture: false },
  { id: 'q-considering', message: 'should I buy sneakers for 5k?', capture: false },
  { id: 'q-judgement', message: 'bought sneakers for 5k, was that too much?', capture: false },
  { id: 'off-topic', message: 'write me a poem', capture: false },
]

describe.skipIf(!process.env.BRAIN_EVAL)('money brain capture eval', () => {
  it('routes and reads every capture scenario', { timeout: 600_000 }, async () => {
    const routeCaller = { userId: 'eval', feature: 'chat' as const }
    const captureCaller = { userId: 'eval', feature: 'capture' as const }
    const captureCtx = { today: TODAY, currencyCode: 'INR', categories: categories.map((c) => c.name), words: {} }
    const lines = [`# Capture eval ${new Date().toISOString()}\n`]
    let passed = 0
    for (const s of CAPTURE_SCENARIOS) {
      const route = await routeChat(s.message, routeCaller)
      const routeOk = s.capture === undefined || route.capture === s.capture
      let readOk = true
      let read = '(not read)'
      if (route.capture && s.amounts) {
        const proposal = await extractCapture(s.message, captureCtx, captureCaller)
        const amounts = proposal.items.map((i) => i.amount)
        readOk =
          JSON.stringify(amounts) === JSON.stringify(s.amounts) &&
          (!s.splits || JSON.stringify(proposal.items.map((i) => i.splitWays)) === JSON.stringify(s.splits)) &&
          (!s.dates || JSON.stringify(proposal.items.map((i) => i.date)) === JSON.stringify(s.dates))
        read = JSON.stringify({ items: proposal.items.map(({ item, amount, splitWays, date, category, categoryConfidence }) => ({ item, amount, splitWays, date, category, categoryConfidence })), skipped: proposal.skipped, unparsed: proposal.unparsed })
      }
      if (routeOk && readOk) passed++
      lines.push(`## ${s.id} ${routeOk && readOk ? 'PASS' : 'FAIL'}\n\n**Message:** ${s.message}\n\n_capture=${route.capture} (want ${s.capture ?? 'either'}) route=${routeOk ? 'ok' : 'WRONG'} read=${readOk ? 'ok' : 'WRONG'}_\n\n${read}\n`)
    }
    lines.splice(1, 0, `${passed}/${CAPTURE_SCENARIOS.length} passed\n`)
    fs.writeFileSync(process.env.BRAIN_EVAL_CAPTURE_OUT ?? '/tmp/brain-eval-capture.md', lines.join('\n'))
    console.log(`capture eval: ${passed}/${CAPTURE_SCENARIOS.length} passed`)
  })
})

if (process.env.BRAIN_EVAL_FACTS) fs.writeFileSync(process.env.BRAIN_EVAL_FACTS, ctx.facts)
