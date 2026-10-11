import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountsPage } from './AccountsPage'

const { push, updateMutation } = vi.hoisted(() => ({ push: vi.fn(), updateMutation: vi.fn(async () => undefined) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('../hooks/useAccounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '1' }], isLoading: false, isError: false }),
  liveAccounts: (rows: { archived: boolean }[]) => rows.filter((a) => !a.archived),
  useAddAccount: () => ({ mutateAsync: vi.fn() }),
  useUpdateAccount: () => ({ mutateAsync: updateMutation, isPending: false }),
}))
vi.mock('../hooks/useBalanceCheck', () => ({ useBalanceStatus: () => ({ isLoading: false, data: { accounts: [] } }) }))

describe('AccountsPage', () => {
  it("opens an account's transactions and deletes it by archiving after a confirm", async () => {
    render(<AccountsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'View HDFC transactions' }))
    expect(push).toHaveBeenCalledWith('/expense/transactions?account=a1')
    fireEvent.click(screen.getByRole('button', { name: 'Delete HDFC' }))
    expect(updateMutation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(updateMutation).toHaveBeenCalledWith({ id: 'a1', updates: { archived: true } }))
  })
})
