import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'

// The root layout wraps every page, public ones included, in these providers.
// Anything they fetch runs on the landing page's every visit.
const state = vi.hoisted(() => ({ user: null as { id: string } | null, pathname: '/' }))
vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  AuthKitProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: state.user }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/src/lib/analytics', () => ({
  initAnalytics: () => Promise.resolve(),
  identifyUser: vi.fn(),
  resetAnalytics: vi.fn(),
  track: vi.fn(),
  SIGN_IN_OUTCOME_COOKIE: 'x',
}))

const { ClientProviders } = await import('./ClientProviders')
// MoneyBrainProvider preloads these with a fire-and-forget import(). Load them
// now so that import can't still be running when the environment tears down.
await Promise.all([import('@/src/components/MoneyBrainDrawer'), import('@/src/components/LogExpenseModal')])

const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}))
beforeEach(() => {
  fetchMock.mockClear()
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})

async function calledPaths(pathname: string, user: { id: string } | null) {
  state.pathname = pathname
  state.user = user
  render(<ClientProviders><p>page</p></ClientProviders>)
  await act(async () => {})
  return fetchMock.mock.calls.map(([url]) => String(url).split('?')[0])
}

describe('ClientProviders', () => {
  it.each(['/', '/privacy-policy', '/features/ask-aviary'])('asks the API for nothing but site status on %s when signed out', async (path) => {
    expect(await calledPaths(path, null)).toEqual(['/api/system/status'])
  })

  // Before onboarding there's no trial, so data routes answer 402.
  it('leaves the data routes alone mid-onboarding', async () => {
    const paths = await calledPaths('/onboarding', { id: 'u1' })
    expect(paths).not.toContain('/api/expenses')
    expect(paths).not.toContain('/api/categories')
    expect(paths).not.toContain('/api/ai/brief')
  })

  // The page itself waits on OnboardingGate's /api/user check; the brief warms meanwhile.
  it('still warms the brief on an app page', async () => {
    const paths = await calledPaths('/expense/envelopes', { id: 'u1' })
    expect(paths).toContain('/api/user')
    expect(paths).toContain('/api/ai/brief')
  })
})
