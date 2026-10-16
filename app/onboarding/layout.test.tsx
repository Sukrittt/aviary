import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('server-only', () => ({}))
const redirect = vi.fn((path: string) => { throw new Error(`redirect:${path}`) })
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => 'US' }) }))

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status })
const userGET = vi.fn(json({ _id: 'user_1', onboardedAt: null }))
vi.mock('../api/user/route', () => ({ GET: () => userGET() }))

const { default: Layout } = await import('./layout')

beforeEach(() => vi.clearAllMocks())

describe('/onboarding layout', () => {
  // Reloading on the screens after setup restarted the wizard at step 0.
  it('sends an account that already onboarded to /expense', async () => {
    userGET.mockImplementationOnce(json({ _id: 'user_1', onboardedAt: '2026-01-01T00:00:00.000Z' }))
    await expect(Layout({ children: null })).rejects.toThrow('redirect:/expense')
  })

  it('renders the wizard for an account that has not onboarded', async () => {
    const tree = (await Layout({ children: null })) as ReactElement<{ code: string }>
    expect(redirect).not.toHaveBeenCalled()
    expect(tree.props.code).toBe('USD')
  })

  it('renders the wizard when the profile cannot be read', async () => {
    userGET.mockImplementationOnce(json({ error: 'boom' }, 500))
    await Layout({ children: null })
    expect(redirect).not.toHaveBeenCalled()
  })
})
