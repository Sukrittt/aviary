// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoClient, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Access } from '@/lib/billing/access'

let db: Db, client: MongoClient, server: MongoMemoryServer
const access = new Map<string, Partial<Access>>()
const settings = { lifecycleEmails: true }
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => db }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/systemSettings', () => ({ getSystemSettings: async () => settings }))
vi.mock('@/lib/billing/razorpay', () => ({ getPlanPrices: async () => [{ period: 'monthly', amount: 19900, currency: 'INR' }, { period: 'yearly', amount: 199900, currency: 'INR' }] }))
vi.mock('@/lib/billing/service', () => ({ getAccess: async (id: string) => ({ mode: 'paid', enforced: true, trialStartedAt: null, trialEndsAt: null, ...access.get(id) }) }))
vi.mock('./resend', async original => ({ ...await original<typeof import('./resend')>(), sendEmail: vi.fn() }))
const { sendEmail } = await import('./resend')
const { prepareLifecycleEmails, queueLeadPlan, retryLifecycleEmails, leadId } = await import('./lifecycle')
const { EMAIL_OUTBOX, LEADS } = await import('./outbox')
const { EVERGREEN } = await import('./lifecycleSteps')

const DAY = 86_400_000
const now = new Date()
const ago = (days: number) => new Date(now.getTime() - days * DAY)
const iso = (d: Date) => d.toISOString()

beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.2.6' } })
  client = await MongoClient.connect(server.getUri())
  db = client.db('lifecycle_email_test')
}, 30_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => {
  await db.dropDatabase()
  access.clear()
  settings.lifecycleEmails = true
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('CRON_SECRET', 'test-secret')
  vi.mocked(sendEmail).mockResolvedValue('email_test')
})
afterEach(() => vi.unstubAllEnvs())

async function user(id: string, over: Record<string, unknown> = {}) {
  await db.collection('users').insertOne({ _id: id as never, email: `${id}@example.com`, name: 'Asha Rao', emailVerified: true, deleted_at: null, createdAt: ago(40), ...over })
}
function trialDay(id: string, day: number, endsIn = 30 - day) {
  access.set(id, { mode: 'trial', trialStartedAt: iso(ago(day)), trialEndsAt: iso(new Date(now.getTime() + endsIn * DAY)) })
}
const outbox = () => db.collection(EMAIL_OUTBOX)
const sentTo = () => vi.mocked(sendEmail).mock.calls.map(([m]) => ({ to: m.to[0], subject: m.subject, headers: m.headers, from: m.from }))

describe('lifecycle queue', () => {
  it('nudges a quiet trial, sends it once, and never queues the same step twice', async () => {
    await user('quiet', { createdAt: ago(3) })
    trialDay('quiet', 3)
    const first = await retryLifecycleEmails()
    expect(first).toMatchObject({ queued: 1, sent: 1 })
    expect(sentTo()).toEqual([expect.objectContaining({ to: 'quiet@example.com', subject: 'Log one spend today', from: 'Sukrit from Aviary <hello@useaviary.com>' })])
    expect(sentTo()[0].headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/useaviary\.com\/api\/email\/unsubscribe\?t=u%3Aquiet\./)
    expect(await retryLifecycleEmails()).toMatchObject({ queued: 0, sent: 0 })
    expect(await outbox().countDocuments()).toBe(1)
  })

  it('skips the day-2 nudge once a spend is logged', async () => {
    await user('logger', { createdAt: ago(3) })
    trialDay('logger', 3)
    await db.collection('expenses').insertOne({ user_id: 'logger', deleted_at: null, date: iso(ago(1)).slice(0, 10) })
    expect(await prepareLifecycleEmails(db, now, 15)).toBe(0)
  })

  it('queues nothing new while the switch is off, but still sends what is already queued', async () => {
    await user('quiet', { createdAt: ago(3) })
    trialDay('quiet', 3)
    settings.lifecycleEmails = false
    expect(await retryLifecycleEmails()).toMatchObject({ queued: 0, sent: 0 })
    await queueLeadPlan(db, 'lead@example.com', { salary: 50000, rows: [['Rent', 15000]] })
    expect(await retryLifecycleEmails()).toMatchObject({ queued: 0, sent: 1 })
  })

  it('puts trial-end notices ahead of evergreen tips when there is little room', async () => {
    for (const id of ['a', 'b', 'c']) await user(id)
    await user('ending', { createdAt: ago(26) })
    trialDay('ending', 26, 4)
    expect(await prepareLifecycleEmails(db, now, 1)).toBe(1)
    expect(await outbox().findOne()).toMatchObject({ user_id: 'ending', step: 'trial-end' })
  })

  it('sends the trial-end notice with real prices and no unsubscribe, even to someone who opted out', async () => {
    await user('ending', { createdAt: ago(26), emailOptOutAt: ago(5), timezone: 'Asia/Kolkata' })
    trialDay('ending', 26, 4)
    await retryLifecycleEmails()
    const [message] = vi.mocked(sendEmail).mock.calls[0]
    expect(message.subject).toMatch(/^Your trial ends on \w{3}, \d{1,2} \w{3}$/)
    expect(message.text).toContain('₹199 a month, or ₹1,999 a year, which saves you ₹389')
    expect(message.text).not.toContain('Unsubscribe')
    expect(message.headers).toBeUndefined()
  })

  it('walks existing accounts into the evergreen library, opening with what to expect', async () => {
    await user('old')
    await retryLifecycleEmails()
    const [message] = vi.mocked(sendEmail).mock.calls[0]
    expect(message.subject).toBe('Most budgets die on day 4')
    expect(message.text).toContain('every few days I’ll send you one short, useful money idea')
    expect(message.text).toContain('Unsubscribe: https://useaviary.com/emails?t=')
    expect(await outbox().findOne()).toMatchObject({ _id: `lifecycle/old/${EVERGREEN[0]}`, kind: 'lifecycle' })
  })

  it('drops a queued tip when the reader unsubscribes before it goes out', async () => {
    await user('old')
    await prepareLifecycleEmails(db, now, 15)
    await db.collection('users').updateOne({ _id: 'old' as never }, { $set: { emailOptOutAt: now } })
    expect(await retryLifecycleEmails()).toMatchObject({ sent: 0, skipped: 1 })
    expect(await outbox().countDocuments()).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('salary planner leads', () => {
  const plan = { salary: 50000, rows: [['Rent', 15000], ['Groceries', 5000]] as [string, number][] }

  it('emails the plan once a day per address and nothing more until confirmed', async () => {
    await queueLeadPlan(db, 'lead@example.com', plan, now)
    await queueLeadPlan(db, 'lead@example.com', plan, now)
    expect(await outbox().countDocuments()).toBe(1)
    await retryLifecycleEmails()
    const [message] = vi.mocked(sendEmail).mock.calls[0]
    expect(message.subject).toBe('Your ₹50,000 salary split')
    expect(message.text).toContain('Groceries: ₹5,000')
    expect(message.text).toContain('https://useaviary.com/api/email/confirm?t=l%3A')
    await db.collection(LEADS).updateOne({ _id: leadId('lead@example.com') as never }, { $set: { createdAt: ago(3) } })
    await outbox().updateMany({}, { $set: { 'delivery.queuedAt': ago(3) } })
    expect(await prepareLifecycleEmails(db, now, 15)).toBe(0)
  })

  it('follows a confirmed lead on day 3, and hands an address that signed up to the account emails', async () => {
    await queueLeadPlan(db, 'lead@example.com', plan, ago(3))
    await outbox().updateMany({}, { $set: { 'delivery.state': 'sent' } })
    await db.collection(LEADS).updateOne({ _id: leadId('lead@example.com') as never }, { $set: { confirmedAt: ago(2) } })
    expect(await prepareLifecycleEmails(db, now, 15)).toBe(1)
    expect(await outbox().findOne({ step: 'lead-d3' })).toBeTruthy()
    await outbox().deleteMany({ step: 'lead-d3' })
    await user('lead', { email: 'lead@example.com', createdAt: ago(1) })
    expect(await prepareLifecycleEmails(db, now, 15)).toBe(0)
  })
})
