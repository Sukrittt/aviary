import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MoneyBrainDrawer } from './MoneyBrainDrawer'

const state = vi.hoisted(() => ({ hidden: false, theme: 'light' as 'light' | 'dark' | null }))
vi.mock('@/components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: state.theme }) }))
vi.mock('../hooks/useBudgets', () => ({ useBudgets: () => ({ data: [] }) }))
vi.mock('../hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: [] }) }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('../hooks/useGroups', () => ({ useGroups: () => ({ data: [] }) }))
vi.mock('../hooks/useHideAmounts', () => ({ useHideAmounts: () => [state.hidden] }))
vi.mock('../hooks/useChatSessions', () => ({ useChatSessions: () => ({}), useChatSessionsCount: () => ({ data: 5 }) }))
vi.mock('../hooks/useMoneyBrief', () => ({ useMoneyBrief: () => ({ data: {
  narrative: 'Your monthly brief.', meta: { txnCountThisMonth: 58 }, questions: [],
  cards: [{ title: 'Monthly Rent', subtitle: 'Largest single spend', icon: '🏠', amount: 12000, valueLabel: 'INR', tone: 'violet' }],
} }) }))
vi.mock('@/src/api/ai', () => ({ getChatSession: vi.fn(), streamChat: vi.fn() }))
beforeEach(() => { state.hidden = false; state.theme = 'light'; Element.prototype.scrollTo = vi.fn() })
function show() {
  return render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer onClose={vi.fn()} /></QueryClientProvider>)
}
it('follows the selected app theme outside the page shell and updates while open', () => {
  const client = new QueryClient()
  const drawer = () => <QueryClientProvider client={client}><MoneyBrainDrawer onClose={vi.fn()} /></QueryClientProvider>
  const { rerender } = render(drawer())
  expect(screen.getByRole('dialog').closest('.theme-light')).not.toBeNull()
  state.theme = 'dark'
  rerender(drawer())
  expect(screen.getByRole('dialog').closest('.theme-dark')).not.toBeNull()
  expect(screen.getByRole('dialog').closest('.theme-light')).toBeNull()
})
it('lets the system palette paint before the app theme resolves', () => {
  state.theme = null
  show()
  expect(screen.getByRole('dialog').closest('.theme-light, .theme-dark')).toBeNull()
})
it('renders the actual insight amount alongside its label', () => {
  show()
  expect(screen.getByText('₹12,000')).toBeInTheDocument()
  expect(screen.getByText('INR')).toBeInTheDocument()
})
it('keeps insight amounts private when amounts are hidden', () => {
  state.hidden = true
  show()
  expect(screen.queryByText('₹12,000')).not.toBeInTheDocument()
})
it('uses a centered vector icon instead of a font glyph in the header', () => {
  const { container } = show()
  expect(container.querySelector('.brain-orbit svg')).not.toBeNull()
})
it('renders markdown answers and keeps the brief visible once a chat starts', async () => {
  const { getChatSession } = await import('@/src/api/ai')
  vi.mocked(getChatSession).mockResolvedValue({
    id: 's1',
    messages: [
      { role: 'user', text: 'Where did it go?' },
      { role: 'model', text: 'Mostly **rent**.\n- Rent\n- Food' },
    ],
  } as Awaited<ReturnType<typeof getChatSession>>)
  render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer initialSessionId="s1" onClose={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByText('rent')).toHaveProperty('tagName', 'STRONG')
  expect(screen.getByText('Food').tagName).toBe('LI')
  expect(screen.getByText('Your monthly brief.')).toBeInTheDocument()
})
it('restores the chat left open last time, minus a reply cut off mid-stream', () => {
  const openChat = { current: { sessionId: 's2', messages: [
    { role: 'user' as const, text: 'How much is left?' },
    { role: 'model' as const, text: 'About **₹45,000**.' },
    { role: 'user' as const, text: 'And per day?' },
    { role: 'model' as const, text: '' },
  ] } }
  const { unmount } = render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer openChat={openChat} onClose={vi.fn()} /></QueryClientProvider>)
  expect(screen.getByText('And per day?')).toBeInTheDocument()
  unmount()
  expect(openChat.current.sessionId).toBe('s2')
  expect(openChat.current.messages).toHaveLength(3)
})
