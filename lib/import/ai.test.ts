import { describe, it, expect, vi } from 'vitest'

const runJev = vi.fn()
vi.mock('@/lib/ai/jev', () => ({ runJev: (...a: unknown[]) => runJev(...a) }))
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: vi.fn() }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn() }))

const { pickCategoryGroups } = await import('./ai')

describe('pickCategoryGroups', () => {
  it('falls back to a group the budget has, never a bare Lifestyle it doesn’t', async () => {
    runJev.mockResolvedValue({})
    expect(await pickCategoryGroups(['Fuel'], ['🏠 Bills', '🎬 Lifestyle'], 'u')).toEqual({ Fuel: '🏠 Bills' })
    expect(await pickCategoryGroups(['Fuel'], ['Essentials', 'Lifestyle', 'Savings'], 'u')).toEqual({ Fuel: 'Lifestyle' })
  })
})
