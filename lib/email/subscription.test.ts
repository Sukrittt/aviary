// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoClient, ObjectId, type Db } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { BILLING_EVENTS, BILLING_SUBSCRIPTIONS, type BillingEventDoc, type BillingSubscriptionDoc } from '@/lib/billing/records'

let db: Db, client: MongoClient, server: MongoMemoryServer
vi.mock('@/lib/mongodb', () => ({ getDb: async () => db }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('./resend', async original => ({ ...await original<typeof import('./resend')>(), sendEmail: vi.fn() }))
const { sendEmail, EmailSendError } = await import('./resend')
const { prepareSubscriptionEmails, retrySubscriptionEmails, EMAIL_OUTBOX } = await import('./subscription')

beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.2.6' } })
  client = await MongoClient.connect(server.getUri())
  db = client.db('subscription_email_test')
}, 30_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => {
  await db.dropDatabase()
  await db.collection(BILLING_EVENTS).createIndex({ provider: 1, environment: 1, eventId: 1 }, { unique: true })
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.mocked(sendEmail).mockResolvedValue('email_test')
  await db.collection('users').insertOne({ _id: 'user_a' as never, email: 'person@example.com', name: 'Alex', emailVerified: true, deleted_at: null })
  await db.collection<BillingSubscriptionDoc>(BILLING_SUBSCRIPTIONS).insertOne({
    _id: new ObjectId(), userId: 'user_a', provider: 'razorpay', environment: 'production', store: 'web', productId: 'monthly', basePlanId: null,
    storeTransactionId: 'sub_1', status: 'active', autoRenew: true, expiresAt: new Date('2027-01-01'), verifiedAt: new Date(), providerRefs: {}, createdAt: new Date(), updatedAt: new Date(),
  })
})
afterEach(() => vi.unstubAllEnvs())
async function event(over: Partial<BillingEventDoc> = {}) {
  await db.collection<BillingEventDoc>(BILLING_EVENTS).insertOne({
    _id: new ObjectId(), provider: 'razorpay', environment: 'production', eventId: 'evt_1', type: 'subscription.charged', userId: 'user_a',
    receivedAt: new Date(), processedAt: new Date(), state: 'processed', attempts: 1, emailKind: 'paid', summary: { subscriptionId: 'sub_1', paymentId: 'pay_1', currentEnd: 1798761600 }, ...over,
  })
}

describe('durable subscription delivery', () => {
  it('queues and sends a payment once despite duplicate logical events and concurrent workers', async () => {
    await event()
    await event({ eventId: 'duplicate_notification' })
    await Promise.all([prepareSubscriptionEmails(db), prepareSubscriptionEmails(db)])
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(1)
    const results = await Promise.all([retrySubscriptionEmails(), retrySubscriptionEmails()])
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1)
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: ['person@example.com'], subject: 'Payment received for Aviary' })
    expect((await retrySubscriptionEmails()).sent).toBe(0)
  })
  it('waits for provider verification and never retrofits historical events or sandbox purchases', async () => {
    await event({ state: 'failed' })
    await event({ eventId: 'old', emailKind: undefined })
    await event({ eventId: 'sandbox', environment: 'sandbox' })
    await prepareSubscriptionEmails(db)
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(0)
    await db.collection(BILLING_EVENTS).updateOne({ eventId: 'evt_1' }, { $set: { state: 'processed' } })
    await prepareSubscriptionEmails(db)
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(1)
  })
  it('requires an owned verified purchase', async () => {
    await event({ userId: 'another_user' })
    await db.collection('users').insertOne({ _id: 'another_user' as never, email: 'other@example.com', emailVerified: true })
    await prepareSubscriptionEmails(db)
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(0)
  })
  it('deduplicates pending and halted payment failures in the same cycle', async () => {
    await db.collection(BILLING_SUBSCRIPTIONS).updateOne({}, { $set: { status: 'grace' } })
    await event({ type: 'subscription.pending', emailKind: 'failed' })
    await event({ eventId: 'halt', type: 'subscription.halted', emailKind: 'failed' })
    await prepareSubscriptionEmails(db)
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(1)
    expect((await retrySubscriptionEmails()).sent).toBe(1)
  })
  it('suppresses delayed failure notices after recovery', async () => {
    await event({ emailKind: 'failed' })
    await prepareSubscriptionEmails(db)
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(0)
  })
  it('recovers a web cancellation marker and deduplicates the eventual provider notification', async () => {
    await db.collection(BILLING_SUBSCRIPTIONS).updateOne({}, { $set: { cancellationEmailPending: true, status: 'cancelled', autoRenew: false } })
    await prepareSubscriptionEmails(db)
    await event({ emailKind: 'cancelled', type: 'subscription.cancelled' })
    await prepareSubscriptionEmails(db)
    expect(await db.collection(EMAIL_OUTBOX).countDocuments()).toBe(1)
    expect((await db.collection(BILLING_SUBSCRIPTIONS).findOne({}))?.cancellationEmailPending).toBeUndefined()
    expect((await retrySubscriptionEmails()).sent).toBe(1)
  })
  it('uses RevenueCat transaction identity and Google Play settings', async () => {
    await db.collection(BILLING_SUBSCRIPTIONS).updateOne({}, { $set: { provider: 'revenuecat', store: 'play', storeTransactionId: 'order_1', providerRefs: { originalTransactionId: 'order_1' } } })
    await event({ provider: 'revenuecat', summary: { productId: 'monthly', originalTransactionId: 'order_1', transactionId: 'order_1..1' } })
    await event({ provider: 'revenuecat', eventId: 'another', summary: { productId: 'monthly', originalTransactionId: 'order_1', transactionId: 'order_1..1' } })
    expect((await retrySubscriptionEmails()).sent).toBe(1)
    expect(vi.mocked(sendEmail).mock.calls[0][0].text).toContain('https://play.google.com/store/account/subscriptions')
  })
  it('keeps ambiguous retries byte-identical and stops beyond the idempotency window', async () => {
    await event()
    vi.mocked(sendEmail).mockRejectedValueOnce(new EmailSendError('timeout', true))
    expect((await retrySubscriptionEmails()).failed).toBe(1)
    await db.collection(EMAIL_OUTBOX).updateOne({}, { $set: { 'delivery.nextAttemptAt': new Date(0) } })
    expect((await retrySubscriptionEmails()).sent).toBe(1)
    expect(vi.mocked(sendEmail).mock.calls[0]).toEqual(vi.mocked(sendEmail).mock.calls[1])
    await db.collection(EMAIL_OUTBOX).updateOne({}, { $set: { 'delivery.state': 'sending', 'delivery.leaseUntil': new Date(0), 'delivery.firstAttemptAt': new Date(Date.now() - 24 * 3600000) } })
    expect((await retrySubscriptionEmails()).needs_review).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })
  it.each([{ deleted_at: new Date() }, { emailVerified: false }])('skips an ineligible account %j even after queuing', async patch => {
    await event()
    await prepareSubscriptionEmails(db)
    await db.collection('users').updateOne({}, { $set: patch })
    expect((await retrySubscriptionEmails()).skipped).toBe(1)
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('does nothing without the email key', async () => {
    await event()
    vi.stubEnv('RESEND_API_KEY', '')
    expect((await retrySubscriptionEmails()).configured).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

it('holds a subscription notification after its recipient changes, including an ambiguous retry', async () => {
  await event()
  vi.mocked(sendEmail).mockRejectedValueOnce(new EmailSendError('timeout', true))
  expect((await retrySubscriptionEmails()).failed).toBe(1)
  await db.collection('users').updateOne({}, { $set: { email: 'new@example.com' } })
  await db.collection(EMAIL_OUTBOX).updateOne({}, { $set: { 'delivery.nextAttemptAt': new Date(0) } })
  expect((await retrySubscriptionEmails()).needs_review).toBe(1)
  expect(sendEmail).toHaveBeenCalledTimes(1)
})
