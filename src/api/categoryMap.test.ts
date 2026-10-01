import { expect, it, vi } from 'vitest'
import { apiFetch } from './client'
import { suggestCategoryLLM } from './categoryMap'
vi.mock('./client', () => ({ apiFetch: vi.fn() }))

it('ends a stalled category lookup after five seconds', async () => {
  vi.useFakeTimers()
  vi.mocked(apiFetch).mockImplementation(async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  }))
  try {
    const result = suggestCategoryLLM('Milk', ['Groceries'])
    await vi.advanceTimersByTimeAsync(5000)
    expect(await Promise.race([result, Promise.resolve('still pending')])).toBe(null)
  } finally {
    vi.useRealTimers()
  }
})
