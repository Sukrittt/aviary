import { describe, it, expect, vi, beforeEach } from 'vitest'

type User = { _id: string; timezone?: string; lastSeenAt?: Date; createdAt?: Date; lastReengage?: { lapse: string; step: number } }

let tokenUsers: string[] = []
let users: User[] = []
let loggedToday: Array<{ user_id: string; date: string; created_by?: string }> = []
let recurringDue: Array<{ user_id: string }> = []
let subs: Array<Record<string, unknown>> = []
const claimed = new Set<string>()

const usersFind = vi.fn((filter: { _id: { $in: string[] } }) => ({
  // Copies, like a real driver: the code must not see its own later writes on the doc it read.
  toArray: async () => structuredClone(users.filter((u) => filter._id.$in.includes(u._id))),
}))
// Mirrors the claim filter: wins unless this lapse already has this step or a later one.
const usersUpdateOne = vi.fn(async (filter: { _id: string }, update: { $set?: { lastReengage: User['lastReengage'] }; $unset?: object }) => {
  const user = users.find((u) => u._id === filter._id)
  if (!user) return { modifiedCount: 0 }
  if (update.$unset) {
    delete user.lastReengage
    return { modifiedCount: 1 }
  }
  const next = update.$set!.lastReengage!
  const isClaim = '$or' in filter
  if (isClaim && user.lastReengage?.lapse === next.lapse && user.lastReengage.step >= next.step) return { modifiedCount: 0 }
  user.lastReengage = next
  return { modifiedCount: 1 }
})
type OwnLogs = { date: string; $or: [{ created_by: string }, { user_id: string }] }
const expensesFindOne = vi.fn(async (filter: OwnLogs) => {
  const me = filter.$or[0].created_by
  return loggedToday.find((e) => e.date === filter.date && (e.created_by === me || (e.user_id === me && e.created_by === undefined))) ?? null
})

vi.mock('@/lib/mongodb', () => ({
  getDb: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'push_tokens') return { distinct: async () => tokenUsers }
      if (name === 'users') return { find: usersFind, updateOne: usersUpdateOne }
      if (name === 'expenses') return { findOne: expensesFindOne }
      if (name === 'recurring_expenses') return { findOne: async (f: { user_id: string }) => recurringDue.find((r) => r.user_id === f.user_id) ?? null }
      if (name === 'notification_log') return { countDocuments: async (f: { user_id: string; key: { $in: string[] } }) => f.key.$in.filter((k) => claimed.has(`${f.user_id}:${k}`)).length }
      if (name === 'subscriptions') return { find: (f: { user_id: string }) => ({ toArray: async () => subs.filter((x) => x.user_id === f.user_id) }) }
      throw new Error(`unexpected collection ${name}`)
    },
  })),
}))

vi.mock('@/lib/notifications/deliver', () => ({
  claim: vi.fn(async (_db: unknown, userId: string, key: string) => {
    if (claimed.has(`${userId}:${key}`)) return false
    claimed.add(`${userId}:${key}`)
    return true
  }),
  unclaim: vi.fn(async (_db: unknown, userId: string, key: string) => {
    claimed.delete(`${userId}:${key}`)
  }),
}))

const sendPushNotification = vi.fn(async (_msg: { userId: string; title: string; body: string; data?: Record<string, unknown> }) => 1)
vi.mock('@/lib/push', () => ({
  sendPushNotification: (msg: Parameters<typeof sendPushNotification>[0]) => sendPushNotification(msg),
  checkPushReceipts: async () => ({ checked: 0, pruned: 0 }),
}))

const { eveningDateFor, eveningCopy, runEveningCheck, ownLogsOn } = await import('./eveningCheck')

beforeEach(() => {
  vi.clearAllMocks()
  tokenUsers = []
  users = []
  loggedToday = []
  recurringDue = []
  subs = []
  claimed.clear()
})

describe('eveningDateFor', () => {
  it('returns the local date inside 20:00 to 22:00 in the user timezone', () => {
    // 15:00 UTC is 20:30 IST.
    expect(eveningDateFor('Asia/Kolkata', new Date('2026-10-06T15:00:00Z'))).toBe('2026-10-06')
    // 03:30 UTC is 20:30 the previous day in Los Angeles (PDT, -7).
    expect(eveningDateFor('America/Los_Angeles', new Date('2026-10-07T03:30:00Z'))).toBe('2026-10-06')
  })

  it('handles half-hour offsets at the window edges', () => {
    // 14:29 UTC is 19:59 IST: not yet.
    expect(eveningDateFor('Asia/Kolkata', new Date('2026-10-06T14:29:00Z'))).toBeNull()
    // 14:30 UTC is 20:00 IST: in.
    expect(eveningDateFor('Asia/Kolkata', new Date('2026-10-06T14:30:00Z'))).toBe('2026-10-06')
    // 16:30 UTC is 22:00 IST: too late, never an odd-hour ping.
    expect(eveningDateFor('Asia/Kolkata', new Date('2026-10-06T16:30:00Z'))).toBeNull()
  })

  it('treats a missing timezone as IST', () => {
    expect(eveningDateFor(undefined, new Date('2026-10-06T15:00:00Z'))).toBe('2026-10-06')
    expect(eveningDateFor(undefined, new Date('2026-10-06T10:00:00Z'))).toBeNull()
  })
})

describe('eveningCopy', () => {
  it('rotates by day and stays free of em dashes', () => {
    const a = eveningCopy('2026-10-06')
    const b = eveningCopy('2026-10-07')
    expect(a).not.toEqual(b)
    for (let d = 1; d <= 9; d++) {
      const { title, body } = eveningCopy(`2026-10-0${d}`)
      expect(`${title}${body}`).not.toContain('—')
    }
  })
})

describe('runEveningCheck', () => {
  const at = new Date('2026-10-06T15:00:00Z') // 20:30 IST, 08:00 in Los Angeles

  it('nudges a user in their evening with nothing logged today, opening log expense', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]

    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
    expect(sendPushNotification.mock.calls[0][0]).toMatchObject({ userId: 'u1', data: { route: '/modals/log-expense' } })
    expect(expensesFindOne).toHaveBeenCalledWith(ownLogsOn('u1', '2026-10-06'), expect.anything())
  })

  it('skips a user who already logged today, from any source', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    loggedToday = [{ user_id: 'u1', date: '2026-10-06' }]

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 0, pruned: 0 })
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it("counts their own logs in a shared budget, and not a partner's in theirs", async () => {
    tokenUsers = ['u1', 'u2']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }, { _id: 'u2', timezone: 'Asia/Kolkata' }]
    // u1 logged in a shared budget; u2 logged into u1's personal budget, which u1 shares.
    loggedToday = [{ user_id: 'sp_home', date: '2026-10-06', created_by: 'u1' }, { user_id: 'u1', date: '2026-10-06', created_by: 'u2' }]

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 0, pruned: 0 })
    expect(expensesFindOne).toHaveBeenCalledTimes(2)
  })

  it("still nudges someone whose partner logged in the budget they share", async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    loggedToday = [{ user_id: 'u1', date: '2026-10-06', created_by: 'u2' }]

    expect((await runEveningCheck(at)).sent).toBe(1)
  })

  it('skips a user outside their evening window', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'America/Los_Angeles' }]

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 0, pruned: 0 })
    expect(expensesFindOne).not.toHaveBeenCalled()
  })

  it('sends at most once per local day across runs', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]

    await runEveningCheck(at)
    expect(await runEveningCheck(new Date('2026-10-06T16:00:00Z'))).toEqual({ sent: 0, failed: 0, pruned: 0 })
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
  })

  it('releases the claim when the push fails, so the next run retries', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    sendPushNotification.mockRejectedValueOnce(new Error('expo down'))

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 1, pruned: 0 })
    expect(await runEveningCheck(new Date('2026-10-06T16:00:00Z'))).toEqual({ sent: 1, failed: 0, pruned: 0 })
  })

  it('only looks at live users who have a device registered', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }, { _id: 'u2', timezone: 'Asia/Kolkata' }]

    await runEveningCheck(at)
    expect(usersFind).toHaveBeenCalledWith({ _id: { $in: ['u1'] }, deleted_at: null }, expect.anything())
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
  })

  it('retries when Expo takes the request but every ticket fails', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    sendPushNotification.mockResolvedValueOnce(0)

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 1, pruned: 0 })
    expect(await runEveningCheck(new Date('2026-10-06T16:00:00Z'))).toEqual({ sent: 1, failed: 0, pruned: 0 })
  })

  it('skips a user with a recurring expense still to be auto-added today', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    recurringDue = [{ user_id: 'u1' }]

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 0, pruned: 0 })
  })

  it('skips a user with a subscription due today, but not one due another day', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    subs = [{ user_id: 'u1', next_due_date: '2026-10-09', billing_cycle: 'monthly', status: 'active' }]
    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })

    claimed.clear()
    subs = [{ user_id: 'u1', next_due_date: '2026-10-06', billing_cycle: 'monthly', status: 'active' }]
    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 0, pruned: 0 })
  })

  it('nudges when today\'s subscription was already auto-added and then deleted', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata' }]
    subs = [{ user_id: 'u1', service: 'Claude Pro', next_due_date: '2026-10-06', billing_cycle: 'monthly', status: 'active' }]
    claimed.add('u1:sub-expense:Claude Pro:2026-10-06')

    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })
  })
})

describe('runEveningCheck come-back nudges', () => {
  const at = new Date('2026-10-06T15:00:00Z') // 20:30 IST
  const daysAgo = (n: number) => new Date(at.getTime() - n * 86_400_000)

  it('keeps the evening check for a user quiet under three days', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(2) }]

    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })
    expect(sendPushNotification.mock.calls[0][0].data).toEqual({ route: '/modals/log-expense' })
  })

  it('swaps the evening check for the day 3 nudge, tagged for analytics', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(3) }]

    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
    expect(sendPushNotification.mock.calls[0][0].data).toEqual({ route: '/modals/log-expense', kind: 'reengage', step: 3 })
    expect(claimed.has('u1:evening-check:2026-10-06')).toBe(false)
  })

  it('sends nothing between steps, and each step only once', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(3) }]
    await runEveningCheck(at)

    // Day 4 to 6: still step 3, already sent, and no evening check either.
    for (const d of [1, 2, 3]) {
      expect(await runEveningCheck(new Date(at.getTime() + d * 86_400_000))).toEqual({ sent: 0, failed: 0, pruned: 0 })
    }
    // Day 7: the next step.
    await runEveningCheck(new Date(at.getTime() + 4 * 86_400_000))
    expect(sendPushNotification).toHaveBeenCalledTimes(2)
    expect(sendPushNotification.mock.calls[1][0].data).toMatchObject({ step: 7 })
  })

  it('sends a long-gone user one catch-up at day 30 and then stops for good', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(200) }]

    await runEveningCheck(at)
    await runEveningCheck(new Date(at.getTime() + 100 * 86_400_000))
    expect(sendPushNotification).toHaveBeenCalledTimes(1)
    expect(sendPushNotification.mock.calls[0][0].data).toMatchObject({ step: 30 })
  })

  it('starts over after the user comes back and goes quiet again', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(30), lastReengage: { lapse: '2026-09-06', step: 30 } }]
    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 0, pruned: 0 })

    users[0].lastSeenAt = daysAgo(3)
    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })
    expect(sendPushNotification.mock.calls[0][0].data).toMatchObject({ step: 3 })
  })

  it('falls back to signup date when lastSeenAt was never stamped', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', createdAt: daysAgo(90) }]

    await runEveningCheck(at)
    expect(sendPushNotification.mock.calls[0][0].data).toMatchObject({ kind: 'reengage', step: 30 })
  })

  it('isn\'t blocked by an auto-added expense today', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(7) }]
    loggedToday = [{ user_id: 'u1', date: '2026-10-06' }]

    expect(await runEveningCheck(at)).toEqual({ sent: 1, failed: 0, pruned: 0 })
  })

  it('releases the step when the push fails, so the next run retries', async () => {
    tokenUsers = ['u1']
    users = [{ _id: 'u1', timezone: 'Asia/Kolkata', lastSeenAt: daysAgo(7), lastReengage: { lapse: '2026-09-29', step: 3 } }]
    sendPushNotification.mockResolvedValueOnce(0)

    expect(await runEveningCheck(at)).toEqual({ sent: 0, failed: 1, pruned: 0 })
    expect(users[0].lastReengage).toEqual({ lapse: '2026-09-29', step: 3 })
    expect(await runEveningCheck(new Date('2026-10-06T16:00:00Z'))).toEqual({ sent: 1, failed: 0, pruned: 0 })
  })
})
