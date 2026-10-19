import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { queryWrapper } from '../test-utils/queryWrapper'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import type { BudgetList, BudgetSummary } from '../api/spaces'

const { getBudgets, createBudget, switchBudget } = vi.hoisted(() => ({
  getBudgets: vi.fn(),
  createBudget: vi.fn(),
  switchBudget: vi.fn(),
}))
vi.mock('../api/spaces', () => ({ getBudgets, createBudget, switchBudget }))

const { BudgetSwitcher, BudgetLine, NewBudgetEntry } = await import('./BudgetSwitcher')

const budget = (id: string, name: string, emoji: string, extra: Partial<BudgetSummary> = {}): BudgetSummary => ({
  id, name, emoji, role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: id === 'u1',
  members: [{ userId: 'u1', name: 'Sukrit', avatarUrl: null, role: 'owner', joinedAt: null }],
  ...extra,
})
const personal = budget('u1', 'Personal', '🐦')
const home = budget('s1', 'Home', '🏠')
const list = (budgets: BudgetSummary[], extra: Partial<BudgetList> = {}): BudgetList => ({ budgets, count: budgets.length, limit: 5, activeId: 'u1', ...extra })

const renderIt = (ui: React.ReactElement) => render(<CurrencyScope code="EUR">{ui}</CurrencyScope>, { wrapper: queryWrapper() })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BudgetSwitcher', () => {
  it('stays out of the way with one budget', async () => {
    getBudgets.mockResolvedValue(list([personal]))
    renderIt(<><BudgetSwitcher /><BudgetLine /></>)
    await waitFor(() => expect(getBudgets).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: /Switch budget/ })).toBeNull()
    expect(screen.queryByText(/Logging to/)).toBeNull()
  })

  it('shows the active budget with two, and switches from the sheet', async () => {
    getBudgets.mockResolvedValue(list([personal, home], { activeId: 's1' }))
    renderIt(<BudgetSwitcher />)
    fireEvent.click(await screen.findByRole('button', { name: 'Budget: Home. Switch budget' }))
    expect(screen.getByText('2 of 5 budgets')).toBeTruthy()
    expect(screen.getAllByText('Owner')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /^Home/, current: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Personal/ }))
    expect(switchBudget).toHaveBeenCalledWith(personal)
  })

  it('swaps New budget for a way to ask for more at the limit', async () => {
    const five = [personal, home, budget('s2', 'Trip', '✈️'), budget('s3', 'Work', '💼'), budget('s4', 'Pets', '🐾')]
    getBudgets.mockResolvedValue(list(five))
    renderIt(<BudgetSwitcher />)
    fireEvent.click(await screen.findByRole('button', { name: /Switch budget/ }))
    expect(screen.getByText('5 of 5 budgets')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New budget' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Contact us' }).getAttribute('href')).toBe('/account/help')
  })
})

describe('CreateBudgetDialog', () => {
  it('sends the name, emoji, currency and copy choice, then switches to the new budget', async () => {
    getBudgets.mockResolvedValue(list([personal]))
    const created = budget('s9', 'Goa trip', '✈️')
    createBudget.mockResolvedValue(created)
    renderIt(<NewBudgetEntry render={(open) => <button type="button" onClick={open}>New budget</button>} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New budget' }))

    expect(screen.getByRole('radio', { name: '🏠' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: /Copy categories from Personal/ })).toHaveProperty('checked', true)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Goa trip ' } })
    fireEvent.click(screen.getByRole('radio', { name: '✈️' }))
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    await waitFor(() => expect(createBudget).toHaveBeenCalledWith({ name: 'Goa trip', emoji: '✈️', currencyCode: 'EUR', copyCategories: false }))
    await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(created), { timeout: 2000 })
  })

  it('explains the limit instead of the raw error', async () => {
    getBudgets.mockResolvedValue(list([personal]))
    const { HttpError } = await import('../api/client')
    createBudget.mockRejectedValue(new HttpError(409, 'Failed to create budget: 409'))
    renderIt(<NewBudgetEntry render={(open) => <button type="button" onClick={open}>New budget</button>} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New budget' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/hit your budget limit/)
  })
})
