import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'
import { updateBudget } from '@/src/api/budgets'
import { addCategory, getSplitBuckets } from '@/src/api/categories'
import { addGroup } from '@/src/api/groups'
import { track } from '@/src/lib/analytics'
import { INCOME_CATEGORY } from '@/src/lib/envelope'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), startTimer: () => () => 7 }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/src/api/budgets', () => ({
  getBudgets: vi.fn(async () => []),
  updateBudget: vi.fn(async () => ({})),
}))
vi.mock('@/src/api/groups', () => ({ addGroup: vi.fn(async () => ({})) }))
vi.mock('@/src/api/categories', () => ({
  addCategory: vi.fn(async () => ({})),
  getSplitBuckets: vi.fn(async () => ({})),
}))
vi.mock('@/src/api/account', () => ({ updateUser: vi.fn(async (patch) => patch), getUser: vi.fn(async () => ({ onboardedAt: null })) }))
vi.mock('@/src/api/billing', () => ({
  completeOnboarding: vi.fn(async () => ({ onboardedAt: '2026-10-08T12:00:00.000Z', user: {}, access: {} })),
}))

const PICK_OWN = 'Pick my own groups and categories'
const button = (name: string | RegExp) => screen.getByRole('button', { name })
// What each envelope was assigned, keyed by its category label.
const assigned = (): Record<string, number> =>
  Object.fromEntries(vi.mocked(updateBudget).mock.calls.map(([, category, body]) => [category, Number(body.assigned)]))
const completed = () => vi.mocked(track).mock.calls.filter(([e]) => e === 'onboarding_completed').map(([, p]) => p)

function start() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><SetupWizardPage /></QueryClientProvider>)
  fireEvent.click(button('Continue')) // currency
  return client
}

describe('flexible setup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finishes from the income step on the starter budget, income split the suggested way', async () => {
    const client = start()
    fireEvent.click(button(/50,000/))
    fireEvent.click(button('Finish setup'))
    await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })

    expect(vi.mocked(addGroup).mock.calls.map(([name]) => name)).toEqual(['🏠 Essentials', '🎬 Lifestyle'])
    expect(addCategory).toHaveBeenCalledTimes(5)
    // Defaults are known categories, so there's nothing to ask Jev.
    expect(getSplitBuckets).not.toHaveBeenCalled()
    const rows = assigned()
    expect(rows[INCOME_CATEGORY]).toBe(50000)
    const envelopes = Object.entries(rows).filter(([k]) => k !== INCOME_CATEGORY)
    expect(envelopes).toHaveLength(5)
    expect(envelopes.reduce((n, [, v]) => n + v, 0)).toBe(50000)
    expect(completed()[0]).toMatchObject({ groups_count: 2, categories_count: 5, customized: false, skipped_income: false })
    expect(screen.queryByRole('heading', { name: 'Group your money' })).toBeNull()
    client.clear()
  })

  it('skips income and still sets up the starter envelopes, all at zero', async () => {
    const client = start()
    expect(screen.getByText('You can add it from Home any time')).toBeTruthy()
    fireEvent.click(button('Skip for now'))
    expect(await screen.findByText('Add it later', {}, { timeout: 3000 })).toBeTruthy()

    const rows = assigned()
    expect(Object.keys(rows)).toHaveLength(6)
    expect(Object.values(rows).every((v) => v === 0)).toBe(true)
    expect(completed()[0]).toMatchObject({ customized: false, skipped_income: true })
    client.clear()
  })

  it('picks its own categories without income, finishing at the categories step', async () => {
    const client = start()
    fireEvent.click(button(PICK_OWN))
    fireEvent.click(button('Continue')) // groups
    fireEvent.click(button('Finish setup')) // categories
    await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })
    expect(screen.queryByRole('heading', { name: 'Assign your money' })).toBeNull()
    expect(completed()[0]).toMatchObject({ customized: true, skipped_income: true })
    client.clear()
  })

  it('lets the assign step finish with money left over', async () => {
    const client = start()
    fireEvent.click(button(/50,000/))
    fireEvent.click(button(PICK_OWN))
    fireEvent.click(button('Continue')) // groups
    fireEvent.click(button('Continue')) // categories
    await screen.findByRole('heading', { name: 'Assign your money' })
    const inputs = screen.getAllByRole('spinbutton')
    inputs.forEach((input) => fireEvent.change(input, { target: { value: '' } }))
    fireEvent.change(inputs[0], { target: { value: '1' } })
    expect(screen.getByText(/left\. It'll wait in Ready to Assign$/)).toBeTruthy()
    fireEvent.click(button('Finish setup'))
    await waitFor(() => expect(completed()).toHaveLength(1), { timeout: 3000 })
    expect(assigned()['🏠 Rent']).toBe(1)
    client.clear()
  })

  // Edits made on the custom path stay, so going back can't finish them
  // through the starter path and report them as not customized.
  it('stays on the custom path after going back from the groups step', () => {
    const client = start()
    fireEvent.click(button(/50,000/))
    fireEvent.click(button(PICK_OWN))
    expect(screen.getByRole('heading', { name: 'Group your money' })).toBeTruthy()
    fireEvent.click(button('Back'))
    expect(button('Continue')).toBeTruthy()
    expect(screen.queryByRole('button', { name: PICK_OWN })).toBeNull()
    fireEvent.click(button('Continue'))
    expect(screen.getByRole('heading', { name: 'Group your money' })).toBeTruthy()
    client.clear()
  })
})
