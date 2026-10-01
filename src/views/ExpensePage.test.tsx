import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExpensePage } from './ExpensePage'
import { getBudgets, addBudget, updateBudget } from '@/src/api/budgets'
import { getUser } from '@/src/api/account'
import { currentMonthKey, prevMonthKey, monthLabel } from '@/src/lib/envelope'

const { push, openLog } = vi.hoisted(() => ({ push: vi.fn(), openLog: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/expense' }))
vi.mock('../../components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: 'dark', setTheme: vi.fn() }) }))
vi.mock('@/src/api/budgets', () => ({ getBudgets: vi.fn(), addBudget: vi.fn(), updateBudget: vi.fn(), transferBudget: vi.fn() }))
vi.mock('@/src/api/account', () => ({ getUser: vi.fn() }))
vi.mock('@/src/api/expenses', () => ({ getRecentExpenses: vi.fn(async () => ({ rows: [], lastSpent: {} })), mintExpensePayload: vi.fn(), postExpensePayload: vi.fn() }))
vi.mock('@/src/api/categories', () => ({ getCategories: vi.fn(async () => [{ name: 'Food', group: 'Essentials' }]) }))
vi.mock('@/src/api/groups', () => ({ getGroups: vi.fn(async () => ['Essentials']) }))
vi.mock('@/src/api/subscriptions', () => ({ getSubscriptions: vi.fn(async () => []), cancelSubscription: vi.fn(), reactivateSubscription: vi.fn() }))
vi.mock('../components/ExpenseSidebar', () => ({ ExpenseSidebar: () => null }))
vi.mock('../components/EnvelopeGrid', () => ({ EnvelopeGrid: () => <div>Envelope content</div> }))
vi.mock('../components/RecentActivity', () => ({ RecentActivity: () => null }))
vi.mock('../components/FluidDemo', () => ({ FluidDemo: () => null }))
vi.mock('../features/sign-in-flight/SignInFlight', () => ({ SignInFlight: () => null }))
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
})

it('starts a new month automatically and shows only a dismissible leftover notice', async () => {
  const client = renderPage()
  expect(await screen.findByText(/left over from last month/)).toBeInTheDocument()
  expect(screen.queryByText(`Start ${monthLabel(month)}`)).not.toBeInTheDocument()
  expect(screen.queryByText(/Copy last month/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('₹15,000')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Okay' }))
  expect(screen.queryByText(/left over from last month/)).not.toBeInTheDocument()
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
  vi.mocked(getUser).mockResolvedValue({ ...baseUser, getStartedAt: '2026-09-01', manualTransactionCompletedAt: '2026-09-02', guidedTourCompletedAt: '2026-09-03' })
  const client = renderPage()
  await waitFor(() => expect(screen.getByLabelText('₹15,000')).toBeInTheDocument())
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument())
  client.clear()
})

it('preserves the cards below when getting started arrives after the dashboard and is dismissed', async () => {
  let resolveUser!: (user: Awaited<ReturnType<typeof getUser>>) => void
  vi.mocked(getUser).mockReturnValueOnce(new Promise((resolve) => { resolveUser = resolve }))
  const client = renderPage()
  const envelopes = await screen.findByText('Envelope content')
  const trends = screen.getByRole('link', { name: 'Trends and daily spend' })
  expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument()

  await act(async () => resolveUser({ ...baseUser, getStartedAt: '2026-09-01', manualTransactionCompletedAt: '2026-09-02' }))
  expect(await screen.findByRole('heading', { name: 'Get started' })).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Getting started' })).toHaveAttribute('aria-valuenow', '2')
  expect(screen.getByText('Envelope content')).toBe(envelopes)
  expect(screen.getByRole('link', { name: 'Trends and daily spend' })).toBe(trends)

  fireEvent.click(screen.getByRole('button', { name: 'Skip getting started' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Get started' })).not.toBeInTheDocument())
  expect(screen.getByText('Envelope content')).toBe(envelopes)
  expect(screen.getByRole('link', { name: 'Trends and daily spend' })).toBe(trends)
  client.clear()
})

it('shows no leftover notice for a first budget with no history', async () => {
  vi.mocked(getBudgets).mockResolvedValue([])
  const client = renderPage()
  await screen.findByRole('button', { name: 'Income options' })
  expect(screen.queryByText(/left over from last month/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Start October/)).not.toBeInTheDocument()
  client.clear()
})
