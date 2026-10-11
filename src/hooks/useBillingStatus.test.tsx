import { it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { verifyPayPalCheckout } from '@/src/api/billing'
import { usePayPalReturn } from './useBillingStatus'

vi.mock('@/src/api/billing', () => ({ verifyPayPalCheckout: vi.fn() }))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn(), setEventContext: vi.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/account?checkout=paypal&subscription_id=I-1&ba_token=x')
})

it('retries while PayPal is unreachable, keeping the id in the URL until it confirms', async () => {
  ;(verifyPayPalCheckout as Mock)
    .mockResolvedValueOnce({ mode: 'expired', refreshed: false })
    .mockResolvedValueOnce({ mode: 'paid', allowed: true, basePlanId: 'yearly' })
  const { result } = renderHook(() => usePayPalReturn(), { wrapper })
  expect(result.current).toBe('confirming')
  await waitFor(() => expect(verifyPayPalCheckout).toHaveBeenCalledTimes(1))
  expect(window.location.search).toContain('subscription_id=I-1')
  await waitFor(() => expect(result.current).toBe('paid'), { timeout: 3000 })
  expect(verifyPayPalCheckout).toHaveBeenLastCalledWith('I-1')
  expect(window.location.search).toBe('')
})

it('reports a cancelled checkout and tidies the URL', async () => {
  window.history.replaceState(null, '', '/account?checkout=paypal-cancelled&token=x')
  const { result } = renderHook(() => usePayPalReturn(), { wrapper })
  expect(result.current).toBe('cancelled')
  await waitFor(() => expect(window.location.search).toBe(''))
  expect(verifyPayPalCheckout).not.toHaveBeenCalled()
})
