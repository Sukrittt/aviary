import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EnvelopeGrid } from './EnvelopeGrid'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/src/context/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (value: number) => `₹${value}` }),
}))

const envelope = {
  category: 'Rent', group: 'Essentials', assigned: 1000, spent: 250,
  available: 750, rolledOver: 0, isOverspent: false, spentPct: 25,
}

function setup(hideAmounts = false) {
  const onSetAssigned = vi.fn()
  render(<EnvelopeGrid envelopes={[envelope]} groups={['Essentials']}
    hideAmounts={hideAmounts} onManage={vi.fn()} onMoveMoney={vi.fn()}
    onAssignFromRTA={vi.fn()} onSetAssigned={onSetAssigned} />)
  return { onSetAssigned }
}

describe('EnvelopeGrid actions', () => {
  it('opens the existing money actions by tapping the row', async () => {
    const { onSetAssigned } = setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Rent/ }))
    expect(screen.getByRole('button', { name: /Rent/ })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Edit assigned amount' }))
    expect(onSetAssigned).toHaveBeenCalledWith('Rent')
    expect(screen.getByRole('button', { name: /Rent/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps amounts hidden in the updated row', () => {
    setup(true)
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
    expect(screen.getByText('Left')).toBeInTheDocument()
  })
})

describe('EnvelopeGrid menu', () => {
  it('closes the row menu on Escape', async () => {
    setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Rent/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Edit assigned amount' })).not.toBeInTheDocument()
  })
})

describe('EnvelopeGrid last spent label', () => {
  it('uses the local calendar day, not UTC', () => {
    // 01:30 on 25 Sep in IST is still 24 Sep in UTC.
    process.env.TZ = 'Asia/Kolkata'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-24T20:00:00Z'))
    try {
      render(<EnvelopeGrid envelopes={[{ ...envelope, lastSpentDate: '2026-09-25' }]} groups={['Essentials']}
        hideAmounts={false} onManage={vi.fn()} onMoveMoney={vi.fn()}
        onAssignFromRTA={vi.fn()} onSetAssigned={vi.fn()} />)
      expect(screen.getByText(/Last spent Today/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
