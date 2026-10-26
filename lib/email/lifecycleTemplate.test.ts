import { describe, expect, it } from 'vitest'
import { EVERGREEN, type UserStep } from './lifecycleSteps'
import { leadEmail, shortDate, userEmail, type UserEmailContext } from './lifecycleTemplate'

const ctx: UserEmailContext = {
  name: 'Asha Rao', mode: 'trial', spends: 0, recentSpend: false, trialEndsAt: new Date('2026-10-24T06:00:00Z'),
  prices: null, firstTip: false, unsubscribeUrl: 'https://useaviary.com/emails?t=x',
}
const userSteps: UserStep[] = ['setup-1', 'setup-2', 'trial-d2', 'trial-d7', 'trial-end', ...EVERGREEN]

describe('lifecycle copy', () => {
  it('renders every step without em dashes, raw dots-for-ellipsis or an empty subject', () => {
    const emails = [
      ...userSteps.flatMap(step => [userEmail(step, ctx), userEmail(step, { ...ctx, spends: 4, recentSpend: true, mode: 'expired' })]),
      ...(['plan', 'lead-d3', 'lead-d7', ...EVERGREEN] as const).map(step => leadEmail(step, { plan: { salary: 50000, rows: [['Rent', 15000]] }, firstTip: true, confirmUrl: 'c', unsubscribeUrl: 'u' })),
    ]
    for (const email of emails) {
      expect(email.subject.trim()).not.toBe('')
      expect(email.subject + email.text).not.toMatch(/—|\.\.\./)
      expect(email.text).toContain('Sukrit')
    }
  })

  it('sends a paycheck-planner lead its split with no rupees and nothing India-only', () => {
    const plan = { salary: 4000, rows: [['Rent', 1200], ['Groceries', 400]] as [string, number][], intl: true }
    const emails = (['plan', 'lead-d3', 'lead-d7'] as const).map(step => leadEmail(step, { plan, firstTip: false, confirmUrl: 'c', unsubscribeUrl: 'u' }))
    expect(emails[0].subject).toBe('Your 4,000 paycheck split')
    expect(emails[0].text).toContain('1,200')
    for (const { subject, text, html } of emails) expect(subject + text + html).not.toMatch(/₹|rupee|UPI|Diwali|swiggy/i)
  })

  it('counts the week’s spends and changes the main link with the reader’s plan', () => {
    expect(userEmail('trial-d7', { ...ctx, spends: 1 }).text).toContain('You’ve logged 1 spend so far')
    expect(userEmail(EVERGREEN[0], { ...ctx, mode: 'expired' }).text).toContain('Pick a plan: https://useaviary.com/account?')
    expect(userEmail(EVERGREEN[0], { ...ctx, mode: 'paid' }).text).toContain('Open Aviary: https://useaviary.com/expense?')
    expect(leadEmail(EVERGREEN[0], { firstTip: false, confirmUrl: 'c', unsubscribeUrl: 'u' }).text).toContain('Try Aviary free: https://useaviary.com/sign-in?')
  })

  it('reads dates in the reader’s zone and survives a bad one', () => {
    const late = new Date('2026-10-24T20:00:00Z')
    expect(shortDate(late, 'Asia/Kolkata')).toBe('Sun, 25 Oct')
    expect(shortDate(late, 'America/New_York')).toBe('Sat, 24 Oct')
    expect(shortDate(late, 'Not/AZone')).toBe('Sun, 25 Oct')
  })
})
