import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'
import { getSplitBuckets } from '@/src/api/categories'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), startTimer: () => () => 7 }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/src/api/budgets', () => ({ getBudgets: vi.fn(async () => []), updateBudget: vi.fn(async () => ({})) }))
vi.mock('@/src/api/groups', () => ({ addGroup: vi.fn(async () => ({})) }))
vi.mock('@/src/api/categories', () => ({ addCategory: vi.fn(async () => ({})), getSplitBuckets: vi.fn(async () => ({})) }))
vi.mock('@/src/api/account', () => ({ updateUser: vi.fn(async (p) => p), getUser: vi.fn(async () => ({ onboardedAt: null })) }))
vi.mock('@/src/api/billing', () => ({ completeOnboarding: vi.fn() }))

function walkToCategories() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  return client
}

const amountOf = (name: string) =>
  Number((screen.getByText(name).closest('.setup-assign-row')!.querySelector('input') as HTMLInputElement).value)

describe('onboarding suggested split', () => {
  beforeEach(() => vi.clearAllMocks())

  it('splits the defaults 50/30/20 without asking Jev', async () => {
    const client = walkToCategories()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
    expect(getSplitBuckets).not.toHaveBeenCalled()
    // Only needs and wants are picked by default, so they keep their 50:30
    // ratio (31,250 and 18,750), give or take the rounding leftover on Rent.
    const needs = amountOf('Rent') + amountOf('Groceries') + amountOf('Utilities')
    const wants = amountOf('Eating out') + amountOf('Entertainment')
    expect(needs + wants).toBe(50000)
    expect(Math.abs(needs - 31250)).toBeLessThanOrEqual(500)
    expect(amountOf('Rent')).toBeGreaterThan(amountOf('Utilities'))
    client.clear()
  })

  it('asks Jev about a category the user named and uses its tag', async () => {
    vi.mocked(getSplitBuckets).mockResolvedValue({ 'index fund': 'savings' })
    const client = walkToCategories()
    fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
    fireEvent.change(screen.getAllByPlaceholderText('Category name').at(-1)!, { target: { value: 'Index fund' } })
    const check = screen.getByRole('checkbox', { name: /Select Index fund/ })
    if (check.getAttribute('aria-checked') !== 'true') fireEvent.click(check)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('button', { name: 'Finish setup' })).toBeInTheDocument()
    expect(getSplitBuckets).toHaveBeenCalledWith([{ name: 'Index fund', group: expect.any(String) }])
    expect(amountOf('Index fund')).toBe(10000)
    client.clear()
  })
})
