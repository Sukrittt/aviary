import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'
import { completeOnboarding } from '@/src/api/billing'
import { getUser } from '@/src/api/account'
import { updateBudget } from '@/src/api/budgets'
import { addGroup } from '@/src/api/groups'
import { addCategory } from '@/src/api/categories'

// Setup finished on another device (say, the phone) while this tab sat
// mid-wizard. Saving here must not write a second budget over it.

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), startTimer: () => () => 7 }))
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/src/api/budgets', () => ({ getBudgets: vi.fn(async () => []), updateBudget: vi.fn(async () => ({})) }))
vi.mock('@/src/api/groups', () => ({ addGroup: vi.fn(async () => ({})) }))
vi.mock('@/src/api/categories', () => ({ addCategory: vi.fn(async () => ({})) }))
vi.mock('@/src/api/account', () => ({ updateUser: vi.fn(async (patch) => patch), getUser: vi.fn() }))
vi.mock('@/src/api/billing', () => ({
  getBillingStatus: vi.fn(async () => ({})),
  completeOnboarding: vi.fn(async () => ({ onboardedAt: '2026-10-19T09:00:00.000Z', user: {}, access: {} })) }))

function walkToFinish() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }))
  fireEvent.click(screen.getByRole('button', { name: /^Currency, / }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
  fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
}

describe('setup already finished on another device', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes nothing and offers the way to the budget', async () => {
    vi.mocked(getUser).mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: '2026-10-19T09:00:00.000Z' })
    walkToFinish()
    expect(await screen.findByText('You’re already set up')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to my budget' }))
    expect(replace).toHaveBeenCalledWith('/expense')
    expect(addGroup).not.toHaveBeenCalled()
    expect(addCategory).not.toHaveBeenCalled()
    expect(updateBudget).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('a not-yet-onboarded account still saves as usual', async () => {
    vi.mocked(getUser).mockResolvedValue({ email: 'a@b.com', emailVerified: true, onboardedAt: null })
    walkToFinish()
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByText('You’re already set up')).not.toBeInTheDocument()
  })
})
