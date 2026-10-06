import { it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import type { Mock } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ScanBillModal } from './ScanBillModal'
import { ScanBillProvider } from './ScanBillProvider'
import { scanBill, type ScanResult } from '@/src/api/scan'
import { saveBillScan } from '@/src/api/bills'
import { dataUrlFromFile } from './image'
import { postExpensePayload } from '@/src/api/expenses'

vi.mock('@/src/api/scan', () => ({ scanBill: vi.fn() }))
vi.mock('@/src/api/bills', () => ({ saveBillScan: vi.fn() }))
vi.mock('@/src/api/categories', () => ({ getCategories: vi.fn().mockResolvedValue([{ name: 'Groceries', group: 'Home' }, { name: 'Dining', group: 'Home' }]) }))
vi.mock('@/src/api/groups', () => ({ getGroups: vi.fn().mockResolvedValue(['Home']) }))
vi.mock('@/src/api/expenses', async (importActual) => ({
  ...(await importActual<typeof import('@/src/api/expenses')>()),
  getExpenses: vi.fn().mockResolvedValue([]),
  getRecentExpenses: vi.fn().mockResolvedValue({ rows: [], lastSpent: {} }),
  postExpensePayload: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(saveBillScan).mockResolvedValue(undefined)
})

// jsdom does not implement the native modal-dialog APIs or its top layer.
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } },
  })
})
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function ScanPage() {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Open scan</button>
    {open && <ScanBillModal onClose={() => setOpen(false)} onEnterManually={() => setOpen(false)} />}
  </>
}

function ScanSession() {
  const [page, setPage] = useState(0)
  return <>
    <button onClick={() => setPage((p) => p + 1)}>Change page</button>
    <ScanPage key={page} />
  </>
}

function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<ScanSession />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}><ScanBillProvider>{children}</ScanBillProvider></QueryClientProvider>
    ),
  })
}

async function pasteBill() {
  const paste = new Event('paste') as Event & { clipboardData: { files: File[] } }
  paste.clipboardData = { files: [new File(['x'], 'bill.png', { type: 'image/png' })] }
  await act(async () => { window.dispatchEvent(paste) })
}

const BILL: ScanResult = {
  merchant: 'Shop', category: 'Groceries', date: '2026-09-10', total: 115,
  items: [
    { name: 'Milk', price: 60, qty: 1 },
    { name: 'Bread', price: 40, qty: 1 },
    { name: 'Delivery fee', price: 12, qty: 1 },
  ],
}
// jsdom has no canvas or createImageBitmap; the encoding is the browser's job.
vi.mock('./image', () => ({
  dataUrlFromFile: vi.fn().mockResolvedValue('data:image/jpeg;base64,QUJD'),
  dataUrlFromVideo: vi.fn(),
  base64Of: (url: string) => url.slice(url.indexOf(',') + 1),
}))

it('pastes a bill, splits it, logs the share and saves the scan without blank rows', async () => {
  ;(scanBill as Mock).mockResolvedValue({
    merchant: 'Blinkit',
    total: 112,
    category: 'Groceries',
    date: '2026-09-10',
    items: [
      { name: 'Milk', price: 60, qty: 1 },
      { name: 'Bread', price: 40, qty: 1 },
      { name: 'Delivery fee', price: 12, qty: 1 },
    ],
  })
  ;(postExpensePayload as Mock).mockResolvedValue({ id: 'exp1', timestamp: 't' })
  ;(saveBillScan as Mock).mockResolvedValue(undefined)
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ScanBillModal onClose={onClose} onEnterManually={vi.fn()} />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><ScanBillProvider>{children}</ScanBillProvider></QueryClientProvider>,
  })

  const file = new File(['x'], 'bill.png', { type: 'image/png' })
  const paste = new Event('paste') as Event & { clipboardData: { files: File[] } }
  paste.clipboardData = { files: [file] }
  await act(async () => {
    window.dispatchEvent(paste)
  })

  await screen.findByText('Fees & discount')
  // mock.calls[0][0], not toHaveBeenCalledWith: react-query passes the mutation context as a second argument.
  expect((scanBill as Mock).mock.calls[0][0]).toEqual({ image: 'QUJD', mimeType: 'image/jpeg', categories: ['Groceries', 'Dining'] })

  // Bread split two ways: 60 + 20 of the products, plus half the 12 fee.
  await userEvent.click(screen.getAllByRole('button', { name: '÷2' })[1])
  await userEvent.click(screen.getByRole('button', { name: '+ Add item' }))
  await userEvent.click(screen.getByRole('button', { name: 'Review ₹86 →' }))
  await userEvent.click(screen.getByRole('button', { name: 'Log ₹86 to Groceries' }))

  await waitFor(() => expect(saveBillScan).toHaveBeenCalled())
  expect((postExpensePayload as Mock).mock.calls[0][0]).toMatchObject({ item: 'Blinkit', amount_inr: '86', category: 'Groceries', date: '2026-09-10' })
  const saved = (saveBillScan as Mock).mock.calls[0][0]
  expect(saved).toMatchObject({ expense_id: 'exp1', total: 112, my_share: 86, people_count: 2 })
  expect(saved.items.map((i: { name: string }) => i.name)).toEqual(['Milk', 'Bread', 'Delivery fee'])
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 2000 })
})

it('keeps the edited draft on close and page changes, and clears it on a new session', async () => {
  vi.mocked(scanBill).mockResolvedValue(BILL)
  const session = renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  await screen.findByText('Fees & discount')

  fireEvent.change(screen.getAllByRole('textbox', { name: 'Item name' })[0], { target: { value: 'Whole milk' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Your share of Whole milk' }), { target: { value: '80' } })
  await userEvent.click(screen.getAllByRole('button', { name: '÷2' })[0])
  await userEvent.click(screen.getByRole('button', { name: 'Remove Bread' }))
  await userEvent.click(screen.getByRole('button', { name: '+ Add item' }))
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Item name' })[1], { target: { value: 'Eggs' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Your share of Eggs' }), { target: { value: '20' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Fee amount for Delivery fee' }), { target: { value: '15' } })
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Merchant' }), { target: { value: 'Edited shop' } })
  await userEvent.click(screen.getByRole('button', { name: /Groceries/ }))
  await userEvent.click(screen.getByRole('button', { name: /Dining/ }))
  await userEvent.click(screen.getByRole('button', { name: /Thursday, 10 Sep 2026/ }))
  await userEvent.click(screen.getByRole('button', { name: '9' }))
  await userEvent.click(screen.getByRole('button', { name: 'Select' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select Whole milk' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Whole' } })
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByRole('searchbox')).toHaveValue('Whole')
  expect(screen.getByRole('checkbox', { name: 'Select Whole milk' })).toBeChecked()
  expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(screen.getByRole('spinbutton', { name: 'Your share of Whole milk' })).toHaveValue(40)
  expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('Edited shop')
  expect(screen.getByRole('button', { name: /Dining/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Wednesday, 9 Sep 2026/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByAltText('The scanned bill')).toHaveAttribute('src', 'data:image/jpeg;base64,QUJD')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  expect(screen.getAllByRole('textbox', { name: 'Item name' }).map((input) => (input as HTMLInputElement).value)).toEqual(['Whole milk', 'Eggs'])
  expect(screen.getByRole('spinbutton', { name: 'Fee amount for Delivery fee' })).toHaveValue(15)
  // The unlisted residual fee is 3, so the fee share is (15 + 3) / 3.
  await userEvent.click(screen.getByRole('button', { name: 'Review ₹66 →' }))
  await userEvent.click(screen.getByRole('button', { name: 'Change page' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByRole('heading', { name: 'Confirm your log' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Log ₹66 to Dining' })).toBeInTheDocument()
  expect(scanBill).toHaveBeenCalledTimes(1)

  session.unmount()
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByText('Drop a bill or a screenshot here')).toBeInTheDocument()
})

it('finishes an in-flight scan while the dialog and page are unmounted', async () => {
  let finishScan!: (result: ScanResult) => void
  vi.mocked(scanBill).mockReturnValue(new Promise((resolve) => { finishScan = resolve }))
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  await waitFor(() => expect(scanBill).toHaveBeenCalledTimes(1))
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  await userEvent.click(screen.getByRole('button', { name: 'Change page' }))
  await act(async () => { finishScan(BILL) })
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(await screen.findByRole('textbox', { name: 'Merchant' })).toHaveValue('Shop')
  expect(screen.getByRole('button', { name: 'Review ₹107.50 →' })).toBeInTheDocument()
  expect(scanBill).toHaveBeenCalledTimes(1)
})

it('keeps save failures across navigation and clears the draft after a successful retry while closed', async () => {
  vi.mocked(scanBill).mockResolvedValue(BILL)
  vi.mocked(postExpensePayload).mockRejectedValueOnce(new Error('offline'))
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  await userEvent.click(await screen.findByRole('button', { name: 'Review ₹107.50 →' }))
  await userEvent.click(screen.getByRole('button', { name: 'Log ₹107.50 to Groceries' }))
  await screen.findByText("Couldn't log this. Check your connection and try again.")
  await userEvent.click(screen.getByRole('button', { name: 'Change page' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByText("Couldn't log this. Check your connection and try again.")).toBeInTheDocument()

  let finishSave!: (result: { id: string; timestamp: string }) => void
  vi.mocked(postExpensePayload).mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve }))
  await userEvent.click(screen.getByRole('button', { name: 'Log ₹107.50 to Groceries' }))
  await userEvent.click(screen.getByRole('button', { name: 'Change page' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Re-upload bill' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  await act(async () => { finishSave({ id: 'saved', timestamp: 't' }) })
  await waitFor(() => expect(saveBillScan).toHaveBeenCalledTimes(1))
  expect(vi.mocked(saveBillScan).mock.calls[0][0]).toMatchObject({ expense_id: 'saved', merchant: 'Shop', my_share: 107.5, total: 115 })
  // The provider owns the success timer too; it clears the draft even when closed.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1200)) })
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByText('Drop a bill or a screenshot here')).toBeInTheDocument()
  expect(postExpensePayload).toHaveBeenCalledTimes(2)
})

it('keeps the draft when re-upload is cancelled and replaces it when another file is chosen', async () => {
  vi.mocked(scanBill).mockResolvedValueOnce(BILL).mockResolvedValueOnce({
    merchant: 'New shop', category: 'Dining', date: '2026-09-01', total: 25,
    items: [{ name: 'Tea', price: 25, qty: 1 }],
  })
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  await screen.findByRole('textbox', { name: 'Merchant' })
  await userEvent.click(screen.getAllByRole('button', { name: '÷2' })[0])
  await userEvent.click(screen.getByRole('button', { name: 'Select' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select Milk' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Milk' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Merchant' }), { target: { value: 'Edited shop' } })

  // Opening the picker without choosing a file must not discard any edits.
  await userEvent.click(screen.getByRole('button', { name: 'Re-upload bill' }))
  expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('Edited shop')
  expect(screen.getByRole('checkbox', { name: 'Select Milk' })).toBeChecked()
  expect(screen.getByRole('searchbox')).toHaveValue('Milk')
  expect(scanBill).toHaveBeenCalledTimes(1)

  await userEvent.click(screen.getByRole('button', { name: 'Review ₹77.50 →' }))
  await userEvent.click(screen.getByRole('button', { name: 'Re-upload bill' }))
  // The original file can be chosen again as well as a different photo.
  await userEvent.upload(screen.getByLabelText('Re-upload bill photo'), new File(['x'], 'bill.png', { type: 'image/png' }))
  expect(await screen.findByRole('textbox', { name: 'Merchant' })).toHaveValue('New shop')
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getAllByRole('textbox', { name: 'Item name' })).toHaveLength(1)
  expect(screen.getByRole('textbox', { name: 'Item name' })).toHaveValue('Tea')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByText('Fees & discount')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Review ₹25 →' })).toBeInTheDocument()
  expect(scanBill).toHaveBeenCalledTimes(2)

  await userEvent.click(screen.getByRole('button', { name: 'Change page' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('New shop')
  expect(screen.getByRole('button', { name: 'Review ₹25 →' })).toBeInTheDocument()
})

it('opens the full bill in a modal preview and dismisses it without changing the draft', async () => {
  vi.mocked(scanBill).mockResolvedValue(BILL)
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  const merchant = await screen.findByRole('textbox', { name: 'Merchant' })
  fireEvent.change(merchant, { target: { value: 'Edited shop' } })
  await userEvent.click(screen.getByRole('button', { name: 'Select' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select Milk' }))
  const source = screen.getByAltText('The scanned bill').getAttribute('src')
  const trigger = screen.getByRole('button', { name: 'Preview bill photo' })
  expect(trigger).not.toHaveAttribute('href')

  await userEvent.click(trigger)
  let preview = screen.getByRole('dialog', { name: 'Bill photo preview' })
  expect(preview).toHaveAttribute('open')
  expect(screen.getByAltText('Full scanned bill')).toHaveAttribute('src', source)
  await userEvent.click(screen.getByAltText('Full scanned bill'))
  expect(preview).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Close bill photo' }))
  expect(screen.queryByRole('dialog', { name: 'Bill photo preview' })).not.toBeInTheDocument()

  await userEvent.click(trigger)
  preview = screen.getByRole('dialog', { name: 'Bill photo preview' })
  // Escape causes this native cancel event in a browser.
  fireEvent(preview, new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog', { name: 'Bill photo preview' })).not.toBeInTheDocument()

  await userEvent.click(trigger)
  await userEvent.click(screen.getByRole('dialog', { name: 'Bill photo preview' }))
  expect(screen.queryByRole('dialog', { name: 'Bill photo preview' })).not.toBeInTheDocument()
  expect(merchant).toHaveValue('Edited shop')
  expect(screen.getByRole('checkbox', { name: 'Select Milk' })).toBeChecked()
  expect(screen.getByRole('dialog', { name: 'Scan a bill' })).toBeInTheDocument()
  expect(scanBill).toHaveBeenCalledTimes(1)
})

it('supports keyboard selection, clearing and applying a split to the selected items', async () => {
  vi.mocked(scanBill).mockResolvedValue(BILL)
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  await screen.findByRole('textbox', { name: 'Merchant' })
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Select' }))
  const milk = await screen.findByRole('checkbox', { name: 'Select Milk' })
  milk.focus()
  await userEvent.keyboard(' ')
  expect(milk).toBeChecked()
  expect(screen.getByRole('status')).toHaveTextContent('1 selected')
  expect(screen.getByText('2 items · scanned just now')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(milk).not.toBeChecked()
  expect(screen.queryByRole('group', { name: 'Split selected items' })).not.toBeInTheDocument()

  milk.focus()
  await userEvent.keyboard(' ')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select Bread' }))
  expect(screen.getByRole('status')).toHaveTextContent('2 selected')
  await userEvent.click(within(screen.getByRole('group', { name: 'Split selected items' })).getByRole('button', { name: '÷2' }))
  expect(screen.getByRole('spinbutton', { name: 'Your share of Milk' })).toHaveValue(30)
  expect(screen.getByRole('spinbutton', { name: 'Your share of Bread' })).toHaveValue(20)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByRole('group', { name: 'Split selected items' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Review ₹57.50 →' })).toBeInTheDocument()
})


it.each(['decode', 'scan'])('keeps an edited bill when its replacement fails to %s', async (failure) => {
  vi.mocked(scanBill).mockResolvedValueOnce(BILL)
  renderSession()
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  await pasteBill()
  fireEvent.change(await screen.findByRole('textbox', { name: 'Merchant' }), { target: { value: 'Edited shop' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Your share of Milk' }), { target: { value: '30' } })
  const originalPhoto = screen.getByAltText('The scanned bill').getAttribute('src')
  if (failure === 'decode') vi.mocked(dataUrlFromFile).mockRejectedValueOnce(new Error('corrupt image'))
  else {
    vi.mocked(dataUrlFromFile).mockResolvedValueOnce('data:image/jpeg;base64,TkVX')
    vi.mocked(scanBill).mockRejectedValueOnce(new Error('offline'))
  }
  await userEvent.upload(screen.getByLabelText('Re-upload bill photo'), new File(['x'], 'replacement.png', { type: 'image/png' }))
  await screen.findByText(/Couldn't read that (image|bill)/)
  expect(screen.getByRole('textbox', { name: 'Merchant' })).toHaveValue('Edited shop')
  expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't read/)
  expect(screen.getByRole('spinbutton', { name: 'Your share of Milk' })).toHaveValue(30)
  expect(screen.getByAltText('The scanned bill')).toHaveAttribute('src', originalPhoto)
  await userEvent.click(screen.getByRole('button', { name: 'Change page' }))
  await userEvent.click(screen.getByRole('button', { name: 'Open scan' }))
  expect(screen.getByRole('button', { name: 'Review ₹77.50 →' })).toBeInTheDocument()
})
