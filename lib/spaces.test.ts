import { describe, it, expect, vi } from 'vitest'
import { resolveSpaceAccess, spacesToRun, requestedSpaceId, type SpaceDoc } from './spaces'

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
  it('serves the personal budget when no budget is asked for, without a lookup', async () => {
    const lookup = vi.fn()
    expect(await resolveSpaceAccess('user_a', null, lookup)).toEqual({ spaceId: 'user_a', ownerId: 'user_a', role: 'owner' })
    expect(lookup).not.toHaveBeenCalled()
  })

  it("serves the personal budget when asked for one's own id, without a lookup", async () => {
    const lookup = vi.fn()
    expect(await resolveSpaceAccess('user_a', 'user_a', lookup)).toEqual({ spaceId: 'user_a', ownerId: 'user_a', role: 'owner' })
    expect(lookup).not.toHaveBeenCalled()
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

  it('ignores junk rather than looking it up', () => {
    expect(requestedSpaceId(req({ 'x-aviary-budget': '{"$ne":null}' }))).toBeNull()
    expect(requestedSpaceId(req({ 'x-aviary-budget': 'x'.repeat(200) }))).toBeNull()
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
