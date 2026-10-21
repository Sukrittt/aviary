import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutateAsync = vi.fn()
const refresh = vi.fn()
const readStatement = vi.fn()
const spaces = vi.hoisted(() => ({ readOnly: false }))
vi.mock('@/src/hooks/useSpaces', () => ({ useSpaces: () => ({ readOnly: spaces.readOnly, active: undefined }) }))
vi.mock('@/src/hooks/useExpenses', () => ({ useAddExpense: () => ({ mutateAsync, refresh }) }))
vi.mock('@/src/hooks/useCategories', () => ({
  useCategories: () => ({ data: [{ name: 'Food' }, { name: 'Travel' }] }),
  useCategoryStyle: () => () => ({ background: 'gold', color: 'black' }),
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
  spaces.readOnly = false
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
    await userEvent.click(screen.getByLabelText('Pick a category for Chai'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Food' }))
    fireEvent.click(screen.getByText('Log 2 · ₹369'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    // Oldest day first: Chai (12 Oct) goes before Swiggy.
    expect(mutateAsync.mock.calls.map((c) => c[0].client_id)).toEqual(['statement:c', 'statement:a'])
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ source: 'statement', category: 'Food', date: '2026-10-12' })
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
    await userEvent.click(screen.getByLabelText('Pick a category for Chai'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Food' }))
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

  it("doesn't count a row the server already had as added", async () => {
    await upload()
    fireEvent.click(screen.getByLabelText('Add Rapido, ₹120'))
    mutateAsync.mockResolvedValueOnce({}).mockResolvedValueOnce({ duplicate: true })
    fireEvent.click(screen.getByText('Log 2 · ₹469'))
    expect(await screen.findByText("You're caught up.", {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('1 payment added')).toBeTruthy()
  })

  it('says so when everything ticked was already there', async () => {
    await upload()
    mutateAsync.mockResolvedValueOnce({ duplicate: true })
    fireEvent.click(screen.getByText('Log 1 · ₹349'))
    expect(await screen.findByText('Those were already in your budget, so nothing doubled up.', {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByText(/added/)).toBeNull()
  })

  it("logs a few days at a time, a day's rows in order, counts each as it finishes, and refetches once", async () => {
    // Rows 0 and 1 share a day; 2 to 5 each have their own.
    const date = (i: number) => (i < 2 ? '2026-10-15' : `2026-10-1${4 + i}`)
    readStatement.mockResolvedValue({
      ...proposal,
      items: Array.from({ length: 6 }, (_, i) => ({ id: `statement:${i}`, item: `Shop ${i}`, amount: 10, date: date(i), category: 'Food', suggestSkip: null })),
    })
    const pending: Array<() => void> = []
    let inFlight = 0
    let most = 0
    mutateAsync.mockImplementation(() => new Promise((resolve) => {
      most = Math.max(most, ++inFlight)
      pending.push(() => { inFlight--; resolve({}) })
    }))
    await upload()
    fireEvent.click(screen.getByText('Log 6 · ₹60'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(4))
    expect(screen.getByText('Logging 0 of 6…')).toBeTruthy()
    // Row 1 waits for row 0, its own day's earlier row; the other days go meanwhile.
    expect(mutateAsync.mock.calls.map((c) => c[0].client_id)).toEqual(['statement:0', 'statement:2', 'statement:3', 'statement:4'])
    pending.splice(0, 2).forEach((done) => done())
    expect(await screen.findByText('Logging 2 of 6…')).toBeTruthy()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(6))
    expect(refresh).not.toHaveBeenCalled()
    pending.splice(0).forEach((done) => done())
    expect(await screen.findByText("You're caught up.", {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('6 payments added')).toBeTruthy()
    expect(most).toBe(4)
    expect(mutateAsync.mock.calls.map((c) => c[0].client_id).slice(4).sort()).toEqual(['statement:1', 'statement:5'])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('asks for a locked pdf\'s password in place, and keeps the file through a wrong guess', async () => {
    const { StatementFailure } = await import('@/src/api/statement')
    readStatement
      .mockRejectedValueOnce(new StatementFailure('locked', 'That PDF is locked', 'pdf_locked'))
      .mockRejectedValueOnce(new StatementFailure('wrong', 'Wrong password', 'pdf_password_wrong'))
    render(<StatementModal onClose={() => {}} />)
    const pdf = new File(['%PDF /Encrypt'], 'hdfc.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Statement or screenshots'), { target: { files: [pdf] } })
    expect(await screen.findByText('hdfc.pdf has a password')).toBeTruthy()
    expect(screen.getByText('Used once to open the file. Never saved.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    await userEvent.type(screen.getByLabelText('Password'), 'nope')
    // Both clicks land before the reading screen renders; only one upload goes.
    const open = screen.getByText('Open it')
    act(() => {
      fireEvent.click(open)
      fireEvent.click(open)
    })
    expect(await screen.findByText("That didn't open it, try again.")).toBeTruthy()
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')

    await userEvent.type(screen.getByLabelText('Password'), '01011990')
    fireEvent.click(screen.getByText('Open it'))
    await screen.findByText('Check these, then log')
    expect(readStatement.mock.calls.map((c) => c[0])).toEqual([{ file: pdf }, { file: pdf, password: 'nope' }, { file: pdf, password: '01011990' }])
  })

  it('stays on the password when a retry hits the rate limit, so the file is kept', async () => {
    const { StatementFailure } = await import('@/src/api/statement')
    readStatement
      .mockRejectedValueOnce(new StatementFailure('locked', 'That PDF is locked', 'pdf_locked'))
      .mockRejectedValueOnce(new StatementFailure('Give it a minute.', 'One moment', 'rate_limited'))
    render(<StatementModal onClose={() => {}} />)
    const pdf = new File(['%PDF /Encrypt'], 'hdfc.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Statement or screenshots'), { target: { files: [pdf] } })
    await userEvent.type(await screen.findByLabelText('Password'), '01011990')
    fireEvent.click(screen.getByText('Open it'))
    expect(await screen.findByText('Give it a minute.')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Password'), '01011990')
    fireEvent.click(screen.getByText('Open it'))
    await screen.findByText('Check these, then log')
    expect(readStatement).toHaveBeenLastCalledWith({ file: pdf, password: '01011990' })
  })

  it('turns away a sixth screenshot before uploading', async () => {
    render(<StatementModal onClose={() => {}} />)
    const shots = Array.from({ length: 6 }, (_, i) => new File(['x'], `s${i}.png`, { type: 'image/png' }))
    fireEvent.change(screen.getByLabelText('Statement or screenshots'), { target: { files: shots } })
    expect(await screen.findByText(/Up to 5 screenshots at a time/)).toBeTruthy()
    expect(readStatement).not.toHaveBeenCalled()
  })

  it('shows the read-only notice instead of the picker in a read-only budget', () => {
    spaces.readOnly = true
    render(<StatementModal onClose={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('This budget is read-only')
    expect(screen.queryByLabelText('Statement or screenshots')).toBeNull()
  })
})
