// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoClient, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { UserDoc } from '@/lib/users'

let db: Db
let server: MongoMemoryServer
let client: MongoClient
vi.mock('@/lib/mongodb', () => ({ getDb: async () => db }))
vi.mock('@/lib/workosClient', () => ({ getWorkOSClient: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('./resend', async importOriginal => ({ ...await importOriginal<typeof import('./resend')>(), sendEmail: vi.fn() }))

const { after } = await import('next/server')
const { ensureUser, serializeUser } = await import('@/lib/users')
const { deliverWelcomeEmail, queueWelcomeEmail, scheduleWelcomeEmail } = await import('./welcome')
const { sendEmail, EmailSendError } = await import('./resend')

beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.2.6' } })
  client = await MongoClient.connect(server.getUri())
  db = client.db('welcome_test')
}, 30_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => {
  await db.dropDatabase()
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('RESEND_FROM_EMAIL', '')
  vi.stubEnv('RESEND_REPLY_TO', '')
  vi.mocked(sendEmail).mockResolvedValue('email_test')
})
afterEach(() => vi.unstubAllEnvs())

async function addUser(id = 'user_test') {
  await ensureUser({ id, email: 'person@example.com', firstName: 'Alex', emailVerified: true })
  return (await db.collection<UserDoc>('users').findOne({ _id: id }))!
}

describe('welcome signup and delivery', () => {
  it('persists the message with a new account and never replaces it on later sign-ins', async () => {
    const first = await addUser()
    await ensureUser({ id: first._id, email: 'changed@example.com', firstName: 'Changed' })
    const again = (await db.collection<UserDoc>('users').findOne({ _id: first._id }))!
    expect(again.welcomeEmail).toEqual(first.welcomeEmail)
    expect(again.email).toBe('changed@example.com')
    expect(first.welcomeEmail?.message.from).toBe('Aviary <hello@useaviary.com>')
    expect(first.welcomeEmail?.message.html).toContain('Hi Alex,')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not retrofit a welcome email onto an existing account', async () => {
    const old = await addUser('old_user')
    await db.collection<UserDoc>('users').updateOne({ _id: old._id }, { $unset: { welcomeEmail: '' } })
    await ensureUser({ id: old._id, email: old.email })
    expect(await deliverWelcomeEmail(old._id)).toBe('skipped')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('keeps email addresses, delivery metadata and HTML out of the public profile', async () => {
    const user = await addUser()
    const profile = serializeUser({ ...user, hiddenFeatures: ['insights'] })
    expect(profile).not.toHaveProperty('welcomeEmail')
    expect(profile).toMatchObject({ name: 'Alex', email: user.email, hiddenFeatures: ['insights'] })
  })

  it('sends once across repeated and simultaneous login callbacks', async () => {
    const user = await addUser()
    vi.mocked(sendEmail).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return 'email_test'
    })
    const outcomes = await Promise.all([deliverWelcomeEmail(user._id), deliverWelcomeEmail(user._id)])
    expect(outcomes.sort()).toEqual(['sent', 'skipped'])
    expect(await deliverWelcomeEmail(user._id)).toBe('skipped')
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(user.welcomeEmail!.message, 'welcome/user_test')
    expect((await db.collection<UserDoc>('users').findOne({ _id: user._id }))?.welcomeEmail).toMatchObject({ state: 'sent', resendId: 'email_test', attempts: 1 })
  })

  it('retries an uncertain failure with the identical payload and idempotency key', async () => {
    const user = await addUser()
    vi.mocked(sendEmail).mockRejectedValueOnce(new EmailSendError('Network timeout', true))
    expect(await deliverWelcomeEmail(user._id)).toBe('failed')
    await db.collection<UserDoc>('users').updateOne({ _id: user._id }, { $set: { 'welcomeEmail.nextAttemptAt': new Date(0) } })
    expect(await deliverWelcomeEmail(user._id)).toBe('sent')
    expect(vi.mocked(sendEmail).mock.calls[0]).toEqual(vi.mocked(sendEmail).mock.calls[1])
  })

  it('allows a definitive rejection to be retried later without an uncertain-send deadline', async () => {
    const user = await addUser()
    vi.mocked(sendEmail).mockRejectedValueOnce(new EmailSendError('HTTP 429', false))
    expect(await deliverWelcomeEmail(user._id)).toBe('failed')
    const saved = (await db.collection<UserDoc>('users').findOne({ _id: user._id }))!.welcomeEmail!
    expect(saved.state).toBe('pending')
    expect(saved.firstAttemptAt).toBeUndefined()
    expect(saved.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('recovers an abandoned worker lease', async () => {
    const user = await addUser()
    await db.collection<UserDoc>('users').updateOne({ _id: user._id }, { $set: { 'welcomeEmail.state': 'sending', 'welcomeEmail.leaseUntil': new Date(0), 'welcomeEmail.firstAttemptAt': new Date(), 'welcomeEmail.claim': 'old-worker' } })
    expect(await deliverWelcomeEmail(user._id)).toBe('sent')
  })

  it('stops an old uncertain send for review instead of risking a duplicate after Resend’s window', async () => {
    const user = await addUser()
    await db.collection<UserDoc>('users').updateOne({ _id: user._id }, { $set: { 'welcomeEmail.firstAttemptAt': new Date(Date.now() - 24 * 60 * 60_000) } })
    expect(await deliverWelcomeEmail(user._id)).toBe('needs_review')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it.each(['deleted', 'unverified'])('skips a %s account', async reason => {
    const user = await addUser()
    await db.collection<UserDoc>('users').updateOne({ _id: user._id }, { $set: reason === 'deleted' ? { deleted_at: new Date().toISOString() } : { emailVerified: false } })
    expect(await deliverWelcomeEmail(user._id)).toBe('skipped')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('leaves the message pending if email credentials are unavailable', async () => {
    const user = await addUser()
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await deliverWelcomeEmail(user._id)).toBe('skipped')
    expect((await db.collection<UserDoc>('users').findOne({ _id: user._id }))?.welcomeEmail?.state).toBe('pending')
  })

  it('schedules work after the response and keeps scheduling failures out of authentication', async () => {
    scheduleWelcomeEmail('user_test')
    expect(after).toHaveBeenCalledWith(expect.any(Function))
    expect(sendEmail).not.toHaveBeenCalled()
    vi.mocked(after).mockImplementationOnce(() => { throw new Error('no request context') })
    expect(() => scheduleWelcomeEmail('user_test')).not.toThrow()
  })

  it('supports configured sender and reply-to addresses', () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'Aviary <team@useaviary.com>')
    vi.stubEnv('RESEND_REPLY_TO', 'support@example.com')
    expect(queueWelcomeEmail({ email: 'person@example.com', name: null }).message).toMatchObject({ from: 'Aviary <team@useaviary.com>', reply_to: 'support@example.com' })
  })
})

it('holds a frozen welcome message for review after the verified recipient changes', async () => {
  const user = await addUser()
  await db.collection<UserDoc>('users').updateOne({ _id: user._id }, { $set: { email: 'new@example.com', emailVerified: true } })
  expect(await deliverWelcomeEmail(user._id)).toBe('needs_review')
  expect(sendEmail).not.toHaveBeenCalled()
  expect((await db.collection<UserDoc>('users').findOne({ _id: user._id }))?.welcomeEmail?.state).toBe('needs_review')
})
