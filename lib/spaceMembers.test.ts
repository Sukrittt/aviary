import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest'
import type { MongoMemoryReplSet } from 'mongodb-memory-server'
import { startMongoReplSet } from '@/src/test-utils/mongo'
import { randomBytes } from 'node:crypto'

const pushes = vi.hoisted(() => [] as { userId: string; title: string; body: string }[])
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn(async (m: { userId: string; title: string; body: string }) => { pushes.push(m); return 1 }) }))

vi.mock('@/lib/cache', async (original) => ({ ...(await original<typeof import('@/lib/cache')>()), invalidate: () => {} }))
vi.mock('@/lib/ai/briefCache', async (original) => ({ ...(await original<typeof import('@/lib/ai/briefCache')>()), invalidateBrief: async () => {} }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: () => ({ userManagement: { deleteUser: async () => {} } }) }))

import { getDb, getClient } from '@/lib/mongodb'
import { softDeleteAccount, restoreAccount, purgeAccountNow } from '@/lib/accountLifecycle'
import { scoped } from '@/lib/scoped'
import { jobAuth, listBudgets, lookupMembership, resolveSpaceAccess, forgetMembership, type SpaceDoc } from '@/lib/spaces'
import {
  INVITE_CODE_RE, notifyOthersOfLog, transferOwnership, sharedBudgetsOwnedBy, handOffSharedBudgets, personalBudgetHandedOff, restoreAccountSpaces, createInvite, cancelInvite, invitePreview, joinBudget, removeMember, deleteBudget, restoreBudget, purgeDeletedSpaces,
} from '@/lib/spaceMembers'
import { BudgetError } from '@/lib/spaces'

let server: MongoMemoryReplSet
beforeAll(async () => {
  server = await startMongoReplSet()
  vi.stubEnv('MONGODB_URI', server.getUri('space-members'))
  vi.stubEnv('FIELD_KEY_V1', randomBytes(32).toString('base64'))
}, 120_000)
afterAll(async () => {
  if (server) { await (await getClient()).close(); await server.stop() }
  vi.unstubAllEnvs()
})

const HOME = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const owner = jobAuth('user_a')

beforeEach(async () => {
  const db = await getDb()
  for (const name of ['users', 'spaces', 'space_members', 'space_invites', 'expenses', 'categories']) await db.collection(name).deleteMany({})
  pushes.length = 0
  for (const id of ['user_a', 'user_b', 'user_c']) forgetMembership(HOME, id)
  const now = new Date().toISOString()
  await db.collection('users').insertMany([
    { _id: 'user_a' as never, name: 'Priya', onboardedAt: now },
    { _id: 'user_b' as never, name: 'Rahul', onboardedAt: now },
    { _id: 'user_c' as never, name: 'Sam' },
  ])
  await db.collection<SpaceDoc>('spaces').insertOne({ _id: HOME, name: 'Home', emoji: '🏠', owner_id: 'user_a', currencyCode: 'INR', onboardedAt: now, deleted_at: null, created_at: now })
  await db.collection('space_members').insertOne({ space_id: HOME, user_id: 'user_a', role: 'owner', joined_at: now, notify_others: false })
})

const code = (e: unknown) => (e as BudgetError).code

describe('invites', () => {
  it('makes a 6-character code that lasts 7 days, owner only', async () => {
    const invite = await createInvite(owner, HOME)
    expect(invite.code).toMatch(INVITE_CODE_RE)
    expect(Date.parse(invite.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 86_400_000)
    await expect(createInvite(jobAuth('user_b', HOME), HOME)).rejects.toSatisfy((e) => code(e) === 'NOT_OWNER')
  })

  it('can share the personal budget, giving it a spaces doc on the way', async () => {
    const invite = await createInvite(owner, 'user_a')
    expect((await invitePreview(invite.code))).toMatchObject({ status: 'ok', budget: { name: 'Personal' }, inviter: 'Priya' })
  })

  it('previews without signing in, and gives nothing away once it is dead (#214)', async () => {
    const invite = await createInvite(owner, HOME)
    expect(await invitePreview(invite.code)).toMatchObject({ status: 'ok', budget: { name: 'Home', emoji: '🏠' }, inviter: 'Priya' })
    expect(await invitePreview(invite.code.toLowerCase())).toMatchObject({ status: 'ok' })
    await cancelInvite(owner, HOME, invite.code)
    expect(await invitePreview(invite.code)).toEqual({ status: 'not_found' })
    expect(await invitePreview('ZZZZZZ')).toEqual({ status: 'not_found' })
  })

  it('an expired invite or a deleted budget previews as not_found, with no name, inviter or count (#214)', async () => {
    const db = await getDb()
    const expired = await createInvite(owner, HOME)
    await db.collection('space_invites').updateOne({ code: expired.code }, { $set: { expires_at: new Date(Date.now() - 1000).toISOString() } })
    expect(await invitePreview(expired.code)).toEqual({ status: 'not_found' })
    const gone = await createInvite(owner, HOME)
    await db.collection('spaces').updateOne({ _id: HOME as never }, { $set: { deleted_at: new Date().toISOString() } })
    expect(await invitePreview(gone.code)).toEqual({ status: 'not_found' })
  })
})

describe('joinBudget', () => {
  it('adds the member, uses up the invite, tells the owner once, and opens the budget to them', async () => {
    const invite = await createInvite(owner, HOME)
    expect(await joinBudget('user_b', invite.code)).toMatchObject({ spaceId: HOME, already: false })
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ spaceId: HOME, ownerId: 'user_a', role: 'member' })
    expect(pushes).toEqual([expect.objectContaining({ userId: 'user_a', title: 'Rahul joined Home budget' })])
    expect(await invitePreview(invite.code)).toEqual({ status: 'not_found' })
    // The joiner's own budget is untouched.
    expect((await listBudgets('user_b')).budgets.map((b) => b.id)).toEqual(['user_b', HOME])
  })

  it('just opens the budget for someone already in it', async () => {
    const invite = await createInvite(owner, HOME)
    expect(await joinBudget('user_a', invite.code)).toMatchObject({ spaceId: HOME, already: true })
    expect(await invitePreview(invite.code)).toMatchObject({ status: 'ok' })
  })

  it('refuses an expired or cancelled invite', async () => {
    const a = await createInvite(owner, HOME)
    await (await getDb()).collection('space_invites').updateOne({ code: a.code }, { $set: { expires_at: new Date(Date.now() - 1000).toISOString() } })
    await expect(joinBudget('user_b', a.code)).rejects.toSatisfy((e) => code(e) === 'EXPIRED')
    const b = await createInvite(owner, HOME)
    await cancelInvite(owner, HOME, b.code)
    await expect(joinBudget('user_b', b.code)).rejects.toSatisfy((e) => code(e) === 'EXPIRED')
  })

  it('refuses a full budget (6 people) and leaves the invite usable', async () => {
    const db = await getDb()
    await db.collection('space_members').insertMany([1, 2, 3, 4, 5].map((n) => ({ space_id: HOME, user_id: `user_x${n}`, role: 'member', joined_at: '', notify_others: false })))
    const invite = await db.collection('space_invites').insertOne({ space_id: HOME, code: 'FXQPRS', created_by: 'user_a', expires_at: new Date(Date.now() + 86_400_000).toISOString(), status: 'pending' })
    expect(invite.acknowledged).toBe(true)
    await expect(joinBudget('user_b', 'FXQPRS')).rejects.toSatisfy((e) => code(e) === 'FULL')
    expect(await invitePreview('FXQPRS')).toMatchObject({ status: 'ok' })
  })

  it('refuses someone at their budget limit', async () => {
    const db = await getDb()
    await db.collection('users').updateOne({ _id: 'user_b' as never }, { $set: { budgetLimit: 1 } })
    const invite = await createInvite(owner, HOME)
    await expect(joinBudget('user_b', invite.code)).rejects.toSatisfy((e) => code(e) === 'LIMIT_REACHED')
  })

  it("gives a brand-new person no personal budget: the shared one is all they have", async () => {
    const invite = await createInvite(owner, HOME)
    await joinBudget('user_c', invite.code)
    const { budgets, count } = await listBudgets('user_c')
    expect(budgets.map((b) => b.id)).toEqual([HOME])
    expect(count).toBe(1)
  })

  it('a race for the last seat lets exactly one in', async () => {
    const db = await getDb()
    await db.collection('space_members').insertMany([1, 2, 3, 4].map((n) => ({ space_id: HOME, user_id: `user_x${n}`, role: 'member', joined_at: '', notify_others: false })))
    const [i1, i2] = [await createInvite(owner, HOME), await createInvite(owner, HOME)]
    const results = await Promise.allSettled([joinBudget('user_b', i1.code), joinBudget('user_c', i2.code)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.collection('space_members').countDocuments({ space_id: HOME })).toBe(6)
  })
})

describe('leave and remove', () => {
  beforeEach(async () => {
    await joinBudget('user_b', (await createInvite(owner, HOME)).code)
    await scoped((await getDb()).collection('expenses'), HOME, { actorId: 'user_b' }).insertOne({ item: 'Milk', amount_inr: 60, date: '2026-10-20' })
  })

  it('a member leaves: access ends at once, and what they logged stays', async () => {
    await lookupMembership('user_b', HOME) // warm the cache
    await removeMember(jobAuth('user_b', HOME), HOME, 'user_b')
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ denied: true })
    expect(await scoped((await getDb()).collection('expenses'), HOME).countDocuments({ created_by: 'user_b' })).toBe(1)
  })

  it('the owner removes a member, quietly', async () => {
    pushes.length = 0
    await removeMember(owner, HOME, 'user_b')
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ denied: true })
    expect(pushes).toEqual([])
  })

  it("only the owner removes others, and the owner can't leave", async () => {
    await joinBudget('user_c', (await createInvite(owner, HOME)).code)
    await expect(removeMember(jobAuth('user_b', HOME), HOME, 'user_c')).rejects.toSatisfy((e) => code(e) === 'NOT_OWNER')
    await expect(removeMember(owner, HOME, 'user_a')).rejects.toSatisfy((e) => code(e) === 'INVALID')
  })

  it('someone who only had the shared budget gets a fresh personal one after leaving', async () => {
    await joinBudget('user_c', (await createInvite(owner, HOME)).code)
    await removeMember(jobAuth('user_c', HOME), HOME, 'user_c')
    expect((await listBudgets('user_c')).budgets.map((b) => b.id)).toEqual(['user_c'])
  })
})

describe('delete and restore', () => {
  beforeEach(async () => {
    await joinBudget('user_b', (await createInvite(owner, HOME)).code)
  })

  it('needs the name typed, owner only, and never the personal budget', async () => {
    await expect(deleteBudget(owner, HOME, 'Hom')).rejects.toSatisfy((e) => code(e) === 'INVALID')
    await expect(deleteBudget(jobAuth('user_b', HOME), HOME, 'Home')).rejects.toSatisfy((e) => code(e) === 'NOT_OWNER')
    await expect(deleteBudget(owner, 'user_a', 'Personal')).rejects.toSatisfy((e) => code(e) === 'INVALID')
  })

  it('closes it for everyone, tells members who did it, and restores within 30 days', async () => {
    await deleteBudget(owner, HOME, ' home ')
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ denied: true })
    const b = await listBudgets('user_b')
    expect(b.budgets.map((x) => x.id)).toEqual(['user_b'])
    expect(b.deleted).toEqual([expect.objectContaining({ id: HOME, name: 'Home', deletedBy: 'Priya', canRestore: false })])
    expect((await listBudgets('user_a')).deleted).toEqual([expect.objectContaining({ id: HOME, canRestore: true })])
    await expect(restoreBudget(jobAuth('user_b'), HOME)).rejects.toSatisfy((e) => code(e) === 'NOT_OWNER')
    await restoreBudget(owner, HOME)
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ spaceId: HOME, role: 'member' })
  })

  it('someone who only had that budget gets a fresh personal one when it closes', async () => {
    await joinBudget('user_c', (await createInvite(owner, HOME)).code)
    await deleteBudget(owner, HOME, 'Home')
    expect((await listBudgets('user_c')).budgets.map((b) => b.id)).toEqual(['user_c'])
  })

  it('purges a budget 30 days after it was deleted, and not before', async () => {
    const db = await getDb()
    await scoped(db.collection('expenses'), HOME).insertOne({ item: 'Rent', amount_inr: 100, date: '2026-10-01' })
    await deleteBudget(owner, HOME, 'Home')
    expect(await purgeDeletedSpaces(db, new Date(Date.now() + 29 * 86_400_000))).toBe(0)
    expect(await purgeDeletedSpaces(db, new Date(Date.now() + 31 * 86_400_000))).toBe(1)
    expect(await db.collection('expenses').countDocuments({ user_id: HOME })).toBe(0)
    expect(await db.collection('space_members').countDocuments({ space_id: HOME })).toBe(0)
    expect(await db.collection('spaces').countDocuments({ _id: HOME as never })).toBe(0)
  })
})

describe('notifyOthersOfLog', () => {
  it("pushes only to members who turned on \"tell me when others log\", never to the one who logged", async () => {
    const db = await getDb()
    await joinBudget('user_b', (await createInvite(owner, HOME)).code)
    await joinBudget('user_c', (await createInvite(owner, HOME)).code)
    await db.collection('space_members').updateMany({ space_id: HOME, user_id: { $in: ['user_a', 'user_c'] } }, { $set: { notify_others: true } })
    pushes.length = 0
    await notifyOthersOfLog({ ...jobAuth('user_c', HOME) }, { item: 'Milk', amount: 60, category: 'Groceries' })
    expect(pushes).toEqual([expect.objectContaining({ userId: 'user_a', title: 'Sam logged in Home', body: 'Milk · ₹60 · Groceries' })])
  })

  it('does nothing in a budget nobody shares', async () => {
    await notifyOthersOfLog(jobAuth('user_b'), { item: 'Tea', amount: 20, category: 'Food' })
    expect(pushes).toEqual([])
  })
})

describe('transferOwnership', () => {
  beforeEach(async () => {
    await joinBudget('user_b', (await createInvite(owner, HOME)).code)
  })

  it('hands the budget to a member: they own it and pay for it, the old owner stays as a member', async () => {
    pushes.length = 0
    await transferOwnership(owner, HOME, 'user_b')
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ ownerId: 'user_b', role: 'owner' })
    expect(await resolveSpaceAccess('user_a', HOME, lookupMembership)).toMatchObject({ ownerId: 'user_b', role: 'member' })
    expect(pushes).toEqual([expect.objectContaining({ userId: 'user_b', title: 'You own Home budget now' })])
  })

  it('only the owner, only to a member, and never the personal budget', async () => {
    await expect(transferOwnership(jobAuth('user_b', HOME), HOME, 'user_b')).rejects.toSatisfy((e) => code(e) === 'NOT_OWNER')
    await expect(transferOwnership(owner, HOME, 'user_c')).rejects.toSatisfy((e) => code(e) === 'INVALID')
    await joinBudget('user_b', (await createInvite(owner, 'user_a')).code)
    await expect(transferOwnership(owner, 'user_a', 'user_b')).rejects.toSatisfy((e) => code(e) === 'INVALID')
  })
})

describe('account deletion with shared budgets', () => {
  beforeEach(async () => {
    await joinBudget('user_b', (await createInvite(owner, HOME)).code)
    await joinBudget('user_b', (await createInvite(owner, 'user_a')).code)
    pushes.length = 0
  })

  it('lists the shared budgets the person owns, with who could take each one', async () => {
    const list = await sharedBudgetsOwnedBy('user_a')
    expect(list.map((b) => b.id).sort()).toEqual([HOME, 'user_a'].sort())
    expect(list[0].members).toEqual([expect.objectContaining({ userId: 'user_b', name: 'Rahul', joinedAt: expect.any(String) })])
  })

  it('transfers the ones they pick, personal budget included, and keeps that data out of the account purge', async () => {
    const db = await getDb()
    await scoped(db.collection('expenses'), 'user_a').insertOne({ item: 'Rent', amount_inr: 100, date: '2026-10-01' })
    await handOffSharedBudgets(db, 'user_a', { [HOME]: 'user_b', user_a: 'user_b' })
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ ownerId: 'user_b', role: 'owner' })
    expect(await resolveSpaceAccess('user_b', 'user_a', lookupMembership)).toMatchObject({ ownerId: 'user_b', role: 'owner' })
    expect(await personalBudgetHandedOff(db, 'user_a')).toBe(true)
  })

  it('leaves the old owner no way back into the personal budget they handed off, even after restoring (#213)', async () => {
    const db = await getDb()
    await lookupMembership('user_a', 'user_a') // warm the cache, as a live session would
    await handOffSharedBudgets(db, 'user_a', { user_a: 'user_b' })
    await softDeleteAccount(db, 'user_a')
    expect(await resolveSpaceAccess('user_a', 'user_a', lookupMembership)).toEqual({ spaceId: 'user_a', denied: true })
    expect(await resolveSpaceAccess('user_a', null, lookupMembership)).toEqual({ spaceId: 'user_a', denied: true })
    await restoreAccount(db, 'user_a')
    expect(await resolveSpaceAccess('user_a', null, lookupMembership)).toEqual({ spaceId: 'user_a', denied: true })
  })

  it('a handed-off personal budget survives the account deletion and its purge', async () => {
    const db = await getDb()
    await scoped(db.collection('expenses'), 'user_a').insertOne({ item: 'Rent', amount_inr: 100, date: '2026-10-01' })
    await handOffSharedBudgets(db, 'user_a', { user_a: 'user_b' })
    await softDeleteAccount(db, 'user_a')
    expect(await scoped(db.collection('expenses'), 'user_a').countDocuments({})).toBe(1)
    await purgeAccountNow(db, 'user_a')
    expect(await db.collection('expenses').countDocuments({ user_id: 'user_a', deleted_at: null })).toBe(1)
    expect(await db.collection('space_members').countDocuments({ user_id: 'user_a' })).toBe(0)
    expect(await resolveSpaceAccess('user_b', 'user_a', lookupMembership)).toMatchObject({ ownerId: 'user_b', role: 'owner' })
  })

  it('restoring the account reopens the budgets its deletion closed', async () => {
    const db = await getDb()
    await handOffSharedBudgets(db, 'user_a', {})
    await softDeleteAccount(db, 'user_a')
    await restoreAccount(db, 'user_a')
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ spaceId: HOME })
  })

  it("closes the ones they don't, restorable, and tells each member", async () => {
    await handOffSharedBudgets(await getDb(), 'user_a', {})
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ denied: true })
    expect(pushes.map((p) => p.userId)).toEqual(['user_b', 'user_b'])
    expect(pushes[0].title).toMatch(/closed/)
    await restoreAccountSpaces(await getDb(), 'user_a')
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ spaceId: HOME, role: 'member' })
  })

  it('someone who only had a budget the deletion closed gets a fresh personal one', async () => {
    await joinBudget('user_c', (await createInvite(owner, HOME)).code)
    await handOffSharedBudgets(await getDb(), 'user_a', {})
    expect((await listBudgets('user_c')).budgets.map((b) => b.id)).toEqual(['user_c'])
  })

  it('ignores a pick that is not a member of that budget', async () => {
    await handOffSharedBudgets(await getDb(), 'user_a', { [HOME]: 'user_c' })
    expect(await resolveSpaceAccess('user_b', HOME, lookupMembership)).toMatchObject({ denied: true })
  })
})

describe('account deletion with a budget nobody else is in', () => {
  it('closes it with the account, quietly, and reopens it on restore', async () => {
    const db = await getDb()
    await handOffSharedBudgets(db, 'user_a', {})
    await softDeleteAccount(db, 'user_a')
    expect(await db.collection('spaces').findOne({ _id: HOME as never })).toMatchObject({ deleted_by: 'user_a', deleted_reason: 'account' })
    expect(await db.collection('spaces').findOne({ _id: 'user_a' as never })).toBeNull()
    expect(pushes).toEqual([])
    await restoreAccount(db, 'user_a')
    expect(await resolveSpaceAccess('user_a', HOME, lookupMembership)).toMatchObject({ spaceId: HOME, role: 'owner' })
  })

  it('the GC purges it, data and all', async () => {
    const db = await getDb()
    await scoped(db.collection('expenses'), HOME).insertOne({ item: 'Hotel', amount_inr: 100, date: '2026-10-01' })
    await handOffSharedBudgets(db, 'user_a', {})
    await softDeleteAccount(db, 'user_a')
    expect(await purgeDeletedSpaces(db, new Date(Date.now() + 31 * 86_400_000))).toBe(1)
    expect(await db.collection('expenses').countDocuments({ user_id: HOME })).toBe(0)
    expect(await db.collection('spaces').countDocuments({ _id: HOME as never })).toBe(0)
  })

  it('an immediate purge takes it too, but not a budget someone else is in', async () => {
    const db = await getDb()
    const now = new Date().toISOString()
    const SHARED = 'bbbbbbbbbbbbbbbbbbbbbbbb'
    await db.collection<SpaceDoc>('spaces').insertOne({ _id: SHARED, name: 'Flat', emoji: '🏢', owner_id: 'user_a', currencyCode: 'INR', onboardedAt: now, deleted_at: null, created_at: now })
    await db.collection('space_members').insertMany([
      { space_id: SHARED, user_id: 'user_a', role: 'owner', joined_at: now, notify_others: false },
      { space_id: SHARED, user_id: 'user_b', role: 'member', joined_at: now, notify_others: false },
    ])
    await scoped(db.collection('expenses'), HOME).insertOne({ item: 'Hotel', amount_inr: 100, date: '2026-10-01' })
    await scoped(db.collection('expenses'), SHARED).insertOne({ item: 'Rent', amount_inr: 100, date: '2026-10-01' })
    await purgeAccountNow(db, 'user_a')
    expect(await db.collection('expenses').countDocuments({ user_id: HOME })).toBe(0)
    expect(await db.collection('spaces').countDocuments({ _id: HOME as never })).toBe(0)
    expect(await db.collection('expenses').countDocuments({ user_id: SHARED })).toBe(1)
    expect(await db.collection('space_members').countDocuments({ space_id: SHARED, user_id: 'user_b' })).toBe(1)
  })
})
