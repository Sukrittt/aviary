import { describe, expect, it } from 'vitest'
import { pickNudge } from './featureNudge'

const none = { subscriptions: false, insights: false, askAviary: false, billScan: false }
const days = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00Z` }))

describe('pickNudge', () => {
  it('offers nothing for a feature that is already on', () => {
    expect(pickNudge({ hidden: [], expenses: days(40), subscriptionSpotted: true, dismissed: none })).toBeNull()
  })

  it('offers the first hidden feature the data earns, in priority order', () => {
    const hidden = ['insights', 'askAviary', 'billScan'] as const
    expect(pickNudge({ hidden, expenses: days(10), subscriptionSpotted: false, dismissed: none })).toBe('askAviary')
    expect(pickNudge({ hidden, expenses: days(30), subscriptionSpotted: false, dismissed: none })).toBe('insights')
    expect(pickNudge({ hidden: ['billScan'], expenses: days(10), subscriptionSpotted: false, dismissed: none })).toBe('billScan')
  })

  it('counts logged days, not expenses, for Ask Aviary', () => {
    const sameDay = Array.from({ length: 9 }, () => ({ date: '2026-10-01T10:00:00Z' }))
    expect(pickNudge({ hidden: ['askAviary'], expenses: sameDay, subscriptionSpotted: false, dismissed: none })).toBeNull()
  })

  it('skips a dismissed offer for the next one', () => {
    expect(pickNudge({ hidden: ['insights', 'billScan'], expenses: days(30), subscriptionSpotted: false, dismissed: { ...none, insights: true } })).toBe('billScan')
  })

  it('holds the slot while a higher offer is still loading', () => {
    expect(pickNudge({ hidden: ['subscriptions', 'billScan'], expenses: days(10), subscriptionSpotted: null, dismissed: none })).toBeNull()
    expect(pickNudge({ hidden: ['insights', 'billScan'], expenses: days(30), subscriptionSpotted: false, dismissed: { ...none, insights: null } })).toBeNull()
  })

  it('offers Subscriptions once a scan spots one', () => {
    expect(pickNudge({ hidden: ['subscriptions'], expenses: [], subscriptionSpotted: true, dismissed: none })).toBe('subscriptions')
  })
})
