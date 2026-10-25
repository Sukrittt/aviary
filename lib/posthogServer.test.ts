import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureServer } from './posthogServer'

const fetchMock = vi.fn(async () => new Response('{}'))
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://ph.example')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fetchMock.mockClear() })

it('sends nothing outside production', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  expect(await captureServer('user_1', 'user_signed_up')).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('posts the event to the capture API under the WorkOS id', async () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  expect(await captureServer('user_1', 'user_signed_up', { source: 'reddit' })).toBe(true)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://ph.example/i/v0/e/')
  expect(JSON.parse(String(init.body))).toMatchObject({ api_key: 'phc_test', event: 'user_signed_up', distinct_id: 'user_1', properties: { source: 'reddit' } })
})

it('swallows a network failure', async () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  fetchMock.mockRejectedValueOnce(new Error('offline'))
  expect(await captureServer('user_1', 'x')).toBe(false)
})
