import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Forecast } from '@/lib/forecast'
import { ForecastCard, ForecastLine } from './Forecast'

const mocks = vi.hoisted(() => ({ forecast: null as unknown as Forecast | undefined, isPending: false }))
vi.mock('@/src/hooks/useForecast', () => ({ useForecast: () => ({ data: mocks.forecast, isPending: mocks.isPending }) }))
vi.mock('@/src/context/CurrencyContext', () => ({ useCurrency: () => ({ formatCurrency: (n: number) => `₹${n.toLocaleString('en-IN')}` }) }))

const env = (category: string, projected: number, extra: Partial<Forecast['envelopes'][number]> = {}) => (
  { category, available: 500, scheduled: 0, usualDaily: 10, projected, runsOutOn: null, overspent: false, ...extra }
)
const base: Forecast = {
  basis: 'history',
  daysLeft: 12,
  totalLeft: 3800,
  envelopes: [env('Food', -200, { runsOutOn: '2026-10-30' })],
  nextMonth: { month: '2026-11', income: 0, spokenFor: 0, free: 0 },
}

beforeEach(() => { mocks.forecast = base; mocks.isPending = false; localStorage.clear() })

function renderCard(onTopUp = vi.fn()) {
  render(<ForecastCard hideAmounts={false} icon={() => null} onTopUp={onTopUp} />)
  return onTopUp
}

it('frames a shortfall kindly and tops it up with the rounded gap', () => {
  const onTopUp = renderCard()
  expect(screen.getByText('Covered till 30 Oct')).toBeTruthy()
  expect(screen.getByText("There's enough elsewhere to cover the gap.")).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Top up Food' }))
  expect(onTopUp).toHaveBeenCalledWith('Food', 200)
})

it('skips the reassurance when the gaps outweigh what is left', () => {
  mocks.forecast = { ...base, totalLeft: -500 }
  renderCard()
  expect(screen.queryByText(/enough elsewhere/)).toBeNull()
})

it('shows the most urgent rows first and the rest on tap', () => {
  mocks.forecast = { ...base, envelopes: [...['A', 'B', 'C', 'D', 'E'].map((c) => env(c, 400)), ...base.envelopes] }
  renderCard()
  expect(screen.getByText('Food')).toBeTruthy()
  expect(screen.queryByText('E')).toBeNull()
  fireEvent.click(screen.getByText('Show all 6'))
  expect(screen.getByText('E')).toBeTruthy()
  fireEvent.click(screen.getByText('Show fewer'))
  expect(screen.queryByText('E')).toBeNull()
})

it('holds its place with a skeleton while loading, and steps aside if it fails', () => {
  mocks.forecast = undefined
  mocks.isPending = true
  const { unmount } = render(<ForecastCard hideAmounts={false} icon={() => null} onTopUp={vi.fn()} />)
  expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
  unmount()
  mocks.isPending = false
  const { container } = render(<ForecastCard hideAmounts={false} icon={() => null} onTopUp={vi.fn()} />)
  expect(container.innerHTML).toBe('')
})

describe('ForecastLine', () => {
  it('stays off Home when nothing runs out', () => {
    mocks.forecast = { ...base, envelopes: [env('Food', 400)] }
    const { container } = render(<ForecastLine />)
    expect(container.innerHTML).toBe('')
  })

  it('warns about the envelope running out, linking to the forecast', () => {
    render(<ForecastLine />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/insights#forecast')
    expect(screen.getByRole('link').textContent).toBe('Food runs out around 30\u00a0Oct')
  })

  it('goes away on Okay and stays gone for that envelope and date', async () => {
    const first = render(<ForecastLine />)
    fireEvent.click(screen.getByRole('button', { name: 'Okay' }))
    // Leaves through its fold-up exit rather than snapping out.
    await waitFor(() => expect(first.container.innerHTML).toBe(''))
    first.unmount()
    expect(render(<ForecastLine />).container.innerHTML).toBe('')
  })

  it('comes back once the forecast names a new date', () => {
    const first = render(<ForecastLine />)
    fireEvent.click(screen.getByRole('button', { name: 'Okay' }))
    first.unmount()
    mocks.forecast = { ...base, envelopes: [env('Food', -200, { runsOutOn: '2026-10-27' })] }
    render(<ForecastLine />)
    expect(screen.getByRole('link').textContent).toBe('Food runs out around 27\u00a0Oct')
  })
})
