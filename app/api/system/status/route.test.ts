import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/systemSettings', () => ({
  getSystemSettings: vi.fn(async () => ({
    aiDisabled: false,
    maintenance: { on: false, message: 'old draft' },
    appUpdate: { android: { latestVersion: '2.11.0', minVersion: '', storeUrl: 'https://play.example' } },
  })),
}))

const { GET } = await import('./route')

describe('GET /api/system/status', () => {
  it('is cacheable by the CDN for about a minute, and hides an inactive maintenance message', async () => {
    const res = await GET()
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30, stale-while-revalidate=30')
    expect(await res.json()).toEqual({
      aiDisabled: false,
      maintenance: { on: false, message: '' },
      appUpdate: { android: { latestVersion: '2.11.0', minVersion: '', storeUrl: 'https://play.example' } },
    })
  })
})
