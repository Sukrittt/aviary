import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => '/account', useRouter: () => ({ push }) }))

let allowed = true
vi.mock('../hooks/useBillingStatus', () => ({ useAccessAllowed: () => allowed, useBillingStatus: () => ({ data: undefined }) }))

const openMoneyBrain = vi.fn()
vi.mock('@/components/MoneyBrainProvider', () => ({ useMoneyBrain: () => ({ openMoneyBrain }) }))
let theme = 'dark'
vi.mock('@/components/AppearanceProvider', () => ({ useAppearance: () => ({ theme, setTheme: vi.fn() }) }))
const setCollapsed = vi.fn()
vi.mock('../hooks/usePersistentState', () => ({ usePersistentState: (k: string, v: unknown) => [v, (next: unknown) => setCollapsed(k, next)] }))
let hidden: string[] = []
vi.mock('../hooks/useUser', () => ({ useHiddenFeatures: () => hidden }))
vi.mock('./LogExpenseModal', () => ({ LogExpenseModal: () => <div>log-expense-dialog</div> }))
vi.mock('../features/fill-gap/StatementModal', () => ({ StatementModal: () => <div>statement-dialog</div> }))
vi.mock('./ConfirmDialog', () => ({ SignOutDialog: () => null }))
vi.mock('../hooks/useSpaces', () => ({ useSpaces: () => ({ multi: false, budgets: [] }) }))

const { ExpenseSidebar } = await import('./ExpenseSidebar')

beforeEach(() => {
  vi.clearAllMocks()
  allowed = true
  hidden = []
  theme = 'dark'
})

describe('ExpenseSidebar', () => {
  it('drops the entry points of features hidden in Features', () => {
    hidden = ['insights', 'askAviary']
    render(<ExpenseSidebar />)
    expect(screen.queryByText('Insights')).toBeNull()
    expect(screen.queryByText('Ask Aviary')).toBeNull()
    expect(screen.getByText('Categories')).toBeTruthy()
  })

  it('lists Plan pages and drops the hidden ones', () => {
    hidden = ['investments']
    render(<ExpenseSidebar />)
    expect(screen.getByText('Recurring').closest('a')?.getAttribute('href')).toBe('/account/recurring')
    expect(screen.getByText('Subscriptions')).toBeTruthy()
    expect(screen.getByText('Income')).toBeTruthy()
    expect(screen.queryByText('Investments')).toBeNull()
  })

  it('opens statement upload from the sidebar', () => {
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

  it('moves one hover pill to whichever row is under the pointer', () => {
    render(<ExpenseSidebar />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const pills = () => [...nav.querySelectorAll('li > span.absolute')].map((pill) => pill.parentElement?.textContent)

    fireEvent.mouseEnter(screen.getByText('Activity').closest('li')!)
    expect(pills()).toEqual(['Activity'])
    fireEvent.mouseEnter(screen.getByText('Categories').closest('li')!)
    expect(pills()).toEqual(['Categories'])
    fireEvent.mouseLeave(nav)
    expect(pills()).toEqual([])
  })

  it('keeps the hover pill on the theme row when its label flips', () => {
    const { rerender } = render(<ExpenseSidebar />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    fireEvent.mouseEnter(screen.getByText('Light mode').closest('li')!)
    theme = 'light'
    rerender(<ExpenseSidebar />)
    expect([...nav.querySelectorAll('li > span.absolute')].map((pill) => pill.parentElement?.textContent)).toEqual(['Dark mode'])
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
    fireEvent.click(screen.getByText('Ask Aviary'))
    expect(screen.queryByText('log-expense-dialog')).toBeNull()
    expect(openMoneyBrain).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/expense')
  })
})
