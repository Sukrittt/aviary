import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SetupWizardPage from './page'
import { updateUser } from '@/src/api/account'
import { completeOnboarding } from '@/src/api/billing'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/src/api/budgets', () => ({
  getBudgets: vi.fn(async () => []),
  updateBudget: vi.fn(async () => ({})),
}))
vi.mock('@/src/api/groups', () => ({ addGroup: vi.fn(async () => ({})) }))
vi.mock('@/src/api/categories', () => ({ addCategory: vi.fn(async () => ({})) }))
vi.mock('@/src/api/account', () => ({ updateUser: vi.fn(async patch => patch) }))
vi.mock('@/src/api/billing', () => ({
  completeOnboarding: vi.fn(async () => ({ onboardedAt: '2026-09-18T12:00:00.000Z', user: { currencyCode: 'USD' }, access: {} })),
}))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  render(<QueryClientProvider client={client}><SetupWizardPage /></QueryClientProvider>)
  return client
}

describe('currency onboarding', () => {
  it('selects currency before income, preserves it going back, and saves on completion', async () => {
    const client = setup()
    expect(screen.getByRole('heading', { name: 'Choose your currency' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: /US Dollar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('img', { name: '$0' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: /US Dollar/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: '$50,000' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ currencyCode: 'USD' }))
    // The trial's start instant is the server's, so the client no longer sends
    // an onboardedAt at all — it asks the server to complete onboarding.
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalled())
    await waitFor(() => expect(client.getQueryData(['user'])).toEqual(expect.objectContaining({ currencyCode: 'USD' })))
    client.clear()
  })
})
