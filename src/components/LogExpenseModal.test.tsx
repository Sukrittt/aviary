import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogExpenseModal } from './LogExpenseModal'
import { suggestCategoryLLM } from '../lib/autoCategory'

const { addExpenseMutation, deleteExpenseMutation, history } = vi.hoisted(() => ({
  addExpenseMutation: vi.fn(),
  deleteExpenseMutation: vi.fn(),
  history: { rows: [] as unknown[] },
}))
vi.mock('../hooks/useExpenses', () => ({
  useAddExpense: () => ({ mutateAsync: addExpenseMutation }),
  useDeleteExpense: () => ({ mutateAsync: deleteExpenseMutation, isPending: false }),
  useRecentExpenses: () => ({ data: history.rows }),
}))
vi.mock('../api/categoryMap', () => ({ getCategoryMap: vi.fn(async () => ({ words: {}, updatedAt: '' })) }))
vi.mock('../lib/autoCategory', () => ({ suggestCategoryLLM: vi.fn() }))
vi.mock('../hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Groceries' }, { name: 'Rent' }, { name: 'Eating out' }] }),
}))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹', formatMoney: (n: number) => `₹${n}` }) }))
vi.mock('./CategoryPicker', () => ({
  CategoryPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <>
      <output aria-label="Category">{value}</output>
      <button type="button" onClick={() => onChange(history.rows.length ? '🛒 Groceries' : 'Groceries')}>Choose Groceries</button>
      <button type="button" onClick={() => onChange('Eating out')}>Choose Eating out</button>
    </>
  ),
}))
vi.mock('./DatePicker', () => ({ DatePicker: () => null }))
// The animated receipt itself is chrome here; this file tests the dialog's hand-off to it.
vi.mock('../features/log-expense/ExpenseAdded', () => ({
  PreloadExpenseAddedTick: () => null,
  ExpenseAdded: ({ expense, onUndo, onDone }: { expense: { amount: number; item: string }; onUndo: () => void; onDone: () => void }) => (
    <div>
      <p>Added ₹{expense.amount} · {expense.item}</p>
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" onClick={onDone}>Done</button>
    </div>
  ),
}))

const llm = vi.mocked(suggestCategoryLLM)
const type = (value: string) => fireEvent.change(screen.getByLabelText('What was it for?'), { target: { value } })
const category = () => screen.getByLabelText('Category').textContent

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  llm.mockReset().mockResolvedValue('')
  addExpenseMutation.mockReset()
  deleteExpenseMutation.mockReset()
  history.rows = []
})

it('blocks a save with empty fields and names them in a toast', async () => {
  render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
  type('Milk')
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

  expect((await screen.findByRole('alert')).textContent).toBe('Add an amount and category')
  expect(screen.getByLabelText('Amount').closest('.erd-amount-field')).toHaveClass('is-missing')
  expect(screen.getByLabelText('What was it for?')).not.toHaveClass('is-missing')
  expect(addExpenseMutation).not.toHaveBeenCalled()
})

it('swaps the form for the added receipt, and Undo hands the form back filled in', async () => {
  addExpenseMutation.mockResolvedValue({ id: 'expense-1', timestamp: '2026-09-24T10:00:00Z', version: 0, pending: false })
  deleteExpenseMutation.mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<LogExpenseModal onClose={onClose} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '450' } })
  type('Milk')
  fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

  expect(await screen.findByText('Added ₹450 · Milk')).toBeInTheDocument()
  expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(deleteExpenseMutation).toHaveBeenCalledWith(expect.objectContaining({
    id: 'expense-1',
    // The server rejects a delete without the row's version (428).
    version: 0,
    timestamp: '2026-09-24T10:00:00Z',
    amountInr: 450,
  })))
  expect(await screen.findByLabelText('Amount')).toHaveValue('450')
  expect(screen.getByLabelText('What was it for?')).toHaveValue('Milk')
  expect(onClose).not.toHaveBeenCalled()
})

it('closes from Done on the added receipt', async () => {
  addExpenseMutation.mockResolvedValue({ id: 'expense-1', timestamp: 't', pending: false })
  const onClose = vi.fn()
  render(<LogExpenseModal onClose={onClose} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '450' } })
  type('Milk')
  fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  expect(onClose).toHaveBeenCalledOnce()
})

it('saves through the expense mutation so Activity is invalidated immediately', async () => {
  addExpenseMutation.mockResolvedValue({ id: 'expense-1', pending: false })
  const onSaved = vi.fn()
  render(<LogExpenseModal onClose={vi.fn()} onSaved={onSaved} />)

  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '450' } })
  type('Milk')
  fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

  await waitFor(() => expect(addExpenseMutation).toHaveBeenCalledWith(expect.objectContaining({
    source: 'manual',
    item: 'Milk',
    amount_inr: '450',
    category: 'Groceries',
  })))
  expect(onSaved).toHaveBeenCalledOnce()
})

describe('LogExpenseModal category suggestion', () => {
  it('predicts again after editing a name with a manually selected category', async () => {
    const reply = deferred<string>()
    llm.mockReturnValueOnce(reply.promise)
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose Eating out' }))
    expect(category()).toBe('Eating out')

    type('house rent')
    expect(category()).toBe('')
    await waitFor(() => expect(llm).toHaveBeenCalledWith('house rent', ['Groceries', 'Rent', 'Eating out']))
    reply.resolve('Rent')
    await waitFor(() => expect(category()).toBe('Rent'))
  })

  it('clears an earlier auto-pick while predicting a different transaction name', async () => {
    const reply = deferred<string>()
    llm.mockResolvedValueOnce('Eating out').mockReturnValueOnce(reply.promise)
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('cafe breakfast')
    await waitFor(() => expect(category()).toBe('Eating out'))

    type('apartment lease renewal')
    expect(category()).toBe('')
    await waitFor(() => expect(llm).toHaveBeenCalledTimes(2))
    reply.resolve('Rent')
    await waitFor(() => expect(category()).toBe('Rent'))
  })

  it('keeps a manual choice made during prediction until the name changes again', async () => {
    const reply = deferred<string>()
    llm.mockReturnValueOnce(reply.promise)
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('dinner with friends')
    await waitFor(() => expect(llm).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
    reply.resolve('Eating out')
    await new Promise((r) => setTimeout(r, 50))
    expect(category()).toBe('Groceries')
  })

  it('leaves the category empty when nothing fits, instead of defaulting to the first one', async () => {
    llm.mockResolvedValue('')
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('Travel')
    await waitFor(() => expect(llm).toHaveBeenCalled())
    expect(category()).toBe('')
  })

  it('ignores a slow reply for text the user has since changed', async () => {
    const old = deferred<string>()
    llm.mockReturnValueOnce(old.promise).mockResolvedValueOnce('Rent')
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('lease')
    await waitFor(() => expect(llm).toHaveBeenCalledTimes(1))
    type('lease rent')
    await waitFor(() => expect(category()).toBe('Rent'))
    old.resolve('Groceries')
    await new Promise((r) => setTimeout(r, 50))
    expect(category()).toBe('Rent')
  })

  it('does not ask for one or two letters', async () => {
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('Tr')
    await new Promise((r) => setTimeout(r, 400))
    expect(llm).not.toHaveBeenCalled()
  })

  it('asks again after a failed request instead of remembering it', async () => {
    llm.mockResolvedValueOnce(null).mockResolvedValueOnce('Rent')
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('flat rent')
    await waitFor(() => expect(llm).toHaveBeenCalledTimes(1))
    type('flat')
    type('flat rent')
    await waitFor(() => expect(category()).toBe('Rent'))
  })

  it('shows it is picking while the model answers, then says it picked for you', async () => {
    const reply = deferred<string>()
    llm.mockReturnValueOnce(reply.promise)
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('weekly shop')
    await waitFor(() => expect(screen.getByText('Picking…')).toBeTruthy())
    reply.resolve('Groceries')
    await waitFor(() => expect(category()).toBe('Groceries'))
    await waitFor(() => expect(screen.getByText('Picked for you')).toBeTruthy(), { timeout: 2000 })
    const field = screen.getByLabelText('What was it for?').parentElement!
    await waitFor(() => expect(field.querySelector('.auto-pick-burst')).toBeTruthy())
    const autoBurst = field.querySelector('.auto-pick-burst')
    expect(autoBurst).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
    await waitFor(() => expect(screen.queryByText('Picked for you')).toBeNull())
    await waitFor(() => expect(field.querySelector('.auto-pick-burst')).toBeTruthy())
    const manualBurst = field.querySelector('.auto-pick-burst')
    expect(manualBurst).not.toBe(autoBurst)
    fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
    await waitFor(() => expect(field.querySelector('.auto-pick-burst')).toBeTruthy())
    expect(field.querySelector('.auto-pick-burst')).not.toBe(manualBurst)
  })

  it('does not call the Miscellaneous fallback a pick', async () => {
    llm.mockResolvedValue('')
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    // Fresh text: answers are cached per text for the page's lifetime.
    type('bus pass')
    await waitFor(() => expect(llm).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 700))
    expect(screen.queryByText('Picking…')).toBeNull()
    expect(screen.queryByText('Picked for you')).toBeNull()
  })

  it('reuses an earlier answer for the same text without another request', async () => {
    llm.mockResolvedValue('Eating out')
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    type('momo stall')
    await waitFor(() => expect(category()).toBe('Eating out'))
    type('momo')
    type('momo stall')
    expect(category()).toBe('Eating out')
    await new Promise((r) => setTimeout(r, 400))
    expect(llm).toHaveBeenCalledTimes(1)
  })
})

describe('LogExpenseModal typo guard', () => {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // Eight Groceries runs of 40..75: 450 is ~8x the median and beats them all.
  const seed = () => {
    history.rows = [40, 45, 50, 55, 60, 65, 70, 75].map((a) => ({ date: today, amount_inr: String(a), category: '🛒 Groceries' }))
  }
  const fill = (amount: string) => {
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: amount } })
    type('Milk')
    fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
  }

  it('warns once with the clean category name, then saves from the relabelled button', async () => {
    addExpenseMutation.mockResolvedValue({ id: 'expense-1', pending: false })
    seed()
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    fill('450')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    expect((await screen.findByRole('alert')).textContent).toBe('₹450 is 8× your usual Groceries (₹58). Save again to keep it.')
    expect(addExpenseMutation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save ₹450 anyway' }))
    await waitFor(() => expect(addExpenseMutation).toHaveBeenCalledOnce())
  })

  it('drops the warning once the amount is fixed', async () => {
    seed()
    render(<LogExpenseModal onClose={vi.fn()} onSaved={vi.fn()} />)
    fill('450')
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '45' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
