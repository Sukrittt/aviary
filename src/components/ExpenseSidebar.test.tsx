import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => '/account', useRouter: () => ({ push }) }))

let allowed = true
vi.mock('../hooks/useBillingStatus', () => ({ useAccessAllowed: () => allowed }))

const openMoneyBrain = vi.fn()
vi.mock('@/components/MoneyBrainProvider', () => ({ useMoneyBrain: () => ({ openMoneyBrain }) }))
vi.mock('@/components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: 'dark', setTheme: vi.fn() }) }))
vi.mock('../hooks/usePersistentState', () => ({ usePersistentState: (_k: string, v: unknown) => [v, vi.fn()] }))
vi.mock('./LogExpenseModal', () => ({ LogExpenseModal: () => <div>log-expense-dialog</div> }))
vi.mock('../features/scan-bill/ScanBillModal', () => ({ ScanBillModal: () => <div>scan-dialog</div> }))
vi.mock('./ConfirmDialog', () => ({ SignOutDialog: () => null }))

const { ExpenseSidebar } = await import('./ExpenseSidebar')

beforeEach(() => {
  vi.clearAllMocks()
  allowed = true
})

describe('ExpenseSidebar', () => {
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
