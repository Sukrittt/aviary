import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { suggestCategoryLLM } from '../lib/autoCategory'
import { RecurringExpenseModal } from './RecurringExpenseModal'

const { mutation } = vi.hoisted(() => ({
  mutation: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock('../lib/autoCategory', () => ({ suggestCategoryLLM: vi.fn() }))
vi.mock('../hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Groceries' }, { name: 'Rent' }, { name: 'Eating out' }] }),
}))
vi.mock('../hooks/useRecurringExpenses', () => ({
  useRecurringExpenses: () => ({ data: [] }),
  useAddRecurringExpense: () => mutation,
  useUpdateRecurringExpense: () => mutation,
  usePauseRecurringExpense: () => mutation,
  useResumeRecurringExpense: () => mutation,
  useDeleteRecurringExpense: () => mutation,
}))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ currencySymbol: '₹' }) }))
vi.mock('./CategoryPicker', () => ({
  CategoryPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <>
      <output aria-label="Category">{value}</output>
      <button type="button" onClick={() => onChange('Groceries')}>Choose Groceries</button>
    </>
  ),
}))
vi.mock('./DatePicker', () => ({ DatePicker: () => null }))
vi.mock('../hooks/useSpaces', () => ({
  useSpaces: () => ({
    active: { id: 's1', name: 'Home', role: 'member', ownerId: 'u1', members: [{ userId: 'u1', name: 'Priya Shah' }, { userId: 'u2', name: 'Rahul' }] },
  }),
}))

const suggest = vi.mocked(suggestCategoryLLM)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  suggest.mockReset().mockResolvedValue('')
  mutation.mutateAsync.mockReset()
})

it('passes the What is it label to the shared category picker and auto-selects its result', async () => {
  suggest.mockResolvedValue('Rent')
  render(<RecurringExpenseModal onClose={vi.fn()} />)

  fireEvent.change(screen.getByLabelText('What is it'), { target: { value: 'flat rent' } })

  await waitFor(() => expect(suggest).toHaveBeenCalledWith('flat rent', ['Groceries', 'Rent', 'Eating out']))
  await waitFor(() => expect(screen.getByLabelText('Category')).toHaveTextContent('Rent'))
})

it('does not overwrite a category the user selects while a suggestion is pending', async () => {
  const pending = deferred<string | null>()
  suggest.mockReturnValue(pending.promise)
  render(<RecurringExpenseModal onClose={vi.fn()} />)

  fireEvent.change(screen.getByLabelText('What is it'), { target: { value: 'weekly shop' } })
  await waitFor(() => expect(suggest).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Choose Groceries' }))
  pending.resolve('Rent')

  await waitFor(() => expect(screen.getByLabelText('Category')).toHaveTextContent('Groceries'))
})

it('keeps a prefilled category instead of requesting a replacement', async () => {
  render(
    <RecurringExpenseModal
      initialValues={{
        item: 'Apartment',
        amount_inr: '25000',
        category: 'Rent',
        frequency: 'monthly',
        start_date: '2026-09-23',
        end_date: '',
        notes: '',
        payment_method: 'bank',
      }}
      onClose={vi.fn()}
    />,
  )

  await new Promise((resolve) => setTimeout(resolve, 250))
  expect(suggest).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Category')).toHaveTextContent('Rent')
})

it("a member in a lapsed budget hears it's read-only, not to check their connection", async () => {
  mutation.mutateAsync.mockRejectedValue(Object.assign(new Error('402'), { status: 402 }))
  render(
    <RecurringExpenseModal
      initialValues={{ item: 'Netflix', amount_inr: '649', category: 'Rent', frequency: 'monthly', start_date: '2026-09-23', end_date: '', notes: '', payment_method: 'bank' }}
      onClose={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add recurring expense' }))
  expect(await screen.findByText("This budget is read-only until Priya renews. Your data's safe, and export's always free.")).toBeTruthy()
})
