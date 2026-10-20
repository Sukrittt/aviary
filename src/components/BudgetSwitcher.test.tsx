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

const importFlow = vi.hoisted(() => vi.fn())
vi.mock('./onboarding/ImportFlow', () => ({
  ImportFlow: (props: { skipAsk?: boolean; onFresh: () => void }) => {
    importFlow(props)
    return <button type="button" onClick={props.onFresh}>Start fresh instead</button>
  },
}))

const { BudgetSwitcher, BudgetLine, NewBudgetEntry } = await import('./BudgetSwitcher')

const budget = (id: string, name: string, emoji: string, extra: Partial<BudgetSummary> = {}): BudgetSummary => ({
  id, name, emoji, icon: emoji === '🐦' ? 'Bird' : emoji === '🏠' ? 'House' : 'Airplane', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: id === 'u1',
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
    // Our icons, never the emoji.
    expect(screen.queryByText('🏠')).toBeNull()
    expect(screen.queryByText('🐦')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Personal/ }))
    expect(switchBudget).toHaveBeenCalledWith(personal)
  })

  it('counts the people past the first three', async () => {
    const six = ['Priya', 'Rahul', 'Meera', 'Arjun', 'Kavya', 'Dev'].map((name, i) => ({ userId: `p${i}`, name, avatarUrl: null, role: i ? 'member' as const : 'owner' as const, joinedAt: null }))
    getBudgets.mockResolvedValue(list([personal, budget('s1', 'Home', '🏠', { members: six })]))
    renderIt(<BudgetSwitcher />)
    fireEvent.click(await screen.findByRole('button', { name: 'Budget: Personal. Switch budget' }))
    expect(screen.getByText('+3')).toBeTruthy()
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
  it('sends the name, icon, currency and copy choice, then switches to the new budget', async () => {
    getBudgets.mockResolvedValue(list([personal]))
    const created = budget('s9', 'Goa trip', '✈️')
    createBudget.mockResolvedValue(created)
    renderIt(<NewBudgetEntry render={(open) => <button type="button" onClick={open}>New budget</button>} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New budget' }))

    expect(screen.getByRole('radio', { name: 'Home' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: /Copy categories from Personal/ })).toHaveProperty('checked', true)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Goa trip ' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Trip' }))
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    await waitFor(() => expect(createBudget).toHaveBeenCalledWith({ name: 'Goa trip', icon: 'Airplane', currencyCode: 'EUR', copyCategories: false }))
    await waitFor(() => expect(switchBudget).toHaveBeenCalledWith(created), { timeout: 2000 })
  })

  it('bringing in history makes an empty budget, switches to it, then opens the import', async () => {
    getBudgets.mockResolvedValue(list([personal]))
    const created = budget('s9', 'Home', '🏠')
    createBudget.mockResolvedValue(created)
    renderIt(<NewBudgetEntry render={(open) => <button type="button" onClick={open}>New budget</button>} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New budget' }))
    expect(screen.getByRole('radio', { name: /^Start fresh/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home' } })
    fireEvent.click(screen.getByRole('radio', { name: /^Bring in history from another app/ }))
    expect(screen.queryByRole('switch', { name: /Copy categories/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create and import' }))

    await waitFor(() => expect(createBudget).toHaveBeenCalledWith({ name: 'Home', icon: 'House', currencyCode: 'EUR', copyCategories: false, import: true }))
    expect(document.cookie).toContain('aviary-budget=s9')
    expect(await screen.findByRole('dialog', { name: 'Bring your history into Home' }, { timeout: 2000 })).toBeTruthy()
    expect(importFlow).toHaveBeenCalledWith(expect.objectContaining({ skipAsk: true }))
    expect(switchBudget).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh instead' }))
    expect(switchBudget).toHaveBeenCalledWith(created)
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
