import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const spaces = vi.hoisted(() => ({ readOnly: false }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: spaces.readOnly, active: undefined }) }))
const add = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../hooks/useCategories', () => ({ useAddCategory: () => ({ mutateAsync: add }), useUpdateCategory: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹' }) }))
const addGroup = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../hooks/useGroups', () => ({ useGroups: () => ({ data: ['Needs'] }), useGroupIcons: () => new Map(), useAddGroup: () => ({ mutateAsync: addGroup }) }))

const { AddCategoryModal } = await import('./AddCategoryModal')

describe('AddCategoryModal', () => {
  it('shows the form in a writable budget', () => {
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} />)
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('starts a Diwali goal from its template, named and due next October', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-27T12:00:00Z') })
    const user = userEvent.setup()
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Diwali' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Diwali')
    expect(screen.getByLabelText('By')).toHaveValue('2027-10')
    // No amount yet, so no goal to save.
    expect(screen.getByRole('button', { name: 'Add category' })).toBeDisabled()
    await user.type(screen.getByLabelText('Amount'), '30000')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    // Lands in a Goals group, made for it.
    expect(addGroup).toHaveBeenCalledWith({ name: 'Goals' })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Diwali', group: 'Goals', goal: { amount: 30000, by: '2027-10', repeat: 'yearly' } }))
    vi.useRealTimers()
  })

  it('keeps a goal in a group you tap', async () => {
    addGroup.mockClear()
    const user = userEvent.setup()
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} initialGroup="Needs" />)
    await user.click(screen.getByRole('button', { name: 'Emergency fund' }))
    expect(screen.getByRole('button', { name: /Goals/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /Needs/ }))
    await user.type(screen.getByLabelText('Amount'), '90000')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(addGroup).not.toHaveBeenCalled()
    expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Emergency fund', group: 'Needs', goal: { amount: 90000 } }))
  })

  it('shows the read-only notice instead of the form in a read-only budget', () => {
    spaces.readOnly = true
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('This budget is read-only')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})

describe('goalOf', () => {
  it('refuses a deadline already behind us, so a new goal never starts out Done', async () => {
    const { goalOf } = await import('./GoalSheet')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27))
    try {
      expect(goalOf({ amount: '10000', by: '2026-05', yearly: false })).toBeNull()
      expect(goalOf({ amount: '10000', by: '2026-10', yearly: true })).toEqual({ amount: 10000, by: '2026-10', repeat: 'yearly' })
      expect(goalOf({ amount: '10000', by: '', yearly: false })).toEqual({ amount: 10000 })
      // A yearly goal's stored month never moves; it rolls on when shown. Editing one a year on still saves.
      expect(goalOf({ amount: '10000', by: '2025-10', yearly: true })).toEqual({ amount: 10000, by: '2025-10', repeat: 'yearly' })
    } finally {
      vi.useRealTimers()
    }
  })
})
