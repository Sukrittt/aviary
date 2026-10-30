import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LeadPitch } from './LeadPitch'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
afterEach(() => { document.cookie = 'aviary_market=; max-age=0; path=/' })

const href = () => screen.getByRole('link').getAttribute('href')

it('sends an India visitor to the salary planner', () => {
  render(<LeadPitch placement="test" />)
  expect(href()).toBe('/tools/salary-budget-planner')
})

it('sends a visitor outside India to the paycheck planner, on any page', () => {
  document.cookie = 'aviary_market=intl; path=/'
  render(<LeadPitch placement="test" />)
  expect(href()).toBe('/tools/paycheck-budget-planner')
})
