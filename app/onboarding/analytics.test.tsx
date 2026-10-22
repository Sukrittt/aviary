import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'
import { completeOnboarding } from '@/src/api/billing'
import { getUser } from '@/src/api/account'
import { track, trackFirst } from '@/src/lib/analytics'
import { postExpensePayload } from '@/src/api/expenses'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), trackFirst: vi.fn(), startTimer: () => () => 7 }))
vi.mock('@/src/api/expenses', async (orig) => ({ ...(await orig<object>()), postExpensePayload: vi.fn(async () => ({ id: 'e1' })) }))
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
  getBillingStatus: vi.fn(async () => ({})),
  completeOnboarding: vi.fn(async () => ({ onboardedAt: '2026-09-18T12:00:00.000Z', user: { currencyCode: 'USD' }, access: {} })),
}))

const mockTrack = vi.mocked(track)
const eventsNamed = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name).map(([, props]) => props)

function walkToFinish() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }))
  fireEvent.click(screen.getByRole('button', { name: /^Currency, / }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
  fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pick my own groups and categories' }))
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
    await waitFor(() => expect(eventsNamed('onboarding_completed')).toHaveLength(1), { timeout: 3000 })

    expect(eventsNamed('onboarding_started')).toHaveLength(1)
    expect(eventsNamed('onboarding_step_viewed').map((p) => p?.step_name)).toEqual([
      'income', 'groups', 'income', 'groups', 'categories', 'assign', 'first_expense',
    ])
    expect(eventsNamed('onboarding_back_tapped')).toEqual([{ from_step: 1, step_name: 'groups' }])
    const completed = eventsNamed('onboarding_step_completed')
    expect(completed.map((p) => p?.step_name)).toEqual(['income', 'income', 'groups', 'categories', 'assign'])
    expect(completed[0]).toEqual({ step: 0, step_name: 'income', seconds_on_step: 7, currency: 'USD', used_quick_pick: true, skipped_income: false, customized: true })
    expect(completed[4]).toMatchObject({ step_name: 'assign', edited_split: false })
    expect(eventsNamed('onboarding_completed')[0]).toMatchObject({ total_seconds: 7, groups_count: 2, currency: 'USD', customized: true, skipped_income: false })

    // The budget's saved, so the last step logs a real expense against it.
    expect(await screen.findByRole('heading', { name: 'Log your first expense' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    // Opens on a want, not the rent.
    expect(screen.getByRole('button', { name: 'Eating out' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount spent' }), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }))
    await waitFor(() => expect(postExpensePayload).toHaveBeenCalledWith(expect.objectContaining({ item: 'Eating out', category: 'Eating out', amount_inr: '250', payment_method: 'bank', source: 'manual' })))
    await waitFor(() => expect(trackFirst).toHaveBeenCalledWith('expense_logged', 'first_expense_at', expect.anything()))
    expect(eventsNamed('onboarding_step_completed').at(-1)).toMatchObject({ step: 4, step_name: 'first_expense', logged: true })

    expect(await screen.findByRole('heading', { name: 'Your budget is live.' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Your first expense is in. You’ll see it on Home.')).toBeInTheDocument()
    expect(screen.getByText('Your first 30 days are free. No card, nothing to cancel.')).toBeInTheDocument()
    expect(screen.getByText('$250 · Eating out')).toBeInTheDocument()
    // Straight home: no extras, no survey, no trial notice in between.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(replace).toHaveBeenCalledWith('/expense')
    expect(eventsNamed('onboarding_extras_chosen')).toHaveLength(0)
    client.clear()
  })

  it('a skipped first expense still lands on the celebration, without saving one', async () => {
    const client = walkToFinish()
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }, { timeout: 3000 }))
    expect(screen.getByRole('heading', { name: 'Your budget is live.' })).toBeInTheDocument()
    expect(screen.queryByText('First expense')).not.toBeInTheDocument()
    expect(postExpensePayload).not.toHaveBeenCalled()
    expect(eventsNamed('onboarding_step_completed').at(-1)).toMatchObject({ step_name: 'first_expense', logged: false })
    client.clear()
  })

  it('keeps the first expense on screen with a message when it fails to save', async () => {
    vi.mocked(postExpensePayload).mockRejectedValueOnce(new Error('Failed to add expense: 503'))
    const client = walkToFinish()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Amount spent' }, { timeout: 3000 }), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save that. Check your connection and try again.')
    expect(screen.getByRole('heading', { name: 'Log your first expense' })).toBeInTheDocument()
    client.clear()
  })

  it('reports a failed save without counting the last step as done', async () => {
    vi.mocked(completeOnboarding).mockRejectedValueOnce(new Error('503'))
    const client = walkToFinish()
    await waitFor(() => expect(eventsNamed('onboarding_failed')).toEqual([{ reason: 'save_failed' }]), { timeout: 3000 })
    expect(eventsNamed('onboarding_completed')).toHaveLength(0)
    expect(eventsNamed('onboarding_step_completed').map((p) => p?.step_name)).not.toContain('assign')
    client.clear()
  })
  it('recovers a lost completion response after the server saved onboarding', async () => {
    vi.mocked(completeOnboarding).mockRejectedValueOnce(new Error('Response lost'))
    // Not onboarded when the save starts; onboarded by the time it's re-checked.
    vi.mocked(getUser)
      .mockResolvedValueOnce({ email: 'test@example.com', emailVerified: true, onboardedAt: null })
      .mockResolvedValueOnce({ email: 'test@example.com', emailVerified: true, onboardedAt: '2026-10-01', currencyCode: 'USD' })
    const client = walkToFinish()
    expect(await screen.findByRole('heading', { name: 'Log your first expense' }, { timeout: 3000 })).toBeInTheDocument()
    expect(eventsNamed('onboarding_failed')).toHaveLength(0)
    expect(eventsNamed('onboarding_completed')).toEqual([expect.objectContaining({ recovered_after_error: true })])
    client.clear()
  })

  it('shows the real save step in the Finish button while saving', async () => {
    let finish!: () => void
    vi.mocked(completeOnboarding).mockReturnValueOnce(new Promise((resolve) => {
      finish = () => resolve({ onboardedAt: '2026-09-18T12:00:00.000Z', user: { currencyCode: 'USD' } as never, access: {} as never })
    }))
    const client = walkToFinish()
    expect(screen.getByText('Creating your categories…')).toBeInTheDocument()
    expect(await screen.findByText('Starting your budget…')).toBeInTheDocument()
    finish()
    expect(await screen.findByRole('heading', { name: 'Log your first expense' }, { timeout: 3000 })).toBeInTheDocument()
    client.clear()
  })
})
