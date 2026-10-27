import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteSheet } from './NoteSheet'

const state = vi.hoisted(() => ({ readOnly: false, update: vi.fn(async (_: unknown) => undefined) }))
vi.mock('../hooks/useCategories', () => ({ useUpdateCategory: () => ({ mutateAsync: state.update }) }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: state.readOnly }) }))
vi.mock('@/src/context/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (n: number) => `₹${n}`, formatCompact: (n: number) => `₹${n / 1000}k` }),
}))

beforeEach(() => {
  state.readOnly = false
  state.update.mockClear()
})

describe('NoteSheet', () => {
  it('opens an empty note as a focused text box with a placeholder for its group', () => {
    render(<NoteSheet row={{ name: 'Electricity', group: 'Bills' }} onClose={vi.fn()} />)
    const box = screen.getByLabelText('Note')
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute('placeholder', 'Due date, account no., autopay?')
    expect(screen.getByText(/Only people in this budget can see it\./)).toBeInTheDocument()
  })

  it('saves a note and closes after the success beat', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Rent', group: '' }} onClose={onClose} />)
    await user.type(screen.getByLabelText('Note'), 'due on the 5th')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(state.update).toHaveBeenCalledWith({ name: 'Rent', updates: { note: 'due on the 5th' } })
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('clears a note saved empty', async () => {
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Rent', group: '', note: 'old' }} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Edit note' }))
    await user.clear(screen.getByLabelText('Note'))
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(state.update).toHaveBeenCalledWith({ name: 'Rent', updates: { note: null } })
  })

  it('ticks a checklist line and saves it', async () => {
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Diwali', group: '', note: '- buy gifts\n[x] book train' }} onClose={vi.fn()} />)
    const [gifts, train] = screen.getAllByRole('checkbox')
    expect(gifts).not.toBeChecked()
    expect(train).toBeChecked()
    await user.click(gifts)
    expect(state.update).toHaveBeenCalledWith({ name: 'Diwali', updates: { note: '[x] buy gifts\n[x] book train' } })
    expect(gifts).toBeChecked()
  })

  it('renders markup as text and links URLs safely', () => {
    render(<NoteSheet row={{ name: 'Rent', group: '', note: '<b>hi</b> https://example.com' }} onClose={vi.fn()} />)
    expect(screen.getByText(/<b>hi<\/b>/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://example.com' })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('adds a goal\'s amounts up against the goal', () => {
    render(<NoteSheet row={{ name: 'Diwali', group: '', goal: { amount: 60000 }, note: 'gifts 20k, sweets 5k, travel 30k' }} onClose={vi.fn()} />)
    expect(screen.getByText('= ₹55000 · ₹5k short of your goal')).toBeInTheDocument()
  })

  it('shows a read-only budget\'s note with no way to edit it', async () => {
    state.readOnly = true
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Rent', group: '', note: '- call landlord' }} onClose={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit note' })).not.toBeInTheDocument()
    await user.click(screen.getByText('call landlord'))
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
  })
})

describe('NoteSheet while writing', () => {
  it('locks the text box while a save is in flight', async () => {
    let finish = () => {}
    state.update.mockImplementationOnce(() => new Promise<undefined>((r) => { finish = () => r(undefined) }))
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Rent', group: '' }} onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('Note'), 'due')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(screen.getByLabelText('Note')).toHaveAttribute('readonly')
    finish()
  })

  it("won't open the editor while a tick is saving", async () => {
    let finish = () => {}
    state.update.mockImplementationOnce(() => new Promise<undefined>((r) => { finish = () => r(undefined) }))
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Rent', group: '', note: '- pay\nlandlord' }} onClose={vi.fn()} />)
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeDisabled()
    await user.click(screen.getByText('landlord'))
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit note' })).toBeEnabled())
  })

  it('closes the editor once the budget turns out read-only', () => {
    const { rerender } = render(<NoteSheet row={{ name: 'Rent', group: '' }} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Note')).toBeInTheDocument()
    state.readOnly = true
    rerender(<NoteSheet row={{ name: 'Rent', group: '' }} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2)
  })
})

describe('NoteSheet add to-do', () => {
  it('writes a to-do line into the box and saves it as text', async () => {
    const user = userEvent.setup()
    render(<NoteSheet row={{ name: 'Diwali', group: '' }} onClose={vi.fn()} />)
    const box = screen.getByLabelText('Note')
    await user.type(box, 'Diwali shopping{Enter}')
    await user.click(screen.getByRole('button', { name: 'Add to-do' }))
    await user.type(box, 'buy diyas')
    await user.click(screen.getByRole('button', { name: 'Add to-do' }))
    await user.type(box, 'book train')
    expect(box).toHaveValue('Diwali shopping\n- buy diyas\n- book train')
    await waitFor(() => expect(box).toHaveFocus())
    expect(screen.getByText(/Start a line with - for a checkbox/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(state.update).toHaveBeenCalledWith({ name: 'Diwali', updates: { note: 'Diwali shopping\n- buy diyas\n- book train' } })
  })
})
