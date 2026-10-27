import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const spaces = vi.hoisted(() => ({ readOnly: false }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: spaces.readOnly, active: undefined }) }))
const add = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../hooks/useCategories', () => ({ useAddCategory: () => ({ mutateAsync: add }), useUpdateCategory: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹' }) }))
vi.mock('../hooks/useGroups', () => ({ useGroups: () => ({ data: ['Needs'] }), useGroupIcons: () => new Map() }))

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
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Diwali', goal: { amount: 30000, by: '2027-10', repeat: 'yearly' } }))
    vi.useRealTimers()
  })

  it('shows the read-only notice instead of the form in a read-only budget', () => {
    spaces.readOnly = true
    render(<AddCategoryModal onClose={() => {}} onCreated={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('This budget is read-only')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})
