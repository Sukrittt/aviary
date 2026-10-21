import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { queryWrapper } from '../test-utils/queryWrapper'
import { HttpError, budgetCookie, setBudgetCookie } from '../api/client'

const { previewInvite, joinBudget, getBudgets, getUser, auth } = vi.hoisted(() => ({
  previewInvite: vi.fn(),
  joinBudget: vi.fn(),
  getBudgets: vi.fn(),
  getUser: vi.fn(),
  auth: { user: null as null | { id: string }, loading: false },
}))
vi.mock('../api/spaces', () => ({ previewInvite, joinBudget, getBudgets }))
vi.mock('../api/account', () => ({ getUser }))
vi.mock('@workos-inc/authkit-nextjs/components', () => ({ useAuth: () => auth }))

const { JoinPage } = await import('./JoinPage')

const ok = { status: 'ok', budget: { id: 's1', name: 'Home', emoji: '🏠' }, inviter: 'Priya', members: 2 }
const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 'u2' }
  getBudgets.mockResolvedValue({ budgets: [], count: 1, limit: 5, activeId: 'u2' })
  getUser.mockResolvedValue({ _id: 'u2' })
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
    expect(await screen.findByRole('heading', { name: 'Priya invited you to Home budget' })).toBeTruthy()
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

  it('signed in: the invitation, the join, a welcome with everyone in it, then the budget', async () => {
    previewInvite.mockResolvedValue(ok)
    joinBudget.mockImplementation(async () => {
      const member = (userId: string, name: string, role: string) => ({ userId, name, avatarUrl: null, role, joinedAt: null })
      getBudgets.mockResolvedValue({ budgets: [{ id: 's1', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u1', currencyCode: 'INR', personal: false, members: [member('u1', 'Priya Shah', 'owner'), member('u2', 'Rahul Rao', 'member')] }], count: 2, limit: 5, activeId: 'u2' })
      return { spaceId: 's1', already: false }
    })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    expect(screen.getByRole('alertdialog', { name: 'Priya invited you to Home' })).toBeTruthy()
    expect(screen.getByText('2 people already in')).toBeTruthy()
    expect(screen.getByText('Your own budget stays exactly as it is.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Join Home' }))
    const welcome = await screen.findByRole('dialog', { name: "You're in, Rahul" }, { timeout: 3000 })
    expect(welcome.textContent).toContain("Everything anyone logs in Home lands here, and you'll see who added what.")
    expect(screen.getByTestId('join-you').textContent).toContain('R')
    expect(assign).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: "Let's go" }))
    expect(assign).toHaveBeenCalledWith('/expense')
    expect(joinBudget).toHaveBeenCalledWith('ABC234')
    expect(budgetCookie()).toBe('s1')
  })

  it('someone with no budget of their own still gets the welcome, not a reload into the budget', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { assign, reload })
    previewInvite.mockResolvedValue(ok)
    joinBudget.mockImplementation(async () => {
      // No personal budget: the server opens the one just joined.
      getBudgets.mockResolvedValue({ budgets: [{ id: 's1', name: 'Home', emoji: '🏠', role: 'member', ownerId: 'u1', currencyCode: 'INR', personal: false, members: [] }], count: 1, limit: 5, activeId: 's1' })
      return { spaceId: 's1', already: false }
    })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    fireEvent.click(screen.getByRole('button', { name: 'Join Home' }))
    expect(await screen.findByRole('dialog', { name: "You're in" }, { timeout: 3000 })).toBeTruthy()
    expect(reload).not.toHaveBeenCalled()
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
    ['rate limited', 429, "That's a lot of tries. Give it a minute, then try again."],
  ])('explains a %s join plainly', async (code, status, message) => {
    previewInvite.mockResolvedValue(ok)
    joinBudget.mockRejectedValue(new HttpError(status, code))
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue on web' }))
    fireEvent.click(screen.getByRole('button', { name: 'Join Home' }))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(assign).not.toHaveBeenCalled()
  })

  it('rate limited while opening the invite: says to wait, not to check the connection', async () => {
    previewInvite.mockRejectedValue(new HttpError(429, 'rate limited'))
    renderIt()
    expect(await screen.findByText("That's a lot of tries. Give it a minute, then try again.")).toBeTruthy()
  })
})
