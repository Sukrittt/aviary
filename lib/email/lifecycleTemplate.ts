import type { AccessMode } from '@/lib/billing/access'
import { transactionalTemplate, type TransactionalEmail } from './transactionalTemplate'
import type { LeadStep, UserStep } from './lifecycleSteps'

/**
 * Copy for the trial, lead and evergreen ("let it run") emails. These read as
 * a note from Sukrit, not a product announcement: no badge, no headline, one
 * link. Welcome and billing emails are signed by him too.
 */

const SITE = 'https://useaviary.com'
const go = (path: string, step: string) => `${SITE}${path}${path.includes('?') ? '&' : '?'}utm_source=email&utm_medium=lifecycle&utm_campaign=${step}`
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

type Copy = Pick<TransactionalEmail, 'subject' | 'paragraphs' | 'cta' | 'url' | 'secondary' | 'details'>
type Audience = AccessMode | 'lead'

/** Each evergreen email: one idea, one link to the full guide. The main button depends on who's reading. */
const TIPS: Record<string, { subject: string; paragraphs: string[]; guide: string }> = {
  'tip-day-four': {
    subject: 'Most budgets die on day 4',
    paragraphs: [
      'Not at the end of the month. On day 4.',
      'Day 1 feels great. By day 4 you open your UPI app, see eleven payments you didn’t log, and decide to start again next month.',
      'It’s rarely willpower. It’s usually a plan that’s too tight. If eating out gets ₹1,000, it’s gone by Saturday, and once one category breaks the whole plan feels fake.',
      'Try this: budget for what you actually spent last month, then trim a little from the biggest category. Small cuts stick. Heroic ones don’t.',
    ],
    guide: '/blog/why-budgets-fail',
  },
  'tip-pay-then-log': {
    subject: 'Pay, then log',
    paragraphs: [
      'UPI made paying take two seconds. It also made spending invisible. No wallet getting thinner, just 90 payments a month you half remember.',
      'The fix is a tiny habit: log the spend right after you pay, while your phone’s still in your hand.',
      'Ten seconds at the counter beats twenty minutes on Sunday trying to remember what that ₹340 was. Pair it like locking the door when you leave.',
    ],
    guide: '/blog/track-upi-spending-without-bank-linking',
  },
  'tip-money-home': {
    subject: 'Pay home first',
    paragraphs: [
      'If you send money home every month, here’s a small change that helps: pay it first.',
      'On salary day it goes out with the rent, before anything goes to food or fun. When it comes from whatever’s left, it shrinks in expensive months and arrives late.',
      'Then add a second, smaller category for family extras. The hospital bill, the trip home, the festival. Over a year, those aren’t really surprises.',
    ],
    guide: '/blog/budget-money-for-parents',
  },
  'tip-swipe-is-spent': {
    subject: 'A swipe is spent',
    paragraphs: [
      'Credit cards are sneaky in one specific way. You swipe ₹2,400 for shoes and your bank balance doesn’t move.',
      'Do that ten times and the statement says ₹24,000 when you were sure it’d be ₹10,000.',
      'One rule fixes it: the moment you swipe, that money’s spent from your budget. Not when the bill comes. When you swipe. Log it against the category straight away, same as UPI.',
    ],
    guide: '/blog/budget-with-credit-card',
  },
}

const FIRST_TIP = 'Quick note from me: every few days I’ll send you one short, useful money idea. Not your thing? There’s an unsubscribe link at the bottom.'

function audienceCta(audience: Audience, step: string): Pick<Copy, 'cta' | 'url'> {
  if (audience === 'lead') return { cta: 'Try Aviary free', url: go('/sign-in', step) }
  if (audience === 'setup_incomplete') return { cta: 'Finish setup', url: go('/expense', step) }
  if (audience === 'expired') return { cta: 'Pick a plan', url: go('/account', step) }
  return { cta: 'Open Aviary', url: go('/expense', step) }
}

function tip(step: string, audience: Audience, firstTip: boolean): Copy | null {
  const t = TIPS[step]
  if (!t) return null
  return {
    subject: t.subject,
    paragraphs: firstTip ? [FIRST_TIP, ...t.paragraphs] : t.paragraphs,
    ...audienceCta(audience, step),
    secondary: { label: 'Read the full guide', url: go(t.guide, step) },
  }
}

/** "Sat, 24 Oct" in the reader's zone, falling back to IST like the rest of the app. */
export function shortDate(at: Date, timezone?: string): string {
  const format = (timeZone: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(at)
  try { return format(timezone || 'Asia/Kolkata') } catch { return format('Asia/Kolkata') }
}

export interface UserEmailContext {
  name: string | null
  mode: AccessMode
  spends: number
  /** Logged something in the last 7 days. */
  recentSpend: boolean
  trialEndsAt: Date | null
  timezone?: string
  /** Formatted Razorpay prices, for accounts in rupees. Null leaves the price out. */
  prices: { monthly: string; yearly: string; saving: string | null } | null
  firstTip: boolean
  unsubscribeUrl: string
}

function userCopy(step: UserStep, c: UserEmailContext): Copy | null {
  switch (step) {
    case 'setup-1': return {
      subject: 'Your 30 days haven’t started yet',
      paragraphs: [
        'You signed up for Aviary but stopped before setting up your budget.',
        'Good news: your free month only starts once you finish, so you haven’t lost a day.',
        'Setup is a few questions. Your salary, your rent, and a couple of things you pay for every month.',
      ],
      cta: 'Finish setup', url: go('/expense', step),
    }
    case 'setup-2': return {
      subject: 'Start with just rent and groceries',
      paragraphs: [
        'A budget feels like a big job. It isn’t, if you start small.',
        'Two categories is enough to begin: rent and groceries. Add the rest when you notice you need them.',
        'Switching from another app? Setup can bring your history over from Money Manager, Goodbudget, Spendee, Wallet, Monefy or YNAB.',
        'That’s my last nudge about setup. If now’s not the time, no worries.',
      ],
      cta: 'Finish setup', url: go('/expense', step),
    }
    case 'trial-d2': return {
      subject: 'Log one spend today',
      paragraphs: [
        'Your budget’s set up. Nice.',
        'It can’t tell you much yet, though. A budget only wakes up once it sees a real spend.',
        'So log one today. The chai, the auto, whatever’s next. Tap +, type the amount, pick a category. That’s it.',
      ],
      cta: 'Log a spend', url: go('/expense', step),
    }
    case 'trial-d7': return c.spends === 0 ? {
      subject: 'Your budget hasn’t met you yet',
      paragraphs: [
        'It’s been a week and nothing’s logged yet. Totally normal. Most budgets stall right here.',
        'Lower the bar: log just yesterday’s biggest spend. One entry is enough to see what’s left in that category.',
        'Tomorrow, log one more. Two days in a row and it starts to feel like a habit.',
      ],
      cta: 'Log a spend', url: go('/expense', step),
    } : {
      subject: 'One week in',
      paragraphs: [
        `You’ve logged ${plural(c.spends, 'spend', 'spends')} so far. That’s the hard part done.`,
        'One thing to try next: add your rent or SIP as a recurring expense. It logs itself every month, so the big stuff never slips.',
        'Then look in on the 1st and see which categories ran over. That’s where the useful part is.',
      ],
      cta: 'Add a recurring expense', url: go('/account/recurring', step),
    }
    case 'trial-end': {
      const date = shortDate(c.trialEndsAt!, c.timezone)
      const price = c.prices ? `${c.prices.monthly} a month, or ${c.prices.yearly} a year${c.prices.saving ? `, which saves you ${c.prices.saving}` : ''}` : null
      return c.recentSpend ? {
        subject: `Your trial ends on ${date}`,
        paragraphs: [
          `Your free month of Aviary ends on ${date}.`,
          price ? `You’ve been logging, so here’s how to keep going: ${price}.` : 'You’ve been logging, so here’s how to keep going: pick a plan in your account.',
          'Your categories, spends and history stay exactly as they are.',
        ],
        cta: 'Pick a plan', url: go('/account', step),
      } : {
        subject: `Your trial ends on ${date}`,
        paragraphs: [
          `Your free month of Aviary ends on ${date}.`,
          price ? `No hard sell. If you’d like to keep going, it’s ${price}.` : 'No hard sell. If you’d like to keep going, you can pick a plan in your account.',
          'If not, your data stays safe and you can export it any time.',
          'And if Aviary didn’t click for you, just reply and tell me what was missing. I read every one.',
        ],
        cta: 'Pick a plan', url: go('/account', step),
        secondary: { label: 'Export your data', url: go('/account/data', step) },
      }
    }
    default: return tip(step, c.mode, c.firstTip)
  }
}

const NOTE = { note: true, signature: 'Sukrit' } as const

export function userEmail(step: UserStep, c: UserEmailContext) {
  const copy = userCopy(step, c)
  if (!copy) throw new Error(`No copy for lifecycle step ${step}`)
  const notice = step === 'trial-end'
  return transactionalTemplate({
    ...copy, ...NOTE, name: c.name,
    reason: notice ? 'You’re getting this because your Aviary trial is ending.' : 'You’re getting this because you have an Aviary account.',
    // The trial-end notice is about the account, so it goes out either way and carries no unsubscribe.
    ...(!notice && { unsubscribeUrl: c.unsubscribeUrl }),
  })
}

export interface LeadEmailContext {
  /** The planner's rows, frozen when the lead asked for them. */
  plan?: { salary: number; rows: [string, number][]; intl?: boolean }
  firstTip: boolean
  confirmUrl: string
  unsubscribeUrl: string
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
/** The paycheck planner has no currency, so neither do its numbers. */
const plain = (n: number) => Math.round(n).toLocaleString('en-US')

function leadCopy(step: LeadStep, c: LeadEmailContext): Copy | null {
  const intl = Boolean(c.plan?.intl)
  const money = intl ? plain : rupees
  switch (step) {
    case 'plan': return {
      subject: intl ? `Your ${plain(c.plan!.salary)} paycheck split` : `Your ${rupees(c.plan!.salary)} salary split`,
      paragraphs: [
        intl ? 'Here’s the plan you made on Aviary. Every bit of your pay has a job.' : 'Here’s the plan you made on Aviary. Every rupee has a job.',
        'A plan you make once and never check is a wish. The useful part is seeing what’s left as you spend.',
        intl ? 'Want two short notes on making it stick? Tap below and they’ll arrive over the next week. Nothing else.' : 'Want a few short tips on making it stick? Tap below and I’ll send one every few days. Nothing else.',
        'P.S. If one of these numbers looks way off for your life, reply and tell me which. I read every one.',
      ],
      details: c.plan!.rows.map(([label, amount]) => [label, money(amount)]),
      cta: 'Send me the tips', url: c.confirmUrl,
      secondary: { label: 'Or try it with a real month, free', url: go('/sign-in', step) },
    }
    case 'lead-d3': return {
      subject: 'The category most first budgets skip',
      paragraphs: [
        'Your plan covers the monthly stuff. The month that wrecks a budget is usually the one with a yearly bill in it.',
        intl ? 'Car insurance, the holidays, a new phone. They’re not surprises. They’re on the calendar, you just don’t pay them monthly.' : 'Health insurance, Diwali, a new phone. They’re not surprises. They’re on the calendar, you just don’t pay them monthly.',
        'So make them monthly. Add up your yearly costs, divide by 12, and set that aside as its own category.',
      ],
      // The calculator is in rupees, so paycheck leads set it up in Aviary instead.
      ...(intl ? { cta: 'Set one up free', url: go('/sign-in', step) } : { cta: 'Work out yours', url: go('/tools/sinking-fund-calculator', step) }),
    }
    case 'lead-d7': return {
      subject: 'Try it with a real month',
      paragraphs: [
        'A plan on paper is a good start. A plan that shows what’s left after every spend is what actually changes things.',
        'That’s what Aviary does. Log a spend in a tap and see what’s left in each category. No bank link, no SMS reading.',
        'It’s free for 30 days, no card needed. On Android and the web.',
      ],
      cta: 'Start free', url: go('/sign-in', step),
    }
    default: return tip(step, 'lead', c.firstTip)
  }
}

export function leadEmail(step: LeadStep, c: LeadEmailContext) {
  const copy = leadCopy(step, c)
  if (!copy) throw new Error(`No copy for lead step ${step}`)
  return transactionalTemplate({
    ...copy, ...NOTE, name: null,
    reason: `You’re getting this because you asked for your ${c.plan?.intl ? 'paycheck' : 'salary'} plan at useaviary.com.`,
    unsubscribeUrl: c.unsubscribeUrl,
  })
}
