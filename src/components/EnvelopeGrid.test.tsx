import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EnvelopeGrid } from './EnvelopeGrid'
import { avatarStyleFor } from '../lib/emoji'
import { weekPace } from '../lib/weekly'
vi.mock('../hooks/useCategories', () => ({ useCategoryStyle: () => (name: string) => avatarStyleFor(name), useCategoryColors: () => new Map() }))

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
    const item = await screen.findByRole('menuitem', { name: 'Edit assigned amount' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Rent/ })).toHaveAttribute('aria-expanded', 'true'))
    await user.click(item)
    expect(onSetAssigned).toHaveBeenCalledWith('Rent')
    await waitFor(() => expect(screen.getByRole('button', { name: /Rent/ })).toHaveAttribute('aria-expanded', 'false'))
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
    expect(await screen.findByRole('menuitem', { name: 'Edit assigned amount' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Edit assigned amount' })).not.toBeInTheDocument())
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

  // The server renders this label too (app/expense/page.tsx), and Vercel runs in
  // UTC. It has to come out the same there as in an Indian browser, or hydration
  // fails between midnight and 05:30 IST.
  it.each([
    ['2026-09-25', 'Today'],
    ['2026-09-24', 'Yesterday'],
    ['2026-09-22', '3d ago'],
    ['2026-07-01', '1 Jul'],
  ])('labels %s as %s in IST, even from a UTC process', (lastSpentDate, label) => {
    process.env.TZ = 'UTC'
    vi.useFakeTimers({ toFake: ['Date'] })
    // 01:30 on 25 Sep in IST; 24 Sep in UTC.
    vi.setSystemTime(new Date('2026-09-24T20:00:00Z'))
    try {
      render(<EnvelopeGrid envelopes={[{ ...envelope, lastSpentDate }]} groups={['Essentials']}
        hideAmounts={false} onManage={vi.fn()} onMoveMoney={vi.fn()}
        onAssignFromRTA={vi.fn()} onSetAssigned={vi.fn()} />)
      expect(screen.getByText(new RegExp(`Last spent ${label}$`))).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      process.env.TZ = 'Asia/Kolkata'
    }
  })
})

function renderOne(overrides: Partial<typeof envelope> & { isOverspent?: boolean }) {
  const { container } = render(<EnvelopeGrid envelopes={[{ ...envelope, ...overrides }]} groups={['Essentials']}
    hideAmounts={false} onManage={vi.fn()} onMoveMoney={vi.fn()}
    onAssignFromRTA={vi.fn()} onSetAssigned={vi.fn()} />)
  return container
}

describe('EnvelopeGrid row status', () => {
  it('drops the used percentage, since the bar already shows it', () => {
    renderOne({})
    expect(screen.queryByText(/Used/)).not.toBeInTheDocument()
    expect(screen.getByText(/Last spent/)).toBeInTheDocument()
  })

  // Red means overspent and nothing else, so almost-out stays amber.
  it('keeps an almost-empty envelope amber, not red', () => {
    const c = renderOne({ spent: 960, available: 40, spentPct: 96 })
    expect(c.querySelector('.env-bar-fill')).toHaveClass('is-warn')
    expect(c.querySelector('.env2-pill')).toHaveClass('is-low')
  })

  it('goes red only when overspent', () => {
    const c = renderOne({ spent: 1200, available: -200, spentPct: 100, isOverspent: true })
    expect(c.querySelector('.env-bar-fill')).toHaveClass('is-coral')
    expect(c.querySelector('.env2-pill')).toHaveClass('is-over')
  })

  it('calls out spending with nothing assigned instead of "of ₹0" and ∞', () => {
    renderOne({ assigned: 0, spent: 713, available: -713, spentPct: 100, isOverspent: true })
    expect(screen.getByText(/Not budgeted/)).toBeInTheDocument()
    expect(screen.queryByText(/∞/)).not.toBeInTheDocument()
    expect(screen.queryByText('of')).not.toBeInTheDocument()
  })

  it('shows the group total neutral, and "over" when the group is overspent', () => {
    renderOne({ spent: 1200, available: -200, spentPct: 100, isOverspent: true })
    expect(screen.getByText('Over in group')).toBeInTheDocument()
    expect(screen.getByText('₹200')).toBeInTheDocument()
  })
})

describe('EnvelopeGrid carry', () => {
  it('adds no line for what carried; the Left amount already includes it', () => {
    render(<EnvelopeGrid groups={['Essentials']} hideAmounts={false}
      envelopes={[
        { ...envelope, category: 'Groceries', available: 2800, rolledOver: 2050 },
        { ...envelope, category: 'Eating out', available: 200, rolledOver: -550 },
      ]}
      onManage={vi.fn()} onMoveMoney={vi.fn()} onAssignFromRTA={vi.fn()} onSetAssigned={vi.fn()} />)
    expect(screen.queryByText(/from October|short/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('₹2800')).toBeInTheDocument()
    expect(screen.getByLabelText('₹200')).toBeInTheDocument()
  })

  it('explains the carry in a tooltip on the chip', async () => {
    render(<EnvelopeGrid groups={['Essentials']} hideAmounts={false} month="2026-11"
      envelopes={[
        { ...envelope, category: 'Groceries', available: 2800, rolledOver: 2050 },
        { ...envelope, category: 'Eating out', available: 200, rolledOver: -550 },
        { ...envelope, category: 'Rent', available: 750, rolledOver: 0 },
      ]}
      onManage={vi.fn()} onMoveMoney={vi.fn()} onAssignFromRTA={vi.fn()} onSetAssigned={vi.fn()} />)
    const user = userEvent.setup()
    await user.hover(screen.getByLabelText('₹2800'))
    expect(await screen.findByText('+₹2050 from October')).toBeInTheDocument()
    await user.hover(screen.getByLabelText('₹200'))
    expect(await screen.findByText('₹550 short from October')).toBeInTheDocument()
    // Nothing carried, nothing to explain.
    expect(screen.getByLabelText('₹750').closest('[tabindex]')).toBeNull()
  })
})

describe('EnvelopeGrid weekly pacing', () => {
  // Groceries in October 2026, checked on Thursday the 29th.
  const days = new Array(31).fill(0)
  days[0] = 400
  days[5] = 1050
  days[12] = 880
  days[19] = 1130
  days[28] = 380
  const pace = weekPace(4121.4, days, '2026-10', 29)
  const groceries = { category: 'Groceries', group: 'Essentials', assigned: 4121.4, spent: 3840, available: 281.4, rolledOver: 0, isOverspent: false, spentPct: 93 }

  function weeklySetup(onToggleWeekly = vi.fn()) {
    const { container } = render(<EnvelopeGrid envelopes={[groceries, envelope]} groups={['Essentials']}
      hideAmounts={false} onManage={vi.fn()} onMoveMoney={vi.fn()} onAssignFromRTA={vi.fn()} onSetAssigned={vi.fn()}
      paces={new Map([['Groceries', pace]])} weekly={new Map([['Groceries', '2026-10-01']])} onToggleWeekly={onToggleWeekly} />)
    return { container, onToggleWeekly }
  }

  it('keeps the month bar, adds one pace tick, and says how this week is going', () => {
    const { container } = weeklySetup()
    expect(screen.getByText('On track this week')).toBeInTheDocument()
    expect(screen.getByText('2d left')).toBeInTheDocument()
    expect(container.querySelectorAll('.env2-tick')).toHaveLength(1)
    // The plain row next to it is unchanged.
    expect(screen.getByText(/Last spent/)).toBeInTheDocument()
  })

  it('lists the weeks in the row menu and flips the switch', async () => {
    const { onToggleWeekly } = weeklySetup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Groceries/ }))
    expect(await screen.findByText('Week 1')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Track weekly' }))
    expect(onToggleWeekly).toHaveBeenCalledWith('Groceries', false)
  })
})
