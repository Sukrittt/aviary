import { beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { recentExpensesKey, recentFrom } from '@/src/hooks/useExpenses'
import { getRecentExpenses } from '@/src/api/expenses'
import { ExpensePage } from './ExpensePage'
import { getBudgets, addBudget, updateBudget, transferBudget, getCarry } from '@/src/api/budgets'
import { getUser } from '@/src/api/account'
import { getBudgets as getSpaces } from '@/src/api/spaces'
import { getRecurringIncomes } from '@/src/api/incomes'
import { currentMonthKey, prevMonthKey, monthLabel } from '@/src/lib/envelope'

const { push, openLog, track } = vi.hoisted(() => ({ push: vi.fn(), openLog: vi.fn(), track: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/expense' }))
vi.mock('../../components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: 'dark', setTheme: vi.fn() }) }))
vi.mock('@/src/api/budgets', () => ({ getBudgets: vi.fn(), addBudget: vi.fn(), updateBudget: vi.fn(), transferBudget: vi.fn(), getCarry: vi.fn() }))
vi.mock('@/src/api/spaces', () => ({
  getBudgets: vi.fn(async () => ({ budgets: [{ id: 'space-1', name: 'Me', personal: true, members: [] }], activeId: 'space-1', deleted: [] })),
  switchBudget: vi.fn(),
}))
vi.mock('@/src/api/account', () => ({ getUser: vi.fn() }))
vi.mock('@/src/api/incomes', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/src/api/incomes')>()), getRecurringIncomes: vi.fn(async () => []) }))
vi.mock('@/src/api/expenses', () => ({ getRecentExpenses: vi.fn(async () => ({ rows: [], lastSpent: {} })), mintExpensePayload: vi.fn(), postExpensePayload: vi.fn() }))
vi.mock('@/src/api/categories', () => ({ getCategories: vi.fn(async () => [{ name: 'Food', group: 'Essentials' }]) }))
vi.mock('@/src/api/groups', () => ({ getGroups: vi.fn(async () => ['Essentials']), getGroupRows: vi.fn(async () => []) }))
vi.mock('@/src/api/subscriptions', () => ({ getSubscriptions: vi.fn(async () => []), cancelSubscription: vi.fn(), reactivateSubscription: vi.fn() }))
// Keeps its open dialog in local state, like the real sidebar, so a remount shows.
vi.mock('../components/ExpenseSidebar', async () => {
  const { useState } = await import('react')
  return {
    ExpenseSidebar: ({ onBulkReturn }: { onBulkReturn?: () => void }) => {
      const [showStatement, setShowStatement] = useState(false)
      return (
        <>
          {onBulkReturn && <button onClick={onBulkReturn}>Return all to RTA</button>}
          <button onClick={() => setShowStatement(true)}>Add from statement</button>
          {showStatement && <div>statement-dialog</div>}
        </>
      )
    },
  }
})
vi.mock('../components/EnvelopeGrid', () => ({ EnvelopeGrid: () => <div>Envelope content</div> }))
vi.mock('../components/RecentActivity', () => ({ RecentActivity: () => null }))
vi.mock('../components/FluidDemo', () => ({ FluidDemo: () => null }))
vi.mock('@/src/lib/analytics', () => ({ track }))
vi.mock('../components/LogExpenseModal', () => ({ LogExpenseModal: () => { openLog(); return <div>Manual expense form</div> } }))

const month = currentMonthKey()
const previous = prevMonthKey(month)
const baseUser = { _id: 'user-test', email: 'test@example.com', emailVerified: true, onboardedAt: '2026-09-01' }
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><ExpensePage /></QueryClientProvider>)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(getUser).mockResolvedValue(baseUser)
  vi.mocked(getBudgets).mockResolvedValue([
    { month: previous, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month: previous, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
  ])
  vi.mocked(getCarry).mockResolvedValue({ ready_to_assign: 0, rolled_over: {} })
})

it('starts a new month automatically, with nothing to set up', async () => {
  const client = renderPage()
  expect(await screen.findByLabelText('₹15,000')).toBeInTheDocument()
  expect(screen.queryByText(`Start ${monthLabel(month)}`)).not.toBeInTheDocument()
  expect(screen.queryByText(/Copy last month/)).not.toBeInTheDocument()
  expect(addBudget).not.toHaveBeenCalled()
  expect(updateBudget).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Income options' }))
  expect(screen.getByRole('menuitem', { name: 'Change income' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Add income' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Set Ready to Assign' })).toBeInTheDocument()
  client.clear()
})

it('offers the manual transaction and optional tour after setup', async () => {
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01' })
  const client = renderPage()
  expect(await screen.findByRole('heading', { name: 'Get started' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add a manual transaction' }))
  expect(screen.getByText('Manual expense form')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Take a guided tour' }))
  expect(push).toHaveBeenCalledWith('/account/guided-tour')
  fireEvent.click(screen.getByRole('button', { name: 'Skip getting started' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument())
  client.clear()
})

it('keeps getting started out of the way for existing or finished users', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month: previous, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month: previous, category: 'Food', assigned: '20000', rolled_over: '0', version: 1 },
  ])
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01', manualTransactionCompletedAt: '2026-09-02', guidedTourCompletedAt: '2026-09-03' })
  const client = renderPage()
  expect(await screen.findByText('Envelope content')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument())
  client.clear()
})

// Income alone leaves every category at zero, so the next step is assigning it.
it('asks to assign all of the income, opening the next empty category', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '50000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '0', rolled_over: '0', version: 1 },
  ])
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01', manualTransactionCompletedAt: '2026-09-02', guidedTourCompletedAt: '2026-09-03' })
  const client = renderPage()
  expect(await screen.findByRole('heading', { name: 'Get started' })).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Getting started' })).toHaveAttribute('aria-valuenow', '3')
  expect(screen.getByText('₹50,000 still to assign')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Assign all your income' }))
  expect(await screen.findByRole('dialog', { name: /Assign/ })).toBeInTheDocument()
  client.clear()
})

// Signing up mid-month, the first pay lands next month and counts from then.
it('asks for what you have now when the first pay lands next month', async () => {
  vi.mocked(getBudgets).mockResolvedValue([{ month, category: 'Food', assigned: '0', rolled_over: '0', version: 1 }])
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01' })
  const [y, m] = month.split('-').map(Number)
  const payday = m === 12 ? `${y + 1}-01-04` : `${y}-${String(m + 1).padStart(2, '0')}-04`
  vi.mocked(getRecurringIncomes).mockResolvedValue([{ id: 'r1', label: 'Salary', amount: '50000', frequency: 'monthly', status: 'active', start_date: payday, end_date: '', next_run_date: payday, account_id: '', created_at: '' }])
  const client = renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Add what you have now' }))
  expect(await screen.findByDisplayValue('Starting balance')).toBeInTheDocument()
  client.clear()
  vi.mocked(getRecurringIncomes).mockResolvedValue([])
})

// Setup can skip income, so Get started keeps asking until there's some.
it('asks for income first when setup skipped it, opening the monthly income screen', async () => {
  vi.mocked(getBudgets).mockResolvedValue([{ month, category: 'Food', assigned: '0', rolled_over: '0', version: 1 }])
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01' })
  // The schedule modal's date pickers read the viewport; jsdom has no matchMedia.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const client = renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Add your income' }))
  expect(screen.queryByRole('button', { name: /Set up your budget/ })).not.toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Getting started' })).toHaveAttribute('aria-valuenow', '0')
  expect(await screen.findByDisplayValue('Monthly income')).toBeInTheDocument()
  client.clear()
  vi.unstubAllGlobals()
})

it('keeps getting started up without income, even with both other milestones done', async () => {
  vi.mocked(getBudgets).mockResolvedValue([])
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01', manualTransactionCompletedAt: '2026-09-02', guidedTourCompletedAt: '2026-09-03' })
  const client = renderPage()
  expect(await screen.findByRole('button', { name: 'Add your income' })).toBeInTheDocument()
  client.clear()
})

it('preserves the cards below when getting started arrives after the dashboard and is dismissed', async () => {
  let resolveUser!: (user: Awaited<ReturnType<typeof getUser>>) => void
  vi.mocked(getUser).mockReturnValueOnce(new Promise((resolve) => { resolveUser = resolve }))
  const client = renderPage()
  const envelopes = await screen.findByText('Envelope content')
  expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument()
  // Insights is an opt-in extra, so it waits for the profile instead of flashing in.
  expect(screen.queryByRole('link', { name: 'Trends and daily spend' })).not.toBeInTheDocument()

  await act(async () => resolveUser({ ...baseUser, getStartedAt: '2026-09-01', manualTransactionCompletedAt: '2026-09-02' }))
  expect(await screen.findByRole('heading', { name: 'Get started' })).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Getting started' })).toHaveAttribute('aria-valuenow', '2')
  expect(screen.getByText('Envelope content')).toBe(envelopes)
  const trends = screen.getByRole('link', { name: 'Trends and daily spend' })

  fireEvent.click(screen.getByRole('button', { name: 'Skip getting started' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument())
  expect(screen.getByText('Envelope content')).toBe(envelopes)
  expect(screen.getByRole('link', { name: 'Trends and daily spend' })).toBe(trends)
  client.clear()
})

it('shows a retryable error, not balances without the carry, when the carry fails to load', async () => {
  vi.mocked(getCarry).mockRejectedValueOnce(new Error('503'))
  const client = renderPage()
  expect(await screen.findByRole('heading', { name: "Couldn't load your budget" })).toBeInTheDocument()
  expect(screen.queryByLabelText('₹15,000')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByLabelText('₹15,000')).toBeInTheDocument()
  client.clear()
})

it('shows no rollover card when nothing carried in', async () => {
  vi.mocked(getBudgets).mockResolvedValue([])
  const client = renderPage()
  await screen.findByRole('button', { name: 'Income options' })
  expect(screen.queryByText(/rolled over/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Start October/)).not.toBeInTheDocument()
  client.clear()
})

it('says once per budget and month what rolled in, and adds it to Ready to Assign', async () => {
  vi.mocked(getCarry).mockResolvedValue({ ready_to_assign: 5000, rolled_over: { Food: 95, Rent: -20 } })
  const title = '₹5,095 rolled over · ₹20 short'
  const first = renderPage()
  expect(await screen.findByText(title)).toBeInTheDocument()
  // Last month's ₹15,000 plan carries as before; the ₹5,000 left unassigned comes on top.
  expect(screen.getByLabelText('₹20,000')).toBeInTheDocument()
  // The strip says it all, so the hero has no separate carried line.
  expect(screen.queryByText(/includes ₹/)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Nice' }))
  expect(screen.getByRole('button', { name: 'Nice' })).toBeDisabled()
  await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument(), { timeout: 4000 })
  first.clear()
  cleanup()

  // Dismissed stays dismissed for this budget and month.
  const second = renderPage()
  await screen.findByLabelText('₹20,000')
  expect(screen.queryByText(title)).not.toBeInTheDocument()
  second.clear()
})

it('shows a bulk return in Ready to Assign straight away, before the refetch lands', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
  ])
  // The refetch after the transfer never answers, so only the local update can move the hero.
  vi.mocked(transferBudget).mockImplementation(async () => {
    vi.mocked(getBudgets).mockReturnValue(new Promise(() => {}))
  })
  const client = renderPage()
  expect(await screen.findByLabelText('₹15,000')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return all to RTA' }))
  fireEvent.click(await screen.findByRole('button', { name: /Return ₹5,000 to RTA/ }))
  expect(await screen.findByLabelText('₹20,000')).toBeInTheDocument()
  expect(transferBudget).toHaveBeenCalled()
  client.clear()
})

it('leaves Credit Card Payment out of the bulk return\'s Ready to Assign, as the server does', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
    { month, category: '__credit_card__', assigned: '1000', rolled_over: '0', version: 1 },
  ])
  vi.mocked(getRecentExpenses).mockResolvedValue({ rows: [{ timestamp: `${month}-02T10:00:00`, date: `${month}-02`, item: 'Card swipe', amount_inr: '400', category: '__credit_card__', notes: '', source: '', amount: '400', description: '', payment_method: '' }], lastSpent: {} } as never)
  vi.mocked(transferBudget).mockImplementation(async () => {
    vi.mocked(getBudgets).mockReturnValue(new Promise(() => {}))
  })
  const client = renderPage()
  expect(await screen.findByLabelText('₹15,000')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return all to RTA' }))
  fireEvent.click(await screen.findByRole('button', { name: /Return ₹5,600 to RTA/ }))
  // The card's ₹400 still assigned isn't part of totalAssigned, so nothing comes off.
  expect(await screen.findByLabelText('₹20,000')).toBeInTheDocument()
  client.clear()
})

it('renders the finished home screen from a filled cache on the first render, and hydrates it as-is', async () => {
  // app/expense/page.tsx server-renders this page from a cache filled under
  // these keys. Anything that holds it back to a later render (an effect, a
  // loading shell) puts the loading screen in the HTML instead.
  const filled = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['budgets'], [
      { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
      { month, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
    ])
    client.setQueryData(recentExpensesKey(recentFrom()), { rows: [], lastSpent: {} })
    client.setQueryData(['categories'], [{ name: 'Food', group: 'Essentials' }])
    client.setQueryData(['groups'], ['Essentials'])
    client.setQueryData(['budgets', 'carry', month], { ready_to_assign: 0, rolled_over: {} })
    client.setQueryData(['subscriptions'], [])
    client.setQueryData(['user'], { ...baseUser, manualTransactionCompletedAt: '2026-09-02', guidedTourCompletedAt: '2026-09-02' })
    return client
  }
  const tree = (client: QueryClient) => <QueryClientProvider client={client}><ExpensePage /></QueryClientProvider>

  const html = renderToString(tree(filled()))
  expect(html).toContain('READY TO ASSIGN')
  expect(html).toContain('Envelope content')
  expect(html).not.toContain('erd-home-loading')

  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const onRecoverableError = vi.fn()
  await act(async () => { hydrateRoot(container, tree(filled()), { onRecoverableError }) })
  expect(onRecoverableError).not.toHaveBeenCalled()
  container.remove()
})

it('names income in a pill under the hero that opens the income menu', async () => {
  const client = renderPage()
  const pill = await screen.findByRole('button', { name: 'Income · ₹20,000' })
  await userEvent.setup().click(pill)
  expect(await screen.findByRole('menuitem', { name: 'Change income' })).toBeInTheDocument()
  expect(pill).toHaveAttribute('aria-expanded', 'true')
  client.clear()
})

it('asks to set income from the hero pill when there is none', async () => {
  vi.mocked(getBudgets).mockResolvedValue([{ month, category: 'Food', assigned: '0', rolled_over: '0', version: 1 }])
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const client = renderPage()
  const pill = await screen.findByRole('button', { name: 'Set your income' })
  fireEvent.click(pill)
  expect(await screen.findByDisplayValue('Monthly income')).toBeInTheDocument()
  client.clear()
  vi.unstubAllGlobals()
})

it('drops Ready to Assign to one row once everything is assigned, like Mobile', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '20000', rolled_over: '0', version: 1 },
  ])
  const client = renderPage()
  const row = await screen.findByRole('button', { name: 'Ready to Assign options' })
  expect(screen.queryByText('READY TO ASSIGN')).not.toBeInTheDocument()
  expect(screen.getByText(monthLabel(month))).toBeInTheDocument()
  fireEvent.click(row)
  expect(row).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('menuitem', { name: 'Change income' })).toBeInTheDocument()
  // Already at zero on arrival: nothing happened while you watched, so no celebration.
  expect(screen.queryByText('Every rupee has a job.')).not.toBeInTheDocument()
  expect(track).not.toHaveBeenCalledWith('rta_zero_celebrated')
  client.clear()
})

it('celebrates Ready to Assign reaching zero while you watch, then settles back', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
  ])
  const client = renderPage()
  expect(await screen.findByLabelText('₹15,000')).toBeInTheDocument()
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '20000', rolled_over: '0', version: 2 },
  ])
  await act(() => client.invalidateQueries({ queryKey: ['budgets'] }))
  expect(await screen.findByText('Every rupee has a job.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ready to Assign options' })).toHaveClass('is-celebrating')
  expect(track).toHaveBeenCalledWith('rta_zero_celebrated')
  // ~2.5s on the real clock: the beat's whole length.
  await waitFor(() => expect(screen.queryByText('Every rupee has a job.')).not.toBeInTheDocument(), { timeout: 4000 })
  expect(screen.getByText('Ready to Assign', { exact: false })).toBeInTheDocument()
  client.clear()
})

it('holds the Ready to Assign celebration until the dialog that caused it closes', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '5000', rolled_over: '0', version: 1 },
  ])
  const client = renderPage()
  expect(await screen.findByLabelText('₹15,000')).toBeInTheDocument()
  // Stands in for the assign sheet that's still open when the save lands.
  const dialog = document.createElement('div')
  dialog.setAttribute('aria-modal', 'true')
  document.body.appendChild(dialog)
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '20000', rolled_over: '0', version: 2 },
  ])
  await act(() => client.invalidateQueries({ queryKey: ['budgets'] }))
  expect(await screen.findByRole('button', { name: 'Ready to Assign options' })).not.toHaveClass('is-celebrating')
  expect(screen.queryByText('Every rupee has a job.')).not.toBeInTheDocument()
  dialog.remove()
  expect(await screen.findByText('Every rupee has a job.')).toBeInTheDocument()
  expect(track).toHaveBeenCalledWith('rta_zero_celebrated')
  client.clear()
})

it('keeps a sidebar dialog opened while loading open once the dashboard arrives', async () => {
  let resolveBudgets!: (rows: Awaited<ReturnType<typeof getBudgets>>) => void
  vi.mocked(getBudgets).mockReturnValueOnce(new Promise((resolve) => { resolveBudgets = resolve }))
  const client = renderPage()
  fireEvent.click(screen.getByRole('button', { name: 'Add from statement' }))
  expect(screen.getByText('statement-dialog')).toBeInTheDocument()

  await act(async () => resolveBudgets([]))
  expect(await screen.findByText('Envelope content')).toBeInTheDocument()
  expect(screen.getByText('statement-dialog')).toBeInTheDocument()
  client.clear()
})

it('says how far the plan is over what comes in, and offers the biggest plans to trim', async () => {
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '25000', rolled_over: '0', version: 1 },
  ])
  const client = renderPage()
  expect(await screen.findByText('₹5,000 more planned than coming in')).toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Trim' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Food · ₹25,000' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  client.clear()
})

it('says nothing about trimming when the plan fits', async () => {
  const client = renderPage()
  await screen.findByRole('button', { name: 'Income · ₹20,000' })
  expect(screen.queryByText(/more planned than coming in/)).not.toBeInTheDocument()
  client.clear()
})

it('in a read-only budget, explains an over plan but offers no Trim', async () => {
  vi.mocked(getSpaces).mockResolvedValue({ budgets: [{ id: 'space-1', name: 'Studio', personal: false, readOnly: true, members: [] }], activeId: 'space-1', deleted: [] } as never)
  vi.mocked(getBudgets).mockResolvedValue([
    { month, category: '__income__', assigned: '20000', rolled_over: '0', version: 1 },
    { month, category: 'Food', assigned: '25000', rolled_over: '0', version: 1 },
  ])
  const client = renderPage()
  expect(await screen.findByText('₹5,000 more planned than coming in')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Trim' })).not.toBeInTheDocument())
  client.clear()
})
