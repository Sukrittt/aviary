import { describe, it, expect, vi } from 'vitest'
import { resolveSpaceAccess, spacesToRun, requestedSpaceId, budgetLimitFor, budgetsOpen, DEFAULT_BUDGET_LIMIT, MAX_MEMBERS, type SpaceDoc } from './spaces'

const space = (over: Partial<SpaceDoc> = {}): SpaceDoc => ({
  _id: 'sp_home',
  name: 'Home',
  emoji: '🏠',
  owner_id: 'user_a',
  deleted_at: null,
  created_at: '2026-10-19T00:00:00.000Z',
  ...over,
})

describe('resolveSpaceAccess', () => {
  it('serves the personal budget when no budget is asked for', async () => {
    const lookup = vi.fn(async () => ({ space: null, role: null }))
    expect(await resolveSpaceAccess('user_a', null, lookup)).toEqual({ spaceId: 'user_a', ownerId: 'user_a', role: 'owner' })
  })

  it("serves the personal budget when asked for one's own id, shared or not", async () => {
    const lookup = vi.fn(async () => ({ space: space({ _id: 'user_a' }), role: 'owner' as const }))
    expect(await resolveSpaceAccess('user_a', 'user_a', lookup)).toEqual({ spaceId: 'user_a', ownerId: 'user_a', role: 'owner' })
  })

  it('denies a personal budget its account deletion handed to someone else, asked for or not (#213)', async () => {
    const lookup = vi.fn(async () => ({ space: space({ _id: 'user_a', owner_id: 'user_b' }), role: null }))
    expect(await resolveSpaceAccess('user_a', 'user_a', lookup)).toEqual({ spaceId: 'user_a', denied: true })
    expect(await resolveSpaceAccess('user_a', null, lookup)).toEqual({ spaceId: 'user_a', denied: true })
  })

  it('serves a shared budget to a member, billed to its owner', async () => {
    const lookup = vi.fn(async () => ({ space: space(), role: 'member' as const }))
    expect(await resolveSpaceAccess('user_b', 'sp_home', lookup)).toEqual({ spaceId: 'sp_home', ownerId: 'user_a', role: 'member' })
    expect(lookup).toHaveBeenCalledWith('user_b', 'sp_home')
  })

  it("serves someone else's personal budget to a member of it", async () => {
    const lookup = vi.fn(async () => ({ space: space({ _id: 'user_a' }), role: 'member' as const }))
    expect(await resolveSpaceAccess('user_b', 'user_a', lookup)).toEqual({ spaceId: 'user_a', ownerId: 'user_a', role: 'member' })
  })

  it('denies a non-member', async () => {
    const lookup = vi.fn(async () => ({ space: space(), role: null }))
    expect(await resolveSpaceAccess('user_c', 'sp_home', lookup)).toEqual({ spaceId: 'sp_home', denied: true })
  })

  it('denies a budget that does not exist', async () => {
    const lookup = vi.fn(async () => ({ space: null, role: null }))
    expect(await resolveSpaceAccess('user_c', 'sp_gone', lookup)).toEqual({ spaceId: 'sp_gone', denied: true })
  })

  it('denies junk without a lookup, never falling back to the personal budget', async () => {
    const lookup = vi.fn()
    expect(await resolveSpaceAccess('user_a', '{"$ne":null}', lookup)).toEqual({ spaceId: 'invalid', denied: true })
    expect(await resolveSpaceAccess('user_a', 'x'.repeat(200), lookup)).toEqual({ spaceId: 'invalid', denied: true })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('denies a deleted budget, even to its members', async () => {
    const lookup = vi.fn(async () => ({ space: space({ deleted_at: '2026-10-18T00:00:00.000Z' }), role: 'member' as const }))
    expect(await resolveSpaceAccess('user_b', 'sp_home', lookup)).toEqual({ spaceId: 'sp_home', denied: true })
  })
})

describe('requestedSpaceId', () => {
  const req = (headers: Record<string, string>) => new Request('https://x.test/api/expenses', { headers })

  it('reads the x-aviary-budget header', () => {
    expect(requestedSpaceId(req({ 'x-aviary-budget': 'sp_home' }))).toBe('sp_home')
  })

  it('falls back to the aviary-budget cookie on web', () => {
    expect(requestedSpaceId(req({ cookie: 'a=1; aviary-budget=sp_home; b=2' }))).toBe('sp_home')
  })

  it('prefers the header over the cookie', () => {
    expect(requestedSpaceId(req({ 'x-aviary-budget': 'sp_one', cookie: 'aviary-budget=sp_two' }))).toBe('sp_one')
  })

  it('is null when an old app sends neither', () => {
    expect(requestedSpaceId(req({}))).toBeNull()
  })

  it('passes junk through, so it is denied rather than read as "no budget"', () => {
    expect(requestedSpaceId(req({ 'x-aviary-budget': '{"$ne":null}' }))).toBe('{"$ne":null}')
    expect(requestedSpaceId(req({ cookie: 'aviary-budget=%E0%A4%A' }))).toBe('%E0%A4%A')
  })
})

describe('spacesToRun (money crons)', () => {
  const users = [{ _id: 'user_a' }, { _id: 'user_b' }]

  it('runs every user’s personal budget once when nobody shares', () => {
    expect(spacesToRun(users, []).map((s) => s.spaceId)).toEqual(['user_a', 'user_b'])
  })

  it('runs a shared budget once, for its owner, no matter how many members it has', () => {
    const runs = spacesToRun(users, [space()])
    expect(runs.map((s) => s.spaceId)).toEqual(['user_a', 'user_b', 'sp_home'])
    expect(runs.find((s) => s.spaceId === 'sp_home')!.owner._id).toBe('user_a')
  })

  it('does not run a shared personal budget twice', () => {
    const runs = spacesToRun(users, [space({ _id: 'user_a' })])
    expect(runs.map((s) => s.spaceId)).toEqual(['user_a', 'user_b'])
  })

  it('skips deleted budgets and budgets whose owner is gone', () => {
    const runs = spacesToRun(users, [space({ deleted_at: '2026-10-18T00:00:00.000Z' }), space({ _id: 'sp_orphan', owner_id: 'user_gone' })])
    expect(runs.map((s) => s.spaceId)).toEqual(['user_a', 'user_b'])
  })
})

describe('budget limit', () => {
  it('is 5 for everyone, trial or paid, unless an admin set more', () => {
    expect(DEFAULT_BUDGET_LIMIT).toBe(5)
    expect(budgetLimitFor({})).toBe(5)
    expect(budgetLimitFor({ budgetLimit: 8 })).toBe(8)
  })

  it('ignores a nonsense override', () => {
    expect(budgetLimitFor({ budgetLimit: 0 })).toBe(5)
    expect(budgetLimitFor({ budgetLimit: -2 })).toBe(5)
    expect(budgetLimitFor({ budgetLimit: 2.5 })).toBe(5)
  })

  it('counts owned and joined budgets together, the personal one included', () => {
    expect(budgetsOpen('user_a', true, [])).toBe(1)
    expect(budgetsOpen('user_a', true, ['sp_1', 'sp_2', 'user_b'])).toBe(4)
  })

  it('does not count the personal budget twice once it has members', () => {
    expect(budgetsOpen('user_a', true, ['user_a', 'sp_1'])).toBe(2)
  })

  it('does not count a personal budget someone who only joined never made', () => {
    expect(budgetsOpen('user_c', false, ['sp_home'])).toBe(1)
  })

  it('caps a budget at 6 people, the owner plus 5', () => {
    expect(MAX_MEMBERS).toBe(6)
  })
})
