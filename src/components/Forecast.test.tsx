import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Forecast } from '@/lib/forecast'
import { ForecastCard } from './Forecast'

const mocks = vi.hoisted(() => ({ forecast: null as unknown as Forecast }))
vi.mock('@/src/hooks/useForecast', () => ({ useForecast: () => ({ data: mocks.forecast }) }))
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

beforeEach(() => { mocks.forecast = base })

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
