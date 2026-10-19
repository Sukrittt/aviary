import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { queryWrapper } from '../test-utils/queryWrapper'
import { HttpError, budgetCookie, setBudgetCookie } from '../api/client'

const { previewInvite, joinBudget, getBudgets, auth } = vi.hoisted(() => ({
  previewInvite: vi.fn(),
  joinBudget: vi.fn(),
  getBudgets: vi.fn(),
  auth: { user: null as null | { id: string }, loading: false },
}))
vi.mock('../api/spaces', () => ({ previewInvite, joinBudget, getBudgets }))
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => auth }))

const { JoinPage } = await import('./JoinPage')

const ok = { status: 'ok', budget: { id: 's1', name: 'Home', emoji: '🏠' }, inviter: 'Priya', members: 2 }
const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 'u2' }
  getBudgets.mockResolvedValue({ budgets: [], count: 1, limit: 5, activeId: 'u2' })
  vi.stubGlobal('location', { assign })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setBudgetCookie(null)
  document.cookie = 'aviary-return=; path=/; max-age=0'
})

const renderIt = () => render(<JoinPage code="ABC234" />, { wrapper: queryWrapper() })

describe('JoinPage', () => {
  it('says who invited you, with the app, the store and the web', async () => {
    previewInvite.mockResolvedValue(ok)
    renderIt()
    expect(await screen.findByRole('heading', { name: 'Priya invited you to 🏠 Home budget' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open in app' }).getAttribute('href')).toBe('envelope://join/ABC234')
    expect(screen.getByRole('link', { name: 'Get it on Google Play' }).getAttribute('href')).toContain('play.google.com')
    expect(screen.getByRole('button', { name: 'Continue on web' })).toBeTruthy()
  })

  it.each(['expired', 'cancelled'])('tells you to ask for a new one when it is %s', async (status) => {
    previewInvite.mockResolvedValue({ ...ok, status })
    renderIt()
    expect(await screen.findByText('This invite has expired. Ask Priya for a new one.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue on web' })).toBeNull()
  })

  it("says so when the code doesn't exist", async () => {
    previewInvite.mockResolvedValue({ status: 'not_found' })
    renderIt()
    expect(await screen.findByRole('heading', { name: "That invite doesn't exist" })).toBeTruthy()
  })

  it('signed out: off to sign in, remembering to come back', async () => {
    auth.user = null
    previewInvite.mockResolvedValue(ok)
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    expect(assign).toHaveBeenCalledWith('/sign-in')
    expect(document.cookie).toContain('aviary-return=%2Fjoin%2FABC234')
    expect(joinBudget).not.toHaveBeenCalled()
  })

  it('signed in: confirms, joins, opens the budget', async () => {
    previewInvite.mockResolvedValue(ok)
    joinBudget.mockResolvedValue({ spaceId: 's1', already: false })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    expect(screen.getByRole('alertdialog', { name: 'Join Home budget?' })).toBeTruthy()
    expect(screen.getByText('Your own budget stays exactly as it is.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/expense'))
    expect(joinBudget).toHaveBeenCalledWith('ABC234')
    expect(budgetCookie()).toBe('s1')
  })

  it('already a member: just opens it', async () => {
    previewInvite.mockResolvedValue(ok)
    getBudgets.mockResolvedValue({ budgets: [{ id: 's1', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u1', currencyCode: 'INR', personal: false, members: [] }], count: 2, limit: 5, activeId: 'u2' })
    renderIt()
    await waitFor(() => expect(getBudgets).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    expect(assign).toHaveBeenCalledWith('/expense')
    expect(budgetCookie()).toBe('s1')
    expect(joinBudget).not.toHaveBeenCalled()
  })

  it.each([
    ['LIMIT_REACHED', 409, "You're at 5 budgets. Leave one to join."],
    ['FULL', 409, 'Home is full. 6 people is the most a budget can have.'],
    ['EXPIRED', 410, 'This invite has expired. Ask Priya for a new one.'],
  ])('explains a %s join plainly', async (code, status, message) => {
    previewInvite.mockResolvedValue(ok)
    joinBudget.mockRejectedValue(new HttpError(status, code))
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(assign).not.toHaveBeenCalled()
  })
})
