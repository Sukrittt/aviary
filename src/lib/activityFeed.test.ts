import { describe, expect, it } from 'vitest'
import { stablePhotoUrl } from './activityFeed'

describe('stablePhotoUrl', () => {
  it('keeps the first signed URL for a photo until it nears expiry', () => {
    const t = 1_000_000
    expect(stablePhotoUrl('https://b.test/p1.jpg?s=a', t)).toBe('https://b.test/p1.jpg?s=a')
    expect(stablePhotoUrl('https://b.test/p1.jpg?s=b', t + 60_000)).toBe('https://b.test/p1.jpg?s=a')
    expect(stablePhotoUrl('https://b.test/p1.jpg?s=c', t + 51 * 60_000)).toBe('https://b.test/p1.jpg?s=c')
  })

  // The server hands out a cached URL until half its hour is gone, so the
  // first URL the client sees may have only 30 minutes left (#160).
  it('stops reusing a URL before the server-guaranteed 30 minutes run out', () => {
    const t = 5_000_000
    stablePhotoUrl('https://b.test/p4.jpg?s=a', t)
    expect(stablePhotoUrl('https://b.test/p4.jpg?s=b', t + 30 * 60_000)).toBe('https://b.test/p4.jpg?s=b')
  })

  it('treats a replaced photo (new path) as new', () => {
    stablePhotoUrl('https://b.test/p2.jpg?s=a', 0)
    expect(stablePhotoUrl('https://b.test/p3.jpg?s=b', 1)).toBe('https://b.test/p3.jpg?s=b')
  })
})
