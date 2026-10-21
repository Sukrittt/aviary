import { describe, it, expect, vi, beforeEach } from 'vitest'

const hits: { key: string; ts: Date }[] = []

vi.mock('./mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: vi.fn(() => ({
      countDocuments: vi.fn(async (filter: { key: string; ts: { $gte: Date } }) =>
        hits.filter((h) => h.key === filter.key && h.ts >= filter.ts.$gte).length,
      ),
      insertOne: vi.fn(async (doc: { key: string; ts: Date }) => {
        hits.push(doc)
        return { insertedId: hits.length }
      }),
    })),
  })),
}))

const { isRateLimited } = await import('./rateLimit')

beforeEach(() => {
  hits.length = 0
})

describe('isRateLimited', () => {
  it('allows requests under the limit', async () => {
    expect(await isRateLimited('user_a', { windowMs: 60_000, limit: 3 })).toBe(false)
    expect(await isRateLimited('user_a', { windowMs: 60_000, limit: 3 })).toBe(false)
    expect(await isRateLimited('user_a', { windowMs: 60_000, limit: 3 })).toBe(false)
  })

  it('blocks once the limit is reached', async () => {
    await isRateLimited('user_a', { windowMs: 60_000, limit: 2 })
    await isRateLimited('user_a', { windowMs: 60_000, limit: 2 })
    expect(await isRateLimited('user_a', { windowMs: 60_000, limit: 2 })).toBe(true)
  })

  it('keeps separate keys independent', async () => {
    await isRateLimited('user_a', { windowMs: 60_000, limit: 1 })
    expect(await isRateLimited('user_b', { windowMs: 60_000, limit: 1 })).toBe(false)
  })

  it('does not count hits outside the window', async () => {
    hits.push({ key: 'user_a', ts: new Date(Date.now() - 120_000) })
    expect(await isRateLimited('user_a', { windowMs: 60_000, limit: 1 })).toBe(false)
  })

  it('stamps each hit to expire only once the longest tier window has passed (#211)', async () => {
    const before = Date.now()
    await isRateLimited('user_a', [{ windowMs: 60_000, limit: 5 }, { windowMs: 86_400_000, limit: 5 }])
    const [hit] = hits as { expiresAt?: Date }[]
    expect(hit.expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 86_400_000)
  })

  describe('multiple tiers', () => {
    it('trips on the tighter burst tier before the looser hourly tier is reached', async () => {
      const tiers = [
        { windowMs: 60_000, limit: 2 }, // burst: 2/min
        { windowMs: 3_600_000, limit: 100 }, // hourly: 100/hr
      ]
      expect(await isRateLimited('user_a', tiers)).toBe(false)
      expect(await isRateLimited('user_a', tiers)).toBe(false)
      expect(await isRateLimited('user_a', tiers)).toBe(true)
    })

    it('records exactly one hit per allowed request regardless of tier count', async () => {
      const tiers = [
        { windowMs: 60_000, limit: 10 },
        { windowMs: 3_600_000, limit: 10 },
      ]
      await isRateLimited('user_a', tiers)
      await isRateLimited('user_a', tiers)
      expect(hits.filter((h) => h.key === 'user_a')).toHaveLength(2)
    })

    it('trips on the hourly tier once the burst window has passed but the hourly cap is hit', async () => {
      for (let i = 0; i < 5; i++) {
        hits.push({ key: 'user_a', ts: new Date(Date.now() - 120_000) })
      }
      const tiers = [
        { windowMs: 60_000, limit: 10 }, // burst window empty (hits are 2min old)
        { windowMs: 3_600_000, limit: 5 }, // hourly cap already hit
      ]
      expect(await isRateLimited('user_a', tiers)).toBe(true)
    })
  })
})
