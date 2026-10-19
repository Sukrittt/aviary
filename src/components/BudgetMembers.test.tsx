import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { queryWrapper } from '../test-utils/queryWrapper'
import type { BudgetSummary, MembersInfo } from '../api/spaces'

const api = vi.hoisted(() => ({
  getBudgets: vi.fn(),
  getMembers: vi.fn(),
  createInvite: vi.fn(),
  cancelInvite: vi.fn(),
  removeMember: vi.fn(),
  setNotifyOthers: vi.fn(),
  renameBudget: vi.fn(),
  deleteBudget: vi.fn(),
  switchBudget: vi.fn(),
  transferBudget: vi.fn(),
}))
vi.mock('../api/spaces', () => api)
const me = vi.hoisted(() => ({ id: 'u1' }))
vi.mock('../hooks/useUser', () => ({ useUser: () => ({ data: { _id: me.id } }) }))

const { BudgetMembersDialog } = await import('./BudgetMembers')

const people = [
  { userId: 'u1', name: 'Priya Shah', avatarUrl: null, role: 'owner' as const, joinedAt: null },
  { userId: 'u2', name: 'Rahul Rao', avatarUrl: null, role: 'member' as const, joinedAt: '2026-10-12T10:00:00Z' },
]
const home: BudgetSummary = { id: 's1', name: 'Home', emoji: '🏠', role: 'owner', ownerId: 'u1', currencyCode: 'INR', personal: false, members: people }
const personal: BudgetSummary = { ...home, id: 'u1', name: 'Personal', personal: true, members: [people[0]] }
const info = (extra: Partial<MembersInfo> = {}): MembersInfo => ({ members: people, role: 'owner', notifyOthers: false, invites: [], ...extra })

const renderIt = (budget: BudgetSummary) => render(<BudgetMembersDialog budget={budget} onClose={vi.fn()} />, { wrapper: queryWrapper() })

beforeEach(() => {
  vi.clearAllMocks()
  me.id = 'u1'
  api.getBudgets.mockResolvedValue({ budgets: [personal, home], count: 2, limit: 5, activeId: 's1' })
})

describe('BudgetMembersDialog', () => {
  it('owner: invite, remove, rename and delete; no leave', async () => {
    api.getMembers.mockResolvedValue(info({ invites: [{ code: 'ABC234', url: 'https://useaviary.com/join/ABC234', expiresAt: '2026-10-27T00:00:00Z' }] }))
    renderIt(home)
    expect(await screen.findByText('ABC234')).toBeTruthy()
    expect(screen.getByText('Priya Shah (you)')).toBeTruthy()
    expect(screen.getByText('Joined 12 Oct 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Invite/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy again' })).toBeTruthy()
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Home')
    expect(screen.getByRole('button', { name: 'Delete budget' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Leave budget' })).toBeNull()
  })

  it('member: leave and the notify toggle, nothing of the owner’s', async () => {
    me.id = 'u2'
    api.getMembers.mockResolvedValue(info({ role: 'member' }))
    renderIt({ ...home, role: 'member' })
    expect(await screen.findByRole('switch', { name: /Tell me when others log/ })).toHaveProperty('checked', false)
    expect(screen.getByRole('button', { name: 'Leave budget' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Invite/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete budget' })).toBeNull()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('leaving says what stays, then lands in your own budget', async () => {
    me.id = 'u2'
    api.getMembers.mockResolvedValue(info({ role: 'member' }))
    api.removeMember.mockResolvedValue({ ok: true })
    renderIt({ ...home, role: 'member' })
    await waitFor(() => expect(api.getBudgets).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: 'Leave budget' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Leave Home budget?' })
    expect(within(dialog).getByText("You'll lose access to Home budget. Expenses you logged stay in it.")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(api.switchBudget).toHaveBeenCalledWith(personal))
    expect(api.removeMember).toHaveBeenCalledWith('s1', 'me')
  })

  it('removing someone says what stays', async () => {
    api.getMembers.mockResolvedValue(info())
    api.removeMember.mockResolvedValue({ ok: true })
    renderIt(home)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove Rahul?' })
    expect(within(dialog).getByText('Rahul loses access to Home. What they logged stays.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith('s1', 'u2'))
  })

  it('invite shows the code and a ready message', async () => {
    api.getMembers.mockResolvedValue(info())
    api.createInvite.mockResolvedValue({ code: 'XYZ789', url: 'https://useaviary.com/join/XYZ789', expiresAt: '2026-10-27T00:00:00Z' })
    renderIt(home)
    fireEvent.click(await screen.findByRole('button', { name: /Invite/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite someone' })
    expect(within(dialog).getByText('XYZ789')).toBeTruthy()
    expect(within(dialog).getByText('Join our Home budget on Aviary: https://useaviary.com/join/XYZ789 (code XYZ789)')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })

  it('a full budget gets the plain message', async () => {
    const { HttpError } = await import('../api/client')
    api.getMembers.mockResolvedValue(info())
    api.createInvite.mockRejectedValue(new HttpError(409, 'FULL'))
    renderIt(home)
    fireEvent.click(await screen.findByRole('button', { name: /Invite/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Home is full. 6 people is the most a budget can have.')
  })

  it('delete needs the name typed', async () => {
    api.getMembers.mockResolvedValue(info())
    api.deleteBudget.mockResolvedValue({ ok: true })
    renderIt(home)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete budget' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Home budget?' })
    expect(within(dialog).getByText(/You can restore it for 30 days\./)).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Delete budget' })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(within(dialog).getByLabelText('Type Home to confirm'), { target: { value: 'home' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.deleteBudget).toHaveBeenCalledWith('s1', 'home'))
  })

  it('a personal budget can be shared but never deleted', async () => {
    api.getMembers.mockResolvedValue(info({ members: [people[0]] }))
    renderIt(personal)
    expect(await screen.findByRole('button', { name: /Invite/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete budget' })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('owner hands the budget over: pick, confirm, then it closes', async () => {
    api.getMembers.mockResolvedValue(info())
    api.transferBudget.mockResolvedValue({ ok: true })
    const onClose = vi.fn()
    render(<BudgetMembersDialog budget={home} onClose={onClose} />, { wrapper: queryWrapper() })
    fireEvent.click(await screen.findByRole('button', { name: /Make someone else the owner/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: "Who's the new owner?" })).getByRole('button', { name: /Rahul Rao/ }))
    const dialog = screen.getByRole('alertdialog', { name: 'Make Rahul the owner of Home?' })
    expect(within(dialog).getByText("Rahul's plan covers Home from now on, and only they can invite, remove or delete. You stay in it.")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make Rahul owner' }))
    await waitFor(() => expect(api.transferBudget).toHaveBeenCalledWith('s1', 'u2'))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('no hand-over for a member, or on the personal budget', async () => {
    me.id = 'u2'
    api.getMembers.mockResolvedValue(info({ role: 'member' }))
    const { unmount } = renderIt({ ...home, role: 'member' })
    await screen.findByRole('button', { name: 'Leave budget' })
    expect(screen.queryByRole('button', { name: /Make someone else the owner/ })).toBeNull()
    unmount()
    me.id = 'u1'
    renderIt({ ...personal, members: people })
    expect(await screen.findByText('Your personal budget stays yours.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Make someone else the owner/ })).toBeNull()
  })
})
