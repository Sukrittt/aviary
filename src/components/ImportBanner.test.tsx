import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ImportStatus } from '@/src/api/imports'

const getImportStatus = vi.fn()
const continueImport = vi.fn(async (_id: string, _retry?: boolean) => ({ ok: true }))
vi.mock('@/src/api/imports', () => ({
  getImportStatus: () => getImportStatus(),
  continueImport: (id: string, retry?: boolean) => continueImport(id, retry),
}))
vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

const { ImportBanner } = await import('./ImportBanner')

const base = { importId: 'imp1', done: 4210, total: 11240, failed: 0, startedAt: null, finishedAt: null, leased: true }
const show = (status: ImportStatus) => {
  getImportStatus.mockResolvedValue(status)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(<QueryClientProvider client={client}><ImportBanner /></QueryClientProvider>)
  return { client, container }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('ImportBanner', () => {
  it('says nothing without an import', async () => {
    show({ status: 'none' })
    await waitFor(() => expect(getImportStatus).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('counts rows while the history comes in, leaving a leased pass alone', async () => {
    show({ ...base, status: 'importing' })
    expect(await screen.findByText('Bringing in your history · 4,210 of 11,240')).toBeTruthy()
    expect(screen.getByText('Keep using Aviary. We’ll tell you when it’s in.')).toBeTruthy()
    expect(continueImport).not.toHaveBeenCalled()
  })

  it('starts the next pass when none holds the import', async () => {
    show({ ...base, status: 'importing', leased: false })
    await waitFor(() => expect(continueImport).toHaveBeenCalledWith('imp1', undefined))
  })

  it('nudges toward the recurring scan when done, and stays dismissed', async () => {
    show({ ...base, status: 'done', done: 11240 })
    expect(await screen.findByText('All 11,240 spends and paydays are in')).toBeTruthy()
    expect(screen.getByText('Want us to find your repeat payments?')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Find them' }).getAttribute('href')).toBe('/account/recurring?find=all')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('All 11,240 spends and paydays are in')).toBeNull()
    expect(window.localStorage.getItem('mc-import-done-dismissed-imp1')).toBe('1')
  })

  it('says when some rows didn’t make it in', async () => {
    show({ ...base, status: 'done', done: 11240, failed: 3 })
    expect(await screen.findByText('11,237 of 11,240 spends and paydays are in')).toBeTruthy()
  })

  it('throws confetti for an arrival they watched, not for a done banner they come back to', async () => {
    const { client, container } = show({ ...base, status: 'done', done: 11240 })
    await screen.findByText('All 11,240 spends and paydays are in')
    expect(container.querySelector('.setup-confetti')).toBeNull()

    getImportStatus.mockResolvedValue({ ...base, status: 'importing' })
    await client.refetchQueries({ queryKey: ['import-status'] })
    await screen.findByText(/^Bringing in your history/)
    getImportStatus.mockResolvedValue({ ...base, status: 'done', done: 11240 })
    await client.refetchQueries({ queryKey: ['import-status'] })
    await screen.findByText('All 11,240 spends and paydays are in')
    expect(container.querySelector('.setup-confetti')).toBeTruthy()
  })

  it('offers a retry when it failed', async () => {
    show({ ...base, status: 'failed' })
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(continueImport).toHaveBeenCalledWith('imp1', true))
  })
})
