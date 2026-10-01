import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'
import { completeOnboarding } from '@/src/api/billing'
import { getUser } from '@/src/api/account'
import { track } from '@/src/lib/analytics'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), startTimer: () => () => 7 }))
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/src/api/budgets', () => ({
  getBudgets: vi.fn(async () => []),
  updateBudget: vi.fn(async () => ({})),
}))
vi.mock('@/src/api/groups', () => ({ addGroup: vi.fn(async () => ({})) }))
vi.mock('@/src/api/categories', () => ({ addCategory: vi.fn(async () => ({})) }))
vi.mock('@/src/api/account', () => ({ updateUser: vi.fn(async (patch) => patch), getUser: vi.fn(async () => ({ onboardedAt: null })) }))
vi.mock('@/src/api/billing', () => ({
  completeOnboarding: vi.fn(async () => ({ onboardedAt: '2026-09-18T12:00:00.000Z', user: { currencyCode: 'USD' }, access: {} })),
}))

const mockTrack = vi.mocked(track)
const eventsNamed = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name).map(([, props]) => props)

function walkToFinish() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
  return client
}

describe('onboarding analytics', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getUser).mockResolvedValue({ email: 'test@example.com', emailVerified: true, onboardedAt: null }) })

  it('reports every step, the back tap, and the finish, matching mobile', async () => {
    const client = walkToFinish()
    await waitFor(() => expect(eventsNamed('onboarding_completed')).toHaveLength(1))

    expect(eventsNamed('onboarding_started')).toHaveLength(1)
    expect(eventsNamed('onboarding_step_viewed').map((p) => p?.step_name)).toEqual([
      'currency', 'income', 'groups', 'income', 'groups', 'categories', 'assign',
    ])
    expect(eventsNamed('onboarding_back_tapped')).toEqual([{ from_step: 2, step_name: 'groups' }])
    const completed = eventsNamed('onboarding_step_completed')
    expect(completed.map((p) => p?.step_name)).toEqual(['currency', 'income', 'income', 'groups', 'categories', 'assign'])
    expect(completed[0]).toEqual({ step: 0, step_name: 'currency', seconds_on_step: 7, currency: 'USD' })
    expect(completed[1]).toMatchObject({ used_quick_pick: true })
    expect(completed[5]).toMatchObject({ step_name: 'assign', edited_split: false })
    expect(eventsNamed('onboarding_completed')[0]).toMatchObject({ total_seconds: 7, groups_count: 2, currency: 'USD' })
    expect(screen.queryByText('Assigned')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(replace).toHaveBeenCalledWith('/account/trial-notice')
    client.clear()
  })

  it('reports a failed save without counting the last step as done', async () => {
    vi.mocked(completeOnboarding).mockRejectedValueOnce(new Error('503'))
    const client = walkToFinish()
    await waitFor(() => expect(eventsNamed('onboarding_failed')).toEqual([{ reason: 'save_failed' }]))
    expect(eventsNamed('onboarding_completed')).toHaveLength(0)
    expect(eventsNamed('onboarding_step_completed').map((p) => p?.step_name)).not.toContain('assign')
    client.clear()
  })
  it('recovers a lost completion response after the server saved onboarding', async () => {
    vi.mocked(completeOnboarding).mockRejectedValueOnce(new Error('Response lost'))
    vi.mocked(getUser).mockResolvedValueOnce({ email: 'test@example.com', emailVerified: true, onboardedAt: '2026-10-01', currencyCode: 'USD' })
    const client = walkToFinish()
    expect(await screen.findByRole('heading', { name: 'Your budget is ready to go.' })).toBeInTheDocument()
    expect(eventsNamed('onboarding_failed')).toHaveLength(0)
    expect(eventsNamed('onboarding_completed')).toEqual([expect.objectContaining({ recovered_after_error: true })])
    client.clear()
  })

})
