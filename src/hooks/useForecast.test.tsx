import { beforeEach, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForecast } from './useForecast'

const mocks = vi.hoisted(() => ({ user: { data: undefined as unknown, isPending: true } }))
vi.mock('./useUser', async (orig) => ({ ...(await orig<object>()), useUser: () => mocks.user }))
vi.mock('./useBudgets', () => ({ useBudgets: () => ({ dataUpdatedAt: 0 }) }))
vi.mock('@/src/api/forecast', () => ({ getForecast: () => new Promise(() => {}) }))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => { mocks.user = { data: undefined, isPending: true } })

it('counts as loading while the profile is still on its way', () => {
  const { result } = renderHook(() => useForecast(), { wrapper })
  expect(result.current.isPending).toBe(true)
})

it('steps aside once the profile says Insights is hidden', () => {
  mocks.user = { data: { hiddenFeatures: ['insights'] }, isPending: false }
  const { result } = renderHook(() => useForecast(), { wrapper })
  expect(result.current.isPending).toBe(false)
  expect(result.current.data).toBeUndefined()
})
