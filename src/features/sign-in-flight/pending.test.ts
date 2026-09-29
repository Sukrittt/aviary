import { describe, it, expect, beforeEach } from 'vitest'
import { PENDING_TTL_MS, markSignInFlight, takeSignInFlight } from './pending'

beforeEach(() => sessionStorage.clear())

describe('sign-in flight flag', () => {
  it('is false when nobody just signed in', () => {
    expect(takeSignInFlight()).toBe(false)
  })

  it('is true exactly once after sign-in', () => {
    markSignInFlight(1000)
    expect(takeSignInFlight(2000)).toBe(true)
    expect(takeSignInFlight(2001)).toBe(false)
  })

  it('goes stale, and is cleared anyway', () => {
    markSignInFlight(0)
    expect(takeSignInFlight(PENDING_TTL_MS + 1)).toBe(false)
    expect(sessionStorage.length).toBe(0)
  })
})
