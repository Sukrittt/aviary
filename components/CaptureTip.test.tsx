import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MANUAL_LOG_EVENT } from '@/src/lib/captureTip'
import { todayIST } from '@/src/lib/date'

const brain = vi.hoisted(() => ({ openCapture: vi.fn(), isMoneyBrainOpen: false }))
const data = vi.hoisted(() => ({ rows: [] as { date: string; source: string }[] }))
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/expense' }))
vi.mock('./MoneyBrainProvider', () => ({ useMoneyBrain: () => brain }))
vi.mock('@/src/hooks/useExpenses', () => ({ useRecentExpenses: () => ({ data: data.rows }) }))

const { CaptureTip } = await import('./CaptureTip')

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
  data.rows = [{ date: todayIST(), source: 'manual' }]
})

it('pops up after a second manual log, and Try it opens capture for good', () => {
  render(<CaptureTip />)
  expect(screen.queryByText('Logging a few?')).toBeNull()
  act(() => { window.dispatchEvent(new Event(MANUAL_LOG_EVENT)) })
  expect(screen.queryByText('Logging a few?')).toBeNull()
  act(() => { window.dispatchEvent(new Event(MANUAL_LOG_EVENT)) })
  fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
  expect(brain.openCapture).toHaveBeenCalled()
  const stored = (suffix: string) => window.localStorage.getItem(Object.keys(window.localStorage).find((k) => k.endsWith(suffix))!)
  expect(JSON.parse(stored('capture-tip')!)).toMatchObject({ shown: 1 })
  expect(stored('capture-tip-tried')).toBe('true')
})

it('greets someone back after a gap, and stays out of the way for anyone already typing spends', () => {
  data.rows = [{ date: '2020-01-01', source: 'manual' }]
  const { unmount } = render(<CaptureTip />)
  expect(screen.getByText('Been a couple of days?')).toBeInTheDocument()
  unmount()
  window.localStorage.clear()
  data.rows = [{ date: '2020-01-01', source: 'text' }]
  render(<CaptureTip />)
  expect(screen.queryByText('Been a couple of days?')).toBeNull()
})
