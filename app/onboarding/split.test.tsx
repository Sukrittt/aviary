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
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
  fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pick my own groups and categories' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  return client
}

const amountOf = (name: string) =>
  Number((screen.getByRole('textbox', { name: `Rename ${name}` }).closest('.setup-assign-row')!.querySelector('input[type="number"]') as HTMLInputElement).value)

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
    expect(document.querySelector('.setup-split-why')).toHaveTextContent(/^Suggested split:Needs 62\.5%Wants 37\.5%$/)
    expect(screen.getAllByText('Need')).toHaveLength(3)
    expect(screen.getAllByText('Want')).toHaveLength(2)
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
    expect(screen.getByText('Savings', { selector: '.setup-assign-bucket' })).toBeInTheDocument()
    expect(document.querySelector('.setup-split-why')).toHaveTextContent(/^Suggested split:Needs 50%Wants 30%Savings 20%$/)
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
  expect(await screen.findByText('Savings', { selector: '.setup-assign-bucket' })).toBeInTheDocument()
  expect(amountOf('Index fund')).toBe(10000)
  client.clear()
})

it('identifies the percentages as the original suggestion after an even split or an edit', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValue({})
  const client = walkToCategories()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }))
  expect(amountOf('Rent')).toBe(10000)
  expect(document.querySelector('.setup-split-why')).toHaveTextContent('Suggested split:')
  const input = screen.getByRole('textbox', { name: 'Rename Rent' }).closest('.setup-assign-row')!.querySelector('input[type="number"]')!
  fireEvent.change(input, { target: { value: '12000' } })
  expect(document.querySelector('.setup-split-why')).toHaveTextContent('Suggested split:')
  client.clear()
})


it.each(['manual', 'even'])('preserves a %s allocation when classification succeeds on retry', async (choice) => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ 'index fund': 'savings' })
  const client = walkToCategories()
  fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
  fireEvent.change(screen.getAllByPlaceholderText('Category name').at(-1)!, { target: { value: 'Index fund' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Select Index fund/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  if (choice === 'manual') {
    const input = screen.getByRole('textbox', { name: 'Rename Index fund' }).closest('.setup-assign-row')!.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '12000' } })
  } else fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }))
  const names = ['Rent', 'Groceries', 'Utilities', 'Eating out', 'Entertainment', 'Index fund']
  const before = names.map(amountOf)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('Savings', { selector: '.setup-assign-bucket' })
  expect(names.map(amountOf)).toEqual(before)
  client.clear()
})

it('accepts refreshed classifications after switching a custom allocation back to Suggested split', async () => {
  vi.mocked(getSplitBuckets).mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ 'index fund': 'savings' })
  const client = walkToCategories()
  fireEvent.click(screen.getAllByRole('button', { name: /Add category/ })[0])
  fireEvent.change(screen.getAllByPlaceholderText('Category name').at(-1)!, { target: { value: 'Index fund' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Select Index fund/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('button', { name: 'Finish setup' })
  fireEvent.click(screen.getByRole('button', { name: 'Split evenly' }))
  fireEvent.click(screen.getByRole('button', { name: 'Suggested split' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('Savings', { selector: '.setup-assign-bucket' })
  expect(amountOf('Index fund')).toBe(10000)
  client.clear()
})
