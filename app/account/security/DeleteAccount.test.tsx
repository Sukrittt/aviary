import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const getSharedBudgets = vi.hoisted(() => vi.fn())
vi.mock('@/src/api/spaces', () => ({ getSharedBudgets }))
vi.mock('@/src/hooks/useBillingStatus', () => ({ useBillingStatus: () => ({ data: undefined }) }))

const { DeleteAccount } = await import('./DeleteAccount')

const fetchMock = vi.fn()
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body)

async function confirmWithEmail() {
  fireEvent.change(await screen.findByLabelText('Your email'), { target: { value: 'me@x.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/user', expect.objectContaining({ method: 'DELETE' })))
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue({ ok: false, status: 500 })
  vi.stubGlobal('fetch', fetchMock)
})

describe('DeleteAccount', () => {
  it('with no shared budgets, goes straight to the email confirm', async () => {
    getSharedBudgets.mockResolvedValue({ budgets: [] })
    render(<DeleteAccount email="me@x.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await confirmWithEmail()
    expect(screen.queryByText('Your shared budgets')).toBeNull()
    expect(sentBody()).toEqual({ email: 'me@x.com' })
  })

  it('asks who gets each shared budget, then sends the hand-overs', async () => {
    getSharedBudgets.mockResolvedValue({
      budgets: [
        { id: 's1', name: 'Home', emoji: '🏠', personal: false, members: [{ userId: 'u2', name: 'Rahul' }, { userId: 'u3', name: 'Asha' }] },
        { id: 's2', name: 'Trip', emoji: '✈️', personal: false, members: [{ userId: 'u4', name: 'Dev' }] },
        { id: 's3', name: 'Studio', emoji: '💼', personal: false, members: [{ userId: 'u5', name: 'Mira' }] },
      ],
    })
    render(<DeleteAccount email="me@x.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByText('Your shared budgets')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hand it to Rahul' })).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('radio', { name: 'Hand it to Asha' }))
    fireEvent.click(screen.getAllByRole('radio', { name: 'Close it' })[1])
    expect(screen.getByText('Everyone in it loses access. It comes back if you restore your account within 7 days.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await confirmWithEmail()
    expect(sentBody()).toEqual({ email: 'me@x.com', transfers: { s1: 'u3', s3: 'u5' } })
  })

  it('tells unnamed members apart by when they joined', async () => {
    getSharedBudgets.mockResolvedValue({
      budgets: [{ id: 's1', name: 'Home', emoji: '🏠', personal: false, members: [{ userId: 'u2', name: null, joinedAt: '2026-10-18T10:00:00Z' }, { userId: 'u3', name: null, joinedAt: '2026-10-19T10:00:00Z' }, { userId: 'u4', name: null }] }],
    })
    render(<DeleteAccount email="me@x.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByRole('radio', { name: 'Hand it to whoever joined 18 Oct 2026' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hand it to whoever joined 19 Oct 2026' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Hand it to them' })).toBeTruthy()
  })

  it("won't go on without the list", async () => {
    getSharedBudgets.mockRejectedValue(new Error('500'))
    render(<DeleteAccount email="me@x.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Check your connection and try again.')
    expect(screen.queryByLabelText('Your email')).toBeNull()
  })
})
