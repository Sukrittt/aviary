import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const apply = vi.fn()
vi.mock('../api/referrals', async (orig) => ({ ...(await orig<typeof import('../api/referrals')>()), applyReferralCode: (c: string) => apply(c) }))
const { ReferralCodeEntry } = await import('./ReferralCodeEntry')

const view = () => render(<QueryClientProvider client={new QueryClient()}><ReferralCodeEntry /></QueryClientProvider>)

describe('ReferralCodeEntry', () => {
  beforeEach(() => apply.mockReset())

  it('uppercases what you type and confirms an applied code', async () => {
    apply.mockResolvedValueOnce(null)
    view()
    fireEvent.change(screen.getByLabelText('Got a code from a friend?'), { target: { value: 'k7 qm-4p' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Code applied'))
    expect(apply).toHaveBeenCalledWith('K7QM4P')
  })

  it('keeps the screen that shows it, so the confirmation stays up', async () => {
    apply.mockResolvedValueOnce(null)
    const client = new QueryClient()
    client.setQueryData(['referrals'], { code: 'MINE22', canEnterCode: true, referredBy: null })
    render(<QueryClientProvider client={client}><ReferralCodeEntry /></QueryClientProvider>)
    fireEvent.change(screen.getByLabelText('Got a code from a friend?'), { target: { value: 'priya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(client.getQueryData(['referrals'])).toMatchObject({ canEnterCode: true, referredBy: 'PRIYA' })
    expect(client.getQueryState(['referrals'])?.isInvalidated).toBe(false)
  })

  it.each([
    ['not_found', "That code doesn't exist"],
    ['too_late', 'first 7 days'],
    ['own_code', "That's your own code."],
    ['already_referred', "You've already used a code."],
    ['network', 'Check your connection'],
  ])('words %s for people', async (err, copy) => {
    apply.mockResolvedValueOnce(err)
    view()
    fireEvent.change(screen.getByLabelText('Got a code from a friend?'), { target: { value: 'ABCDEF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(copy))
  })
})
