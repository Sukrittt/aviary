import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ImportReview } from '@/src/api/imports'

const previewImport = vi.fn()
const recomputeImport = vi.fn()
const commitImport = vi.fn()
vi.mock('@/src/api/imports', async (original) => ({
  ...(await original<typeof import('@/src/api/imports')>()),
  previewImport: (...a: unknown[]) => previewImport(...a),
  recomputeImport: (...a: unknown[]) => recomputeImport(...a),
  commitImport: (...a: unknown[]) => commitImport(...a),
}))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

const { ImportFlow } = await import('./ImportFlow')
const { ImportFailure } = await import('@/src/api/imports')

const review: ImportReview = {
  importId: 'imp1',
  app: 'monefy',
  filename: 'monefy.csv',
  direction: 'negative_spend',
  directionSource: 'sign',
  currency: 'EUR',
  hasCurrency: true,
  counts: { expense: 7, income: 2, from: '2026-09-01', to: '2026-10-05' },
  skipped: { transfer: 2, opening_balance: 1, other_currency: 1 },
  otherCurrencies: ['USD'],
  droppedOverCap: 0,
  samples: [
    { date: '2026-10-05', item: 'Split dinner part 2', amount: 20, kind: 'expense' },
    { date: '2026-10-01', item: 'Payroll', amount: 3000, kind: 'income' },
  ],
  groups: ['Essentials', 'Lifestyle', 'Savings'],
  categories: [
    { source: 'Bills', name: 'Bills', group: 'Essentials', monthly: 80 },
    { source: 'Gifts', name: 'Gifts', group: 'Lifestyle', monthly: 60 },
  ],
  accounts: [{ source: 'Bank', name: 'Bank', type: 'bank' }],
  droppedAccounts: [],
  salary: { label: 'Payroll', amount: 3000, day: 1 },
  budgetTotal: 140,
}

const file = (bytes = 10) => new File([new Uint8Array(bytes)], 'monefy.csv', { type: 'text/csv' })

function toReview() {
  const onDone = vi.fn()
  render(<ImportFlow onFresh={vi.fn()} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Bring it all over' }))
  fireEvent.click(screen.getByRole('button', { name: /Monefy/ }))
  fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file()] } })
  return onDone
}

beforeEach(() => {
  vi.clearAllMocks()
  previewImport.mockResolvedValue(review)
  recomputeImport.mockResolvedValue({ ...review, direction: 'positive_spend' })
  commitImport.mockResolvedValue({ importId: 'imp1', total: 9, groupCount: 2, categoryCount: 2, income: 3000 })
})

const openDetails = async () => fireEvent.click(await screen.findByRole('button', { name: 'Check names and groups' }))

describe('ImportFlow', () => {
  it('starting fresh hands straight back to the usual setup', () => {
    const onFresh = vi.fn()
    render(<ImportFlow onFresh={onFresh} onDone={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Switching apps?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'No, start fresh' }))
    expect(onFresh).toHaveBeenCalled()
  })

  it('shows how to export from the picked app, then what it read', async () => {
    toReview()
    expect(await screen.findByRole('heading', { name: 'Here’s what we found' })).toBeTruthy()
    expect(screen.getByText('7 spends · 2 paydays · Sep 2026 to Oct 2026')).toBeTruthy()
    expect(screen.getByText('We left out 2 transfers between your accounts and 1 opening balance. They aren’t spending.')).toBeTruthy()
    expect(screen.getByText('We’re reading negative amounts as spends.')).toBeTruthy()
    expect(screen.getByText('Payroll')).toBeTruthy()
    // Names and the payday wait behind the toggle.
    expect(screen.queryByLabelText('Name for Bills')).toBeNull()
    await openDetails()
    expect(screen.getByText('We think your salary is €3,000 on about the 1st.')).toBeTruthy()
  })

  it("a flip asks the server to recompute, so what's approved is what's written", async () => {
    toReview()
    fireEvent.click(await screen.findByRole('button', { name: 'That’s backwards' }))
    await waitFor(() => expect(recomputeImport).toHaveBeenCalledWith('imp1', { direction: 'positive_spend' }))
    expect(await screen.findByText('We’re reading positive amounts as spends.')).toBeTruthy()
  })

  it('commits the edits with the check animation, then hands over', async () => {
    const onDone = toReview()
    await openDetails()
    fireEvent.change(screen.getByLabelText('Name for Bills'), { target: { value: 'Utilities' } })
    fireEvent.change(screen.getByLabelText('Group for Gifts'), { target: { value: 'Savings' } })
    fireEvent.click(screen.getByRole('button', { name: 'Looks right, set me up' }))
    await waitFor(() => expect(commitImport).toHaveBeenCalled())
    expect(commitImport.mock.calls[0]).toEqual(['imp1', {
      currency: 'EUR',
      direction: 'negative_spend',
      groups: ['Essentials', 'Lifestyle', 'Savings'],
      categories: [{ source: 'Bills', name: 'Utilities', group: 'Essentials' }, { source: 'Gifts', name: 'Gifts', group: 'Savings' }],
      accounts: [{ source: 'Bank', name: 'Bank', type: 'bank' }],
      salary: { amount: 3000, day: 1 },
    }])
    expect(await screen.findByRole('img', { name: 'You’re set up' })).toBeTruthy()
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ result: expect.objectContaining({ total: 9 }), currency: 'EUR' }), { timeout: 2000 })
  })

  it('a flip that finds a salary fills it in', async () => {
    previewImport.mockResolvedValue({ ...review, salary: null })
    recomputeImport.mockResolvedValue({ ...review, direction: 'positive_spend', salary: { label: 'Payroll', amount: 3100, day: 2 } })
    toReview()
    await openDetails()
    expect(screen.getByLabelText('Monthly income')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'That’s backwards' }))
    await waitFor(() => expect(screen.getByLabelText('Monthly income')).toHaveValue(3100))
    expect(screen.getByLabelText('Payday, day of the month')).toHaveValue(2)
  })

  it('stops at more bank accounts than the app holds, rather than dropping one quietly', async () => {
    const accounts: ImportReview['accounts'] = [...Array.from({ length: 5 }, (_, i) => ({ source: `B${i}`, name: `B${i}`, type: 'bank' as const })), { source: 'Cash', name: 'Cash', type: 'cash' }]
    previewImport.mockResolvedValue({ ...review, accounts })
    toReview()
    await openDetails()
    fireEvent.change(screen.getByLabelText('Type for Cash'), { target: { value: 'bank' } })
    expect(screen.getByRole('alert')).toHaveTextContent('You can have up to 5 bank accounts. Make one of these cash or a credit card.')
    expect(screen.getByRole('button', { name: 'Looks right, set me up' })).toBeDisabled()
  })

  it('a cleared salary commits without one', async () => {
    toReview()
    await openDetails()
    fireEvent.change(screen.getByLabelText('Monthly income'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Looks right, set me up' }))
    await waitFor(() => expect(commitImport.mock.calls[0][1]).toMatchObject({ salary: null }))
  })

  it('turns failure codes into its own copy, never the server’s', async () => {
    previewImport.mockRejectedValue(new ImportFailure('no_columns'))
    toReview()
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t find a date and an amount column. Check the file is the transactions export, not a report.')
  })

  it('stops a file over 4 MB before uploading it', async () => {
    render(<ImportFlow onFresh={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bring it all over' }))
    fireEvent.click(screen.getByRole('button', { name: /YNAB/ }))
    fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file(4 * 1024 * 1024 + 1)] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('That file’s too big. Export a shorter date range and try again.')
    expect(previewImport).not.toHaveBeenCalled()
  })
})
