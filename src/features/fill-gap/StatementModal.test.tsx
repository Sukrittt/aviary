import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mutateAsync = vi.fn()
const readStatement = vi.fn()
vi.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync }) }))
vi.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Food' }, { name: 'Travel' }] }),
  useCategoryStyle: () => () => ({ background: 'gold', color: 'black' }),
}))
vi.mock('@/src/components/CategoryPicker', () => ({
  CategoryPicker: ({ onChange }: { onChange: (c: string) => void }) => (
    <button type="button" onClick={() => onChange('Food')}>
      Food chip
    </button>
  ),
}))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatMoney: (n: number) => `₹${n}` }) }))
vi.mock('@/src/api/statement', async (orig) => ({ ...(await orig<object>()), readStatement: (...a: unknown[]) => readStatement(...a) }))

const { StatementModal } = await import('./StatementModal')

const proposal = {
  id: 'p1',
  credits: 2,
  dropped: 0,
  items: [
    { id: 'statement:a', item: 'Swiggy', amount: 349, date: '2026-10-17', category: 'Food', suggestSkip: null },
    { id: 'statement:b', item: 'Rapido', amount: 120, date: '2026-10-17', category: 'Travel', suggestSkip: 'logged' },
    { id: 'statement:c', item: 'Chai', amount: 20, date: '2026-10-12', category: '', suggestSkip: 'before_last' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  readStatement.mockResolvedValue(proposal)
  mutateAsync.mockResolvedValue({})
})

async function upload() {
  render(<StatementModal onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('Statement or screenshots'), { target: { files: [new File(['Date,Amount'], 'hdfc.csv', { type: 'text/csv' })] } })
  await screen.findByText('Check these, then log')
}

describe('StatementModal', () => {
  it('sends a csv as a file and leaves likely-logged and older rows unticked', async () => {
    await upload()
    expect(readStatement).toHaveBeenCalledWith({ file: expect.any(File) })
    expect(screen.getByLabelText('Add Swiggy, ₹349').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('Add Rapido, ₹120').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByLabelText('Add Chai, ₹20').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('3 payments · 12 to 17 Oct')).toBeTruthy()
    expect(screen.getByText(/Looks logged already/)).toBeTruthy()
    expect(screen.getByText(/Before your last log/)).toBeTruthy()
    expect(screen.getByText('2 credits skipped. Log refunds as income if you want them counted.')).toBeTruthy()
  })

  it('logs only the ticked rows, each under its hashed client_id', async () => {
    await upload()
    fireEvent.click(screen.getByLabelText('Add Chai, ₹20'))
    expect(screen.getByText('Pick a category for the ticked rows to log them.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Pick a category for Chai'))
    fireEvent.click(screen.getByText('Food chip'))
    fireEvent.click(screen.getByText('Log 2 · ₹369'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls.map((c) => c[0].client_id)).toEqual(['statement:a', 'statement:c'])
    expect(mutateAsync.mock.calls[1][0]).toMatchObject({ source: 'statement', category: 'Food', date: '2026-10-12' })
  })

  it('ticks every row at once, and unticks them again', async () => {
    await upload()
    fireEvent.click(screen.getByText('Tick all'))
    expect(screen.getByLabelText('Add Rapido, ₹120').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Pick a category for the ticked rows to log them.')).toBeTruthy()
    fireEvent.click(screen.getByText('Untick all'))
    expect(screen.getByText('Tick what to add')).toBeTruthy()
  })

  it('picking a category ticks the row it belongs to', async () => {
    await upload()
    fireEvent.click(screen.getByLabelText('Pick a category for Chai'))
    fireEvent.click(screen.getByText('Food chip'))
    expect(screen.getByLabelText('Add Chai, ₹20').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Log 2 · ₹369')).toBeTruthy()
  })

  it("ends on what got filled in: the days, the total and where it went", async () => {
    const onClose = vi.fn()
    render(<StatementModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Statement or screenshots'), { target: { files: [new File(['Date,Amount'], 'hdfc.csv', { type: 'text/csv' })] } })
    await screen.findByText('Check these, then log')
    fireEvent.click(screen.getByLabelText('Add Rapido, ₹120'))
    fireEvent.click(screen.getByText('Log 2 · ₹469'))
    expect(await screen.findByText("You're caught up.", {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText(/17 Oct is filled in/)).toBeTruthy()
    expect(screen.getByText('2 payments added')).toBeTruthy()
    expect(screen.getByText('₹469')).toBeTruthy()
    expect(screen.getByText('₹349')).toBeTruthy()
    expect(screen.getByText('₹120')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })

  it('counts a row an earlier failed try already saved, even once it is unticked', async () => {
    await upload()
    fireEvent.click(screen.getByLabelText('Add Rapido, ₹120'))
    mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('503'))
    fireEvent.click(screen.getByText('Log 2 · ₹469'))
    expect(await screen.findByText("Couldn't log 1. Check your connection and try again.")).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Add Swiggy, ₹349'))
    fireEvent.click(screen.getByText('Log 1 · ₹120'))
    expect(await screen.findByText("You're caught up.", {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('2 payments added')).toBeTruthy()
    expect(screen.getByText('₹469')).toBeTruthy()
    expect(mutateAsync.mock.calls[2][0].client_id).toBe('statement:b')
  })

  it('turns away a sixth screenshot before uploading', async () => {
    render(<StatementModal onClose={() => {}} />)
    const shots = Array.from({ length: 6 }, (_, i) => new File(['x'], `s${i}.png`, { type: 'image/png' }))
    fireEvent.change(screen.getByLabelText('Statement or screenshots'), { target: { files: shots } })
    expect(await screen.findByText(/Up to 5 screenshots at a time/)).toBeTruthy()
    expect(readStatement).not.toHaveBeenCalled()
  })
})
