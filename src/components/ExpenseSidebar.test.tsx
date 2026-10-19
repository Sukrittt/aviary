import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => '/account', useRouter: () => ({ push }) }))

let allowed = true
vi.mock('../hooks/useBillingStatus', () => ({ useAccessAllowed: () => allowed }))

const openMoneyBrain = vi.fn()
vi.mock('@/components/MoneyBrainProvider', () => ({ useMoneyBrain: () => ({ openMoneyBrain }) }))
vi.mock('@/components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: 'dark', setTheme: vi.fn() }) }))
const setCollapsed = vi.fn()
vi.mock('../hooks/usePersistentState', () => ({ usePersistentState: (k: string, v: unknown) => [v, (next: unknown) => setCollapsed(k, next)] }))
let hidden: string[] = []
vi.mock('../hooks/useUser', () => ({ useHiddenFeatures: () => hidden }))
vi.mock('./LogExpenseModal', () => ({ LogExpenseModal: () => <div>log-expense-dialog</div> }))
vi.mock('../features/scan-bill/ScanBillModal', () => ({ ScanBillModal: () => <div>scan-dialog</div> }))
vi.mock('../features/fill-gap/StatementModal', () => ({ StatementModal: () => <div>statement-dialog</div> }))
vi.mock('./ConfirmDialog', () => ({ SignOutDialog: () => null }))

const { ExpenseSidebar } = await import('./ExpenseSidebar')

beforeEach(() => {
  vi.clearAllMocks()
  allowed = true
  hidden = []
})

describe('ExpenseSidebar', () => {
  it('drops the entry points of features hidden in Features', () => {
    hidden = ['insights', 'askAviary', 'billScan']
    render(<ExpenseSidebar />)
    expect(screen.queryByText('Insights')).toBeNull()
    expect(screen.queryByText('Ask Aviary')).toBeNull()
    expect(screen.queryByText('Scan a bill')).toBeNull()
    expect(screen.getByText('Categories')).toBeTruthy()
  })

  it('keeps statement upload when bill scan is hidden, since catching up is core logging', () => {
    hidden = ['billScan']
    render(<ExpenseSidebar />)
    fireEvent.click(screen.getByText('Add from statement'))
    expect(screen.getByText('statement-dialog')).toBeTruthy()
  })

  it('opens and closes the mobile navigation accessibly', async () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    try {
      render(<ExpenseSidebar />)
      const menu = screen.getByRole('button', { name: 'Open navigation' })
      expect(menu.getAttribute('aria-expanded')).toBe('false')

      fireEvent.click(menu)
      expect(menu.getAttribute('aria-expanded')).toBe('true')
      expect(await screen.findByRole('dialog')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
      expect(menu.getAttribute('aria-expanded')).toBe('false')
    } finally {
      window.matchMedia = matchMedia
    }
  })

  it('exposes the primary navigation landmark', () => {
    render(<ExpenseSidebar />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
  })

  it('remembers the collapsed rail between visits', () => {
    render(<ExpenseSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(setCollapsed).toHaveBeenCalledWith('erd-sidebar-collapsed', true)
  })

  it('opens the log dialog when the account has access', () => {
    render(<ExpenseSidebar />)
    fireEvent.click(screen.getByText('Log expense'))
    expect(screen.getByText('log-expense-dialog')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('sends a locked account to the lock screen instead of opening dialogs', () => {
    allowed = false
    render(<ExpenseSidebar />)
    fireEvent.click(screen.getByText('Log expense'))
    fireEvent.click(screen.getByText('Scan a bill'))
    fireEvent.click(screen.getByText('Ask Aviary'))
    expect(screen.queryByText('log-expense-dialog')).toBeNull()
    expect(screen.queryByText('scan-dialog')).toBeNull()
    expect(openMoneyBrain).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/expense')
  })
})
