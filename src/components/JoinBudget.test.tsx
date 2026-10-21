import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { queryWrapper } from '../test-utils/queryWrapper'

const { previewInvite, getBudgets, joinBudget } = vi.hoisted(() => ({ previewInvite: vi.fn(), getBudgets: vi.fn(), joinBudget: vi.fn() }))
vi.mock('../api/spaces', () => ({ previewInvite, getBudgets, joinBudget }))
vi.mock('../api/account', () => ({ getUser: vi.fn(async () => ({ _id: 'u2' })) }))

const { JoinCodeDialog, whoIsIn } = await import('./JoinBudget')

const ok = { status: 'ok', budget: { id: 's1', name: 'Home', emoji: '🏠' }, inviter: 'Priya', members: 1 }
const renderIt = () => render(<JoinCodeDialog memberOf={() => false} onClose={() => {}} />, { wrapper: queryWrapper() })

beforeEach(() => {
  vi.clearAllMocks()
  getBudgets.mockResolvedValue({ budgets: [], count: 1, limit: 5, activeId: 'u2' })
})

describe('JoinCodeDialog', () => {
  it('fills a tile per letter and looks the code up on the last one', async () => {
    previewInvite.mockResolvedValue(ok)
    renderIt()
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'ab-23 cd' } })
    expect(['A', 'B', '2', '3', 'C', 'D'].map((c, i) => screen.getByTestId(`code-tile-${i}`).textContent)).toEqual(['A', 'B', '2', '3', 'C', 'D'])
    expect(await screen.findByRole('alertdialog', { name: 'Priya invited you to Home' })).toBeTruthy()
    expect(screen.getByText('Just Priya so far')).toBeTruthy()
    expect(previewInvite).toHaveBeenCalledWith('AB23CD')
  })

  it('marks the tiles on a code that matches nothing, and clears once you edit it', async () => {
    previewInvite.mockResolvedValue({ status: 'not_found' })
    renderIt()
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'ZZZZ99' } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByTestId('code-tile-0').className).toContain('is-error')
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'ZZZZ9' } })
    expect(screen.getByTestId('code-tile-0').className).not.toContain('is-error')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('JoinCodeDialog edges', () => {
  it("doesn't cap what you paste, so a code with dashes or spaces still fills all six", () => {
    renderIt()
    expect(screen.getByLabelText('Invite code').getAttribute('maxlength')).toBeNull()
  })

  it('joins the code it showed you, even if you edited it while it was looking', async () => {
    let answer: (v: unknown) => void = () => {}
    previewInvite.mockImplementationOnce(() => new Promise((r) => { answer = r }))
    joinBudget.mockRejectedValue(new Error('offline'))
    renderIt()
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'AB23CD' } })
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'AB23CE' } })
    answer(ok)
    fireEvent.click(await screen.findByRole('button', { name: 'Join Home' }))
    await waitFor(() => expect(joinBudget).toHaveBeenCalledWith('AB23CD'))
  })

  it('keeps Join there to try again after it fails', async () => {
    previewInvite.mockResolvedValue(ok)
    joinBudget.mockRejectedValue(new Error('offline'))
    renderIt()
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'AB23CD' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Join Home' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Check your connection and try again.')
    expect(screen.getByRole('button', { name: 'Join Home' })).toBeTruthy()
  })
})

describe('whoIsIn', () => {
  it('counts who is already in', () => {
    expect(whoIsIn(1, 'Priya')).toBe('Just Priya so far')
    expect(whoIsIn(1, null)).toBe('Just the owner so far')
    expect(whoIsIn(4, 'Priya')).toBe('4 people already in')
    expect(whoIsIn(undefined, 'Priya')).toBeNull()
  })
})
