import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MoneyBrainDrawer } from './MoneyBrainDrawer'

const state = vi.hoisted(() => ({ hidden: false, theme: 'light' as 'light' | 'dark' | null }))
vi.mock('@/components/AppearanceProvider', () => ({ useAppearance: () => ({ theme: state.theme }) }))
vi.mock('../hooks/useBudgets', () => ({ useBudgets: () => ({ data: [] }) }))
vi.mock('../hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: [] }), useAddExpense: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('../hooks/useGroups', () => ({ useGroups: () => ({ data: [] }) }))
vi.mock('../hooks/useHideAmounts', () => ({ useHideAmounts: () => [state.hidden] }))
vi.mock('../hooks/useChatSessions', () => ({ useChatSessions: () => ({}), useChatSessionsCount: () => ({ data: 5 }) }))
vi.mock('../hooks/useMoneyBrief', () => ({ useMoneyBrief: () => ({ data: {
  narrative: 'Your monthly brief.', meta: { txnCountThisMonth: 58 }, questions: [],
  cards: [{ title: 'Monthly Rent', subtitle: 'Largest single spend', icon: '🏠', amount: 12000, valueLabel: 'INR', tone: 'violet' }],
} }) }))
vi.mock('@/src/api/ai', () => ({
  getChatSession: vi.fn(),
  streamChat: vi.fn(),
  updateProposalStatus: vi.fn(async () => {}),
  CAPTURE_FAILED_MESSAGE: "I couldn't read that one. Try again, or add it with the + button.",
}))
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
it('links the reply to logged spends to Activity', async () => {
  const { getChatSession } = await import('@/src/api/ai')
  vi.mocked(getChatSession).mockResolvedValue({
    id: 's1',
    messages: [{ role: 'user', text: 'auto 240' }, { role: 'model', text: 'Auto’s in. All set.', ack: true }],
  } as Awaited<ReturnType<typeof getChatSession>>)
  render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer initialSessionId="s1" onClose={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByText('Auto’s in. All set.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See them in Activity' })).toHaveAttribute('href', '/expense/transactions')
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

async function type(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask Aviary' }), { target: { value: text } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
  })
}
const proposal = {
  id: 'p1',
  items: [{ id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-10-07', category: '', categoryConfidence: null }],
  skipped: [],
  unparsed: [],
}
it('asks for capture proposals and shows the review card under the reply', async () => {
  const { streamChat } = await import('@/src/api/ai')
  vi.mocked(streamChat).mockImplementation(async (_s, _m, onDelta, _signal, onProposal) => {
    onProposal?.(proposal)
    onDelta('Here’s what I got. Check it before it’s logged.')
    return 's9'
  })
  show()
  await type('auto 240')
  expect(screen.getByText('Here’s what I got. Check it before it’s logged.')).toBeInTheDocument()
  expect(screen.getByTestId('capture-review')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'What you paid for' })).toHaveValue('Auto')
})
it('records a dismissed card on the chat', async () => {
  const { streamChat, updateProposalStatus } = await import('@/src/api/ai')
  vi.mocked(streamChat).mockImplementation(async (_s, _m, onDelta, _signal, onProposal) => {
    onProposal?.(proposal)
    onDelta('Got it.')
    return 's9'
  })
  show()
  await type('auto 240')
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
  expect(updateProposalStatus).toHaveBeenCalledWith('s9', 'p1', 'dismissed', [])
  expect(screen.getByTestId('capture-summary')).toHaveTextContent('Not logged')
})
it('offers manual entry when a typed spend could not be read', async () => {
  const { streamChat } = await import('@/src/api/ai')
  vi.mocked(streamChat).mockRejectedValue(new Error("I couldn't read that one. Try again, or add it with the + button."))
  const onLogManually = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer onLogManually={onLogManually} onClose={vi.fn()} /></QueryClientProvider>)
  await type('asdf qwer')
  expect(screen.getByText("Couldn't read that one. Add it by hand?")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add it by hand' }))
  expect(onLogManually).toHaveBeenCalled()
})
it('opens straight to typing spends in capture mode, without the money brief', () => {
  render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer capture onClose={vi.fn()} /></QueryClientProvider>)
  expect(screen.queryByText('Your monthly brief.')).toBeNull()
  expect(screen.getByText('Log several at once')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Ask Aviary' })).toHaveAttribute('placeholder', 'What did you spend?')
})

it('records an outcome picked mid-stream once the chat exists, retrying while the reply saves', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const { streamChat, updateProposalStatus } = await import('@/src/api/ai')
  vi.mocked(updateProposalStatus).mockReset().mockRejectedValueOnce(new Error('Failed to update proposal: 404')).mockResolvedValue(null)
  let finish!: (id: string) => void
  vi.mocked(streamChat).mockImplementation((_s, _m, onDelta, _signal, onProposal) => {
    onProposal?.(proposal)
    onDelta('Got it.')
    return new Promise((resolve) => (finish = resolve))
  })
  show()
  await type('auto 240')
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
  expect(updateProposalStatus).not.toHaveBeenCalled()

  await act(async () => {
    finish('s9')
  })
  expect(updateProposalStatus).toHaveBeenCalledWith('s9', 'p1', 'dismissed', [])
  await act(async () => {
    vi.advanceTimersByTime(700)
  })
  expect(updateProposalStatus).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})
it('heads the reply to logged spends with how many were logged', async () => {
  const { getChatSession } = await import('@/src/api/ai')
  vi.mocked(getChatSession).mockResolvedValue({
    id: 's1',
    messages: [
      { role: 'user', text: 'auto 240, lunch 150' },
      { role: 'model', text: 'Here’s what I got.', proposal: { id: 'p1', items: [], skipped: [], unparsed: [], status: 'submitted', expenseIds: ['a', 'b'] } },
      { role: 'model', text: 'Lunch sounds like it was worth it.', ack: true },
    ],
  } as unknown as Awaited<ReturnType<typeof getChatSession>>)
  render(<QueryClientProvider client={new QueryClient()}><MoneyBrainDrawer initialSessionId="s1" onClose={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByText('2 spends logged')).toBeInTheDocument()
})
