import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

/** The group and account-type pickers are the app's shadcn Select: open it, pick the row. */
async function pick(label: string, option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}
const { ImportFailure } = await import('@/src/api/imports')

const review: ImportReview = {
  importId: 'imp1',
  app: 'monefy',
  filename: 'monefy.csv',
  direction: 'negative_spend',
  directionSource: 'sign',
  currency: 'EUR',
  hasCurrency: true,
  counts: { expense: 7, refund: 0, income: 2, from: '2026-09-01', to: '2026-10-05' },
  skipped: { transfer: 2, opening_balance: 1, other_currency: 1 },
  otherCurrencies: ['USD'],
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
  later: null,
}

const file = (bytes = 10) => new File([new Uint8Array(bytes)], 'monefy.csv', { type: 'text/csv' })

const onAlreadySetUp = vi.fn()

function toReview() {
  const onDone = vi.fn()
  render(<ImportFlow onFresh={vi.fn()} onDone={onDone} onAlreadySetUp={onAlreadySetUp} />)
  fireEvent.click(screen.getByRole('button', { name: 'Switching apps? Bring your data' }))
  fireEvent.click(screen.getByRole('button', { name: /Monefy/ }))
  fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file()] } })
  return onDone
}

beforeEach(() => {
  vi.clearAllMocks()
  // The payday DatePicker reads the viewport; jsdom has no matchMedia.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  previewImport.mockResolvedValue(review)
  recomputeImport.mockResolvedValue({ ...review, direction: 'positive_spend' })
  commitImport.mockResolvedValue({ importId: 'imp1', total: 9, groupCount: 2, categoryCount: 2, income: 3000 })
})

// Each summary row opens its editor in a dialog.
const open = async (row: RegExp) => fireEvent.click(await screen.findByRole('button', { name: row }))
const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }))

describe('ImportFlow', () => {
  it('starting fresh hands straight back to the usual setup', () => {
    const onFresh = vi.fn()
    render(<ImportFlow onFresh={onFresh} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'How do you want to start?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }))
    expect(onFresh).toHaveBeenCalled()
  })

  it('skipAsk starts at the app list, with nothing to go back to', () => {
    render(<ImportFlow skipAsk onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: 'How do you want to start?' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Where are you coming from?' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Step 1 of 3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true)
  })

  it('makes starting fresh the big button, with switching apps a link to the app list', () => {
    const onFresh = vi.fn()
    render(<ImportFlow onFresh={onFresh} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start fresh' }).className).toContain('setup-cta')
    fireEvent.click(screen.getByRole('button', { name: 'Switching apps? Bring your data' }))
    expect(screen.getByRole('heading', { name: 'Where are you coming from?' })).toBeTruthy()
    expect(onFresh).not.toHaveBeenCalled()
  })

  it('walks through the export in numbered steps, with the catch and the app’s own guide', () => {
    render(<ImportFlow onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={onAlreadySetUp} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switching apps? Bring your data' }))
    fireEvent.click(screen.getByRole('button', { name: /Wallet/ }))
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toEqual(['In Wallet on the web, open Records.', 'Click Select all, then Export.', 'Pick Export to CSV and upload the file here.'])
    expect(screen.getByText(/needs Wallet Premium/)).toBeTruthy()
    const guide = screen.getByRole('link', { name: 'Still stuck? See Wallet’s own guide' })
    expect(guide.getAttribute('href')).toMatch(/^https:\/\/support\.budgetbakers\.com\//)
    expect(guide.getAttribute('target')).toBe('_blank')
  })

  it('shows how to export from the picked app, then what it read', async () => {
    toReview()
    expect(await screen.findByRole('heading', { name: 'Here’s what we found' })).toBeTruthy()
    expect(screen.getByText('7 spends · 2 paydays · Sep 2026 to Oct 2026')).toBeTruthy()
    expect(screen.getByText('We left out 2 transfers between your accounts and 1 opening balance. They aren’t spending.')).toBeTruthy()
    expect(screen.getByText('We’re reading negative amounts as spends.')).toBeTruthy()
    expect(screen.getByText('Payroll')).toBeTruthy()
    expect(screen.getByText('5 Oct 2026')).toBeTruthy()
    // Names and the payday wait behind the rows.
    expect(screen.queryByLabelText('Name for Bills')).toBeNull()
    await open(/^Monthly income/)
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
    await open(/^Envelopes/)
    fireEvent.change(screen.getByLabelText('Name for Bills'), { target: { value: 'Utilities' } })
    await pick('Group for Gifts', 'Savings')
    done()
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
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ result: expect.objectContaining({ total: 9 }), currency: 'EUR', app: 'Monefy' }), { timeout: 2000 })
  })

  it('a flip that finds a salary fills it in', async () => {
    previewImport.mockResolvedValue({ ...review, salary: null })
    recomputeImport.mockResolvedValue({ ...review, direction: 'positive_spend', salary: { label: 'Payroll', amount: 3100, day: 2 } })
    toReview()
    await open(/^Monthly income/)
    expect(screen.getByLabelText('Monthly income')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'That’s backwards' }))
    await waitFor(() => expect(screen.getByLabelText('Monthly income')).toHaveValue(3100))
    done()
    fireEvent.click(screen.getByRole('button', { name: 'Looks right, set me up' }))
    await waitFor(() => expect(commitImport.mock.calls[0][1]).toMatchObject({ salary: { amount: 3100, day: 2 } }))
  })

  it('Escape closes an open group menu, not the whole envelopes sheet', async () => {
    toReview()
    await open(/^Envelopes/)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Group for Gifts' }))
    await screen.findByRole('option', { name: 'Savings' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Savings' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Your envelopes' })).toBeTruthy()
  })

  it('stops at more bank accounts than the app holds, rather than dropping one quietly', async () => {
    const accounts: ImportReview['accounts'] = [...Array.from({ length: 5 }, (_, i) => ({ source: `B${i}`, name: `B${i}`, type: 'bank' as const })), { source: 'Cash', name: 'Cash', type: 'cash' }]
    previewImport.mockResolvedValue({ ...review, accounts })
    toReview()
    await open(/^Accounts/)
    await pick('Type for Cash', 'Bank')
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('You can have up to 5 bank accounts. Make one of these cash or a credit card.')
    expect(screen.getByRole('button', { name: 'Looks right, set me up' })).toBeDisabled()
  })

  it('a cleared salary commits without one', async () => {
    toReview()
    await open(/^Monthly income/)
    fireEvent.change(screen.getByLabelText('Monthly income'), { target: { value: '' } })
    done()
    fireEvent.click(screen.getByRole('button', { name: 'Looks right, set me up' }))
    await waitFor(() => expect(commitImport.mock.calls[0][1]).toMatchObject({ salary: null }))
  })

  it('turns failure codes into its own copy, never the server’s', async () => {
    previewImport.mockRejectedValue(new ImportFailure('no_columns'))
    toReview()
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t find a date and an amount column. Check the file is the transactions export, not a report.')
  })

  it('an account already set up elsewhere is handed on, not shown a dead end', async () => {
    previewImport.mockRejectedValue(new ImportFailure('already_onboarded'))
    toReview()
    await waitFor(() => expect(onAlreadySetUp).toHaveBeenCalled())
  })

  it('says why a file without categories lands in one envelope', async () => {
    previewImport.mockResolvedValue({ ...review, categories: [{ source: 'Uncategorised', name: 'Uncategorised', group: 'Essentials', monthly: 27500 }] })
    toReview()
    expect(await screen.findByText('Your file doesn’t have categories, so every spend starts in one envelope. Rename it under Envelopes, or split it up later from Categories.')).toBeTruthy()
  })

  it('names the app it recognised over the review', async () => {
    toReview()
    expect(await screen.findByText('Monefy export')).toBeTruthy()
  })

  it.each([
    ['statement.pdf', 10, 'That’s a PDF. We need the spreadsheet, so export as csv or Excel instead.'],
    ['IMG_0042.jpg', 10, 'That’s a picture. We need the csv or Excel file your app exports.'],
    ['backup.xls', 10, 'That’s an old Excel file (.xls). Open it, save it as .xlsx or .csv, then drop that here.'],
    ['export.csv', 0, 'That file’s empty. Export it again from your app and try once more.'],
  ])('turns away %s before uploading it, saying why', async (name, bytes, copy) => {
    render(<ImportFlow onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switching apps? Bring your data' }))
    fireEvent.click(screen.getByRole('button', { name: /Wallet/ }))
    fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [new File([new Uint8Array(bytes)], name)] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(copy)
    expect(previewImport).not.toHaveBeenCalled()
  })

  it('gzips an export over 4 MB to fit the upload, under its own name', async () => {
    render(<ImportFlow onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switching apps? Bring your data' }))
    fireEvent.click(screen.getByRole('button', { name: /YNAB/ }))
    fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file(4 * 1024 * 1024 + 1)] } })
    await waitFor(() => expect(previewImport).toHaveBeenCalled())
    const sent = vi.mocked(previewImport).mock.calls[0][0]
    expect([sent.name, sent.size < 64 * 1024]).toEqual(['monefy.csv', true])
  })

  it('stops a file still over 4 MB gzipped before uploading it', async () => {
    const noise = new Uint8Array(4 * 1024 * 1024 + 1)
    for (let i = 0; i < noise.length; i += 65_536) crypto.getRandomValues(noise.subarray(i, i + 65_536))
    render(<ImportFlow onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switching apps? Bring your data' }))
    fireEvent.click(screen.getByRole('button', { name: /YNAB/ }))
    fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [new File([noise], 'monefy.csv', { type: 'text/csv' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('That file’s too big. Export a shorter date range and try again.')
    expect(previewImport).not.toHaveBeenCalled()
  })

  describe('later, from Settings', () => {
    const later: ImportReview = {
      ...review,
      salary: null,
      budgetTotal: 0,
      skipped: { after_start: 4 },
      otherCurrencies: [],
      groups: ['Bills'],
      categories: [
        { source: 'Bills', name: 'Bills', group: 'Bills', monthly: 0 },
        { source: 'Gifts', name: 'Gifts', group: 'Bills', monthly: 0 },
      ],
      later: { cutoff: '2026-10-03', categories: ['Bills', '🛒 Groceries'], icons: { categories: { '🛒 Groceries': 'ShoppingCart' }, groups: {} } },
    }

    it('says what comes in and why it stops there, without the setup steps', async () => {
      previewImport.mockResolvedValue(later)
      render(<ImportFlow skipAsk budgetName="Home" onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Monefy/ }))
      fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file()] } })
      expect(await screen.findByText(/^We’ll add 9 entries from before 3 Oct/)).toBeTruthy()
      expect(screen.getByText('Going into Home')).toBeTruthy()
      expect(screen.getByText('4 rows from 3 Oct on stay out, so nothing’s counted twice.')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Monthly income/ })).toBeNull()
      expect(screen.queryByText(/Your money’s in/)).toBeNull()
      expect(screen.getByRole('button', { name: 'Envelopes 1 new' })).toBeTruthy()
    })

    it('with nothing from before the first entry, there’s nothing to place and nothing to bring in', async () => {
      previewImport.mockResolvedValue({ ...later, counts: { expense: 0, refund: 0, income: 0, from: '', to: '' }, samples: [] })
      render(<ImportFlow skipAsk onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Monefy/ }))
      fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file()] } })
      expect(await screen.findByText('Nothing in this file is from before 3 Oct, when you started in Aviary.')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^Envelopes/ })).toBeNull()
      expect(screen.getByRole('button', { name: 'Bring it in' })).toHaveProperty('disabled', true)
    })

    it('puts a leftover category into an existing envelope and sends no salary', async () => {
      previewImport.mockResolvedValue(later)
      render(<ImportFlow skipAsk onFresh={vi.fn()} onDone={vi.fn()} onAlreadySetUp={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Monefy/ }))
      fireEvent.change(screen.getByLabelText('Choose your export file'), { target: { files: [file()] } })
      await open(/^Envelopes/)
      await pick('Envelope for Gifts', 'Groceries')
      // Our icon and the bare name: a stored "🛒 Groceries" never shows its emoji.
      expect(screen.queryByText(/🛒/)).toBeNull()
      done()
      expect(screen.getByRole('button', { name: 'Envelopes All matched' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Bring it in' }))
      await waitFor(() => expect(commitImport).toHaveBeenCalled())
      expect(commitImport.mock.calls[0][1]).toMatchObject({
        salary: null,
        categories: [{ source: 'Bills', name: 'Bills', group: 'Bills' }, { source: 'Gifts', name: '🛒 Groceries', group: 'Bills' }],
      })
    })
  })
})
