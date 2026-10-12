import { describe, expect, it } from 'vitest'
import { hiddenFeatures, OPT_IN_FEATURES, OPT_IN_SINCE } from './features'

describe('hiddenFeatures', () => {
  it('keeps everything on for an account from before opt-in shipped', () => {
    expect(hiddenFeatures({ createdAt: new Date('2026-03-01T00:00:00.000Z') })).toEqual([])
  })

  it('starts a new account with the extras hidden, Wrapped included', () => {
    expect(hiddenFeatures({ createdAt: OPT_IN_SINCE })).toEqual(OPT_IN_FEATURES)
    expect(hiddenFeatures({ createdAt: OPT_IN_SINCE })).toContain('wrapped')
  })

  it('always prefers a saved choice, even an empty one', () => {
    expect(hiddenFeatures({ createdAt: OPT_IN_SINCE, hiddenFeatures: [] })).toEqual([])
    expect(hiddenFeatures({ createdAt: new Date('2025-01-01'), hiddenFeatures: ['wrapped'] })).toEqual(['wrapped'])
  })
})

describe('hiddenFeatures on the client', () => {
  it('reads an ISO createdAt from GET /api/user', () => {
    expect(hiddenFeatures({ createdAt: '2026-10-13T08:00:00.000Z' })).toEqual(OPT_IN_FEATURES)
    expect(hiddenFeatures({ createdAt: '2026-10-11T23:59:59.000Z' })).toEqual([])
  })

  it('shows everything until the profile loads', () => {
    expect(hiddenFeatures(undefined)).toEqual([])
  })
})
