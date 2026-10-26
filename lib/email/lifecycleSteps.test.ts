import { describe, expect, it } from 'vitest'
import { EVERGREEN, nextLeadStep, nextUserStep, type LeadState, type UserState } from './lifecycleSteps'

const DAY = 86_400_000
const now = new Date('2026-11-01T06:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * DAY)
const ahead = (days: number) => new Date(now.getTime() + days * DAY)

function user(over: Partial<UserState> = {}): UserState {
  return { now, createdAt: ago(40), mode: 'paid', enforced: true, trialStartedAt: null, trialEndsAt: null, spends: 0, optedOut: false, sent: [], lastAt: null, ...over }
}
function trial(day: number, over: Partial<UserState> = {}): UserState {
  return user({ createdAt: ago(day), mode: 'trial', trialStartedAt: ago(day), trialEndsAt: ahead(30 - day), ...over })
}
function lead(over: Partial<LeadState> = {}): LeadState {
  return { now, createdAt: ago(1), confirmed: true, optedOut: false, sent: ['plan'], lastAt: ago(1), ...over }
}

describe('setup nudges for accounts that never finished setup', () => {
  const setup = (days: number, over: Partial<UserState> = {}) => user({ createdAt: ago(days), mode: 'setup_incomplete', ...over })
  it('waits a day, then nudges, then sends the last nudge on day 4', () => {
    expect(nextUserStep(setup(0.5))).toBeNull()
    expect(nextUserStep(setup(1))).toBe('setup-1')
    expect(nextUserStep(setup(4, { sent: ['setup-1'], lastAt: ago(3) }))).toBe('setup-2')
    expect(nextUserStep(setup(6, { sent: ['setup-1', 'setup-2'], lastAt: ago(2) }))).toBeNull()
  })
  it('sends only the furthest nudge due, and nothing once the window has passed', () => {
    expect(nextUserStep(setup(5))).toBe('setup-2')
    expect(nextUserStep(setup(9))).toBe('setup-2')
    expect(nextUserStep(setup(10))).toBe(EVERGREEN[0])
  })
})

describe('trial sequence', () => {
  it('asks for a first spend on day 2 only when none is logged', () => {
    expect(nextUserStep(trial(1))).toBeNull()
    expect(nextUserStep(trial(2))).toBe('trial-d2')
    expect(nextUserStep(trial(2, { spends: 3 }))).toBeNull()
    expect(nextUserStep(trial(6, { sent: ['trial-d2'], lastAt: ago(4) }))).toBeNull()
  })
  it('sends the week-one email in days 7 to 13 whatever the spends', () => {
    expect(nextUserStep(trial(7, { spends: 12 }))).toBe('trial-d7')
    expect(nextUserStep(trial(13))).toBe('trial-d7')
    expect(nextUserStep(trial(14))).toBe(EVERGREEN[0])
  })
  it('keeps two days between lifecycle emails', () => {
    expect(nextUserStep(trial(7, { sent: ['trial-d2'], lastAt: ago(1) }))).toBeNull()
    expect(nextUserStep(trial(8, { sent: ['trial-d2'], lastAt: ago(2) }))).toBe('trial-d7')
  })
  it('warns five days before the trial ends, ignoring the gap and the opt-out', () => {
    const ending = trial(26, { trialEndsAt: ahead(4.5), sent: ['trial-d7', EVERGREEN[0]], lastAt: ago(0.5), optedOut: true })
    expect(nextUserStep(ending)).toBe('trial-end')
    expect(nextUserStep({ ...ending, sent: [...ending.sent, 'trial-end'] })).toBeNull()
    expect(nextUserStep(trial(24, { trialEndsAt: ahead(6) }))).not.toBe('trial-end')
  })
  it('never warns about a trial end that billing would not enforce, or one already past', () => {
    expect(nextUserStep(trial(26, { trialEndsAt: ahead(4), enforced: false, sent: ['trial-d7'], lastAt: ago(1) }))).toBeNull()
    expect(nextUserStep(user({ mode: 'expired', trialEndsAt: ago(1) }))).not.toBe('trial-end')
  })
})

describe('evergreen', () => {
  it('walks the library in order, six days apart', () => {
    expect(nextUserStep(user())).toBe(EVERGREEN[0])
    expect(nextUserStep(user({ sent: [EVERGREEN[0]], lastAt: ago(5) }))).toBeNull()
    expect(nextUserStep(user({ sent: [EVERGREEN[0]], lastAt: ago(6) }))).toBe(EVERGREEN[1])
    expect(nextUserStep(user({ sent: [...EVERGREEN], lastAt: ago(30) }))).toBeNull()
  })
  it('picks up an email added to the library later, wherever it sits', () => {
    expect(nextUserStep(user({ sent: EVERGREEN.slice(1), lastAt: ago(10) }))).toBe(EVERGREEN[0])
  })
  it('lets a new account settle in for a week first, even a paid one', () => {
    expect(nextUserStep(user({ createdAt: ago(3) }))).toBeNull()
    expect(nextUserStep(user({ createdAt: ago(7) }))).toBe(EVERGREEN[0])
  })
  it('starts six days after the week-one email for a trial', () => {
    expect(nextUserStep(trial(10, { sent: ['trial-d7'], lastAt: ago(3) }))).toBeNull()
    expect(nextUserStep(trial(13, { sent: ['trial-d7'], lastAt: ago(6) }))).toBe(EVERGREEN[0])
  })
  it('keeps going after the trial lapses and stops for anyone who opted out', () => {
    expect(nextUserStep(user({ mode: 'expired' }))).toBe(EVERGREEN[0])
    expect(nextUserStep(user({ optedOut: true }))).toBeNull()
  })
})

describe('lead sequence', () => {
  it('sends nothing after the plan until the lead confirms', () => {
    expect(nextLeadStep(lead({ createdAt: ago(3), confirmed: false }))).toBeNull()
    expect(nextLeadStep(lead({ createdAt: ago(3), lastAt: ago(3) }))).toBe('lead-d3')
  })
  it('sends day 3, day 7, then the evergreen library', () => {
    expect(nextLeadStep(lead({ createdAt: ago(2), lastAt: ago(2) }))).toBeNull()
    expect(nextLeadStep(lead({ createdAt: ago(7), sent: ['plan', 'lead-d3'], lastAt: ago(4) }))).toBe('lead-d7')
    expect(nextLeadStep(lead({ createdAt: ago(10), sent: ['plan', 'lead-d3', 'lead-d7'], lastAt: ago(3) }))).toBeNull()
    expect(nextLeadStep(lead({ createdAt: ago(13), sent: ['plan', 'lead-d3', 'lead-d7'], lastAt: ago(6) }))).toBe(EVERGREEN[0])
  })
  it('stops a paycheck-planner lead after day 7, since the tips are written for India', () => {
    expect(nextLeadStep(lead({ createdAt: ago(7), sent: ['plan', 'lead-d3'], lastAt: ago(4), intl: true }))).toBe('lead-d7')
    expect(nextLeadStep(lead({ createdAt: ago(20), sent: ['plan', 'lead-d3', 'lead-d7'], lastAt: ago(10), intl: true }))).toBeNull()
  })
  it('skips a step whose window passed, and stops on opt-out', () => {
    expect(nextLeadStep(lead({ createdAt: ago(8), lastAt: ago(8) }))).toBe('lead-d7')
    expect(nextLeadStep(lead({ createdAt: ago(20), lastAt: ago(20) }))).toBe(EVERGREEN[0])
    expect(nextLeadStep(lead({ createdAt: ago(3), lastAt: ago(3), optedOut: true }))).toBeNull()
  })
})
