import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ImportStatus } from '@/src/api/imports'

const getImportStatus = vi.fn()
const continueImport = vi.fn(async () => ({ ok: true }))
vi.mock('@/src/api/imports', async (original) => ({
  ...(await original<typeof import('@/src/api/imports')>()),
  getImportStatus: () => getImportStatus(),
  continueImport: () => continueImport(),
}))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

const { ImportHistory } = await import('./ImportFlow')

const base = { importId: 'imp1', total: 135, failed: 0, startedAt: null, finishedAt: null, leased: true }
const show = (status: ImportStatus) => {
  getImportStatus.mockResolvedValue(status)
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ImportHistory total={135} /></QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('ImportHistory', () => {
  it('counts the history in while it is booked', async () => {
    show({ ...base, status: 'importing', done: 50 })
    expect(screen.getByText('Bringing in your history')).toBeTruthy()
    expect(await screen.findByText(/^50 of 135/)).toBeTruthy()
  })

  it('ends on a check once every row is in', async () => {
    show({ ...base, status: 'done', done: 135 })
    expect(await screen.findByText('All 135 spends and paydays are in')).toBeTruthy()
  })

  it('is honest when some rows failed', async () => {
    show({ ...base, status: 'done', done: 135, failed: 2 })
    expect(await screen.findByText('133 of 135 spends and paydays are in')).toBeTruthy()
  })
})
