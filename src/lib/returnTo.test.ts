import { describe, expect, it } from 'vitest'
import { safeReturnTo } from './returnTo'

describe('safeReturnTo', () => {
  it('keeps paths on this site', () => {
    expect(safeReturnTo('/join/ABC123')).toBe('/join/ABC123')
    expect(safeReturnTo('%2Fjoin%2FABC123')).toBe('/join/ABC123')
  })

  it('refuses anything a browser would resolve to another origin', () => {
    for (const raw of ['//evil.com', '/\\evil.com', 'https://evil.com', '/%09/evil.com', '/%0a/evil.com', '%2F%2Fevil.com']) {
      expect(safeReturnTo(raw)).toBeNull()
      if (safeReturnTo(raw)) expect(new URL(safeReturnTo(raw)!, 'https://app.test').origin).toBe('https://app.test')
    }
  })
})
