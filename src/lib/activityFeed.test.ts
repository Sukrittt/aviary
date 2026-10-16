import { describe, expect, it } from 'vitest'
import { stablePhotoUrl } from './activityFeed'

describe('stablePhotoUrl', () => {
  it('keeps the first signed URL for a photo until it nears expiry', () => {
    const t = 1_000_000
    expect(stablePhotoUrl('https://b.test/p1.jpg?s=a', t)).toBe('https://b.test/p1.jpg?s=a')
    expect(stablePhotoUrl('https://b.test/p1.jpg?s=b', t + 60_000)).toBe('https://b.test/p1.jpg?s=a')
    expect(stablePhotoUrl('https://b.test/p1.jpg?s=c', t + 51 * 60_000)).toBe('https://b.test/p1.jpg?s=c')
  })

  it('treats a replaced photo (new path) as new', () => {
    stablePhotoUrl('https://b.test/p2.jpg?s=a', 0)
    expect(stablePhotoUrl('https://b.test/p3.jpg?s=b', 1)).toBe('https://b.test/p3.jpg?s=b')
  })
})
