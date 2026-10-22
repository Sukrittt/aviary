import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  fireEvent.click(screen.getByRole('radio', { name: /^I’m starting fresh/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pick my own groups and categories' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  return client
}

const amountChip = (name: string) => screen.getByRole('button', { name: `${name} amount` })
const amountOf = (name: string) => Number(amountChip(name).textContent!.replace(/\D/g, ''))
function setPlanAmount(name: string, value: string) {
  fireEvent.click(amountChip(name))
  fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

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
    // A review, not a worksheet: amounts read as money, no split modes or need/want tags.
    expect(amountChip('Rent').textContent).toMatch(/^\$\d{1,3}(,\d{3})*$/)
    expect(screen.queryByRole('button', { name: 'Split evenly' })).toBeNull()
    expect(screen.queryByText('Need')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset to our suggestion' })).toBeNull()
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


it('retries a missing custom classification on the next visit to assignment', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ 'index fund': 'savings' })
  const client = walkToCategories()
  fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
  fireEvent.change(screen.getAllByPlaceholderText('Category name').at(-1)!, { target: { value: 'Index fund' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Select Index fund/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(getSplitBuckets).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(amountOf('Index fund')).toBe(10000))
  client.clear()
})

it('offers a reset only once the plan is edited, and it restores our suggestion', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValue({})
  const client = walkToCategories()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  const suggested = amountOf('Rent')
  expect(screen.queryByRole('button', { name: 'Reset to our suggestion' })).toBeNull()
  setPlanAmount('Rent', '12000')
  expect(amountOf('Rent')).toBe(12000)
  fireEvent.click(screen.getByRole('button', { name: 'Reset to our suggestion' }))
  expect(amountOf('Rent')).toBe(suggested)
  expect(screen.queryByRole('button', { name: 'Reset to our suggestion' })).toBeNull()
  client.clear()
})

it('preserves an edited plan when classification succeeds on retry', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ 'index fund': 'savings' })
  const client = walkToCategories()
  fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
  fireEvent.change(screen.getAllByPlaceholderText('Category name').at(-1)!, { target: { value: 'Index fund' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Select Index fund/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  setPlanAmount('Index fund', '12000')
  const names = ['Rent', 'Groceries', 'Utilities', 'Eating out', 'Entertainment', 'Index fund']
  const before = names.map(amountOf)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(getSplitBuckets).toHaveBeenCalledTimes(2))
  expect(names.map(amountOf)).toEqual(before)
  client.clear()
})

it('accepts refreshed classifications after resetting an edited plan', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ 'index fund': 'savings' })
  const client = walkToCategories()
  fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
  fireEvent.change(screen.getAllByPlaceholderText('Category name').at(-1)!, { target: { value: 'Index fund' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Select Index fund/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  setPlanAmount('Rent', '12000')
  fireEvent.click(screen.getByRole('button', { name: 'Reset to our suggestion' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(amountOf('Index fund')).toBe(10000))
  client.clear()
})

it('opens a plan amount in a sheet with our suggestion and the leftover as quick picks', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValue({})
  const client = walkToCategories()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  const suggested = amountOf('Rent')
  setPlanAmount('Rent', '0')
  fireEvent.click(amountChip('Rent'))
  expect(screen.getByRole('dialog', { name: 'Plan for Rent' })).toBeInTheDocument()
  // Nothing else changed, so everything left is exactly our suggestion: one pick.
  expect(screen.queryByRole('button', { name: /^Everything left/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Our suggestion/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(amountOf('Rent')).toBe(suggested)
  client.clear()
})
