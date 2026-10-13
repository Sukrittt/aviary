import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CurrencyProvider } from './CurrencyProvider'
import { useCurrency } from '@/src/context/CurrencyContext'
import { getUser } from '@/src/api/account'

let identity: { id: string } | null = null
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => ({ user: identity }) }))
vi.mock('@/src/api/account', () => ({ getUser: vi.fn(async () => ({ _id: identity?.id, currencyCode: identity?.id === 'a' ? 'USD' : 'EUR' })) }))
function Amount() { const { formatCurrency } = useCurrency(); return <span>{formatCurrency(500)}</span> }

describe('profile currency', () => {
  it('loads after sign-in, updates after a save, and isolates account switches', async () => {
    identity = null
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const tree = () => <QueryClientProvider client={client}><CurrencyProvider><Amount /></CurrencyProvider></QueryClientProvider>
    const { rerender, unmount } = render(tree())
    expect(screen.getByText('₹500')).toBeTruthy()
    identity = { id: 'a' }
    rerender(tree())
    await waitFor(() => expect(screen.getByText('$500')).toBeTruthy())
    act(() => { client.setQueryData(['user'], { _id: 'a', currencyCode: 'AED' }) })
    await waitFor(() => expect(screen.getByText('AED 500')).toBeTruthy())
    identity = { id: 'b' }
    rerender(tree())
    expect(screen.queryByText('AED 500')).toBeNull()
    await waitFor(() => expect(screen.getByText('€500')).toBeTruthy())
    identity = null
    rerender(tree())
    expect(screen.getByText('₹500')).toBeTruthy()
    expect(getUser).toHaveBeenCalled()
    unmount(); client.clear()
  })

  it("keeps the server-rendered profile when the session finishes loading for the same account", () => {
    // Home's HTML ships the profile in the cache; AuthKit only learns who's signed in after hydration.
    identity = null
    vi.mocked(getUser).mockClear()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    client.setQueryData(['user'], { _id: 'a', currencyCode: 'USD' })
    const tree = () => <QueryClientProvider client={client}><CurrencyProvider><Amount /></CurrencyProvider></QueryClientProvider>
    const { rerender, unmount } = render(tree())
    identity = { id: 'a' }
    rerender(tree())
    // Dropping it here blanks everything that reads the profile (hidden features, currency) for a frame.
    expect(client.getQueryData(['user'])).toEqual({ _id: 'a', currencyCode: 'USD' })
    expect(screen.getByText('$500')).toBeTruthy()
    expect(getUser).not.toHaveBeenCalled()
    unmount(); client.clear()
  })
})
