// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Db, MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { redirect } from 'next/navigation'

let db: Db
let client: MongoClient
let server: MongoMemoryServer
const admin = vi.fn(async () => 'admin_1')
const auth = vi.fn(async () => ({ userId: 'user_1', readOnly: false }))
const audit = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('./mongodb', () => ({ getDb: () => Promise.resolve(db) }))
vi.mock('./admin', () => ({ requireAdmin: () => admin() }))
vi.mock('./access', () => ({ getAuth: () => auth() }))
vi.mock('./adminAudit', () => ({ audit: (...args: unknown[]) => audit(...args) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { CHANGELOG_COLLECTION, latestUnseenRelease, claimRelease, publishedChangelog } = await import('./changelog')
const { saveChangelogAction, publishChangelogAction, unpublishChangelogAction } = await import('@/app/admin/changelog/actions')
const { GET } = await import('@/app/api/changelog/latest/route')
const { POST } = await import('@/app/api/changelog/[id]/seen/route')

beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.2.6' } })
  client = await MongoClient.connect(server.getUri())
  db = client.db('changelog_test')
}, 60_000)
afterAll(async () => { await client?.close(); await server?.stop() })
beforeEach(async () => {
  vi.clearAllMocks()
  admin.mockResolvedValue('admin_1')
  auth.mockResolvedValue({ userId: 'user_1', readOnly: false })
  await db.dropDatabase()
  await db.collection('users').insertMany([
    { _id: 'user_1' as never, onboardedAt: '2026-10-01', deleted_at: null },
    { _id: 'user_2' as never, onboardedAt: '2026-10-01', deleted_at: null },
    { _id: 'new_user' as never, onboardedAt: null },
    { _id: 'deleted_user' as never, onboardedAt: '2026-10-01', deleted_at: '2026-10-02' },
  ])
})

function form(values: Record<string, string> = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ title: 'Faster logging', version: 'v1.2', highlights: 'Quick expense entry\nBetter receipts', body: 'The full details.', ...values })) data.set(key, value)
  return data
}
async function draft() {
  await saveChangelogAction(null, form())
  return (await db.collection(CHANGELOG_COLLECTION).findOne({}, { sort: { _id: -1 } }))!
}
async function published(values: Record<string, string> = {}) {
  await saveChangelogAction(null, form(values))
  const doc = (await db.collection(CHANGELOG_COLLECTION).findOne({}, { sort: { _id: -1 } }))!
  await publishChangelogAction(String(doc._id), 1, null, new FormData())
  return String(doc._id)
}

describe('admin release controls', () => {
  it('leaves the draft editor after publishing and opens the published update', async () => {
    const doc = await draft()
    const id = String(doc._id)
    vi.mocked(redirect).mockClear()
    await publishChangelogAction(id, 1, null, new FormData())
    expect(redirect).toHaveBeenCalledWith(`/admin/changelog?published=${id}`)
    expect(await latestUnseenRelease('user_1')).toMatchObject({ id })
  })

  it('keeps drafts private, then publishes and audits them', async () => {
    const doc = await draft()
    expect(await latestUnseenRelease('user_1')).toBeNull()
    expect(await publishedChangelog()).toEqual([])
    await publishChangelogAction(String(doc._id), 1, null, new FormData())
    expect(redirect).toHaveBeenCalledWith(`/admin/changelog?published=${doc._id}`)
    expect(await latestUnseenRelease('user_1')).toMatchObject({ title: 'Faster logging', highlights: ['Quick expense entry', 'Better receipts'] })
    expect(audit).toHaveBeenCalledWith('admin_1', 'changelog.publish', null, expect.objectContaining({ releaseId: String(doc._id) }))
  })

  it('validates server-side and refuses unauthorized writes', async () => {
    const invalid: Record<string, string>[] = [{ title: '' }, { highlights: 'a\nb\nc\nd' }, { highlights: 'x'.repeat(181) }, { body: 'x'.repeat(5001) }]
    for (const values of invalid) {
      expect((await saveChangelogAction(null, form(values)))?.ok).toBe(false)
    }
    expect(await db.collection(CHANGELOG_COLLECTION).countDocuments()).toBe(0)
    admin.mockRejectedValue(new Error('Not an admin'))
    await expect(saveChangelogAction(null, form())).rejects.toThrow('Not an admin')
    await expect(publishChangelogAction(new ObjectId().toHexString(), 1, null, new FormData())).rejects.toThrow('Not an admin')
    await expect(unpublishChangelogAction(new ObjectId().toHexString(), 1, null, new FormData())).rejects.toThrow('Not an admin')
    expect(await db.collection(CHANGELOG_COLLECTION).countDocuments()).toBe(0)
  })

  it('requires the reviewed revision and prevents editing a published update', async () => {
    const doc = await draft()
    const id = String(doc._id)
    expect((await saveChangelogAction(null, form({ id, revision: '1', title: 'Changed draft' })))?.ok).toBe(true)
    expect((await publishChangelogAction(id, 1, null, new FormData()))?.ok).toBe(false)
    await publishChangelogAction(id, 2, null, new FormData())
    expect(redirect).toHaveBeenCalledWith(`/admin/changelog?published=${id}`)
    expect((await saveChangelogAction(null, form({ id, revision: '3' })))?.ok).toBe(false)
    expect((await db.collection(CHANGELOG_COLLECTION).findOne({ _id: doc._id }))?.title).toBe('Changed draft')
  })

  it('unpublishes from both surfaces and does not repeat after republishing', async () => {
    const id = await published()
    const first = await claimRelease('user_1', id)
    expect(first).not.toBeNull()
    await unpublishChangelogAction(id, 2, null, new FormData())
    expect(await publishedChangelog()).toEqual([])
    expect(await claimRelease('user_2', id)).toBeNull()
    await publishChangelogAction(id, 3, null, new FormData())
    expect(await latestUnseenRelease('user_1')).toBeNull()
    expect(await claimRelease('user_1', id)).toBeNull()
    expect((await latestUnseenRelease('user_2'))?.publishedAt).toBe(first?.publishedAt)
  })
})

describe('once per account', () => {
  it('elects exactly one concurrent tab, survives refresh, and isolates accounts', async () => {
    const id = await published()
    const claims = await Promise.all(Array.from({ length: 8 }, () => claimRelease('user_1', id)))
    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(await latestUnseenRelease('user_1')).toBeNull()
    expect(await claimRelease('user_1', id)).toBeNull()
    expect(await claimRelease('user_2', id)).not.toBeNull()
  })

  it('offers a new release and never walks backwards through a backlog', async () => {
    const older = await published()
    const newer = await published()
    await db.collection(CHANGELOG_COLLECTION).updateOne({ _id: new ObjectId(newer) }, { $set: { publishedAt: new Date(Date.now() + 1000) } })
    expect((await latestUnseenRelease('user_1'))?.id).toBe(newer)
    expect(await claimRelease('user_1', older)).toBeNull()
    expect(await claimRelease('user_1', newer)).not.toBeNull()
    expect(await latestUnseenRelease('user_1')).toBeNull()
    expect(await publishedChangelog()).toHaveLength(2)
  })

  it('never announces to missing, deleted, or unonboarded accounts', async () => {
    const id = await published()
    for (const user of ['missing_user', 'new_user', 'deleted_user']) {
      expect(await latestUnseenRelease(user)).toBeNull()
      expect(await claimRelease(user, id)).toBeNull()
    }
  })

  it('rejects signed-out API calls, invalid ids, and forged release ids', async () => {
    await published()
    auth.mockResolvedValue({ userId: 'demo', readOnly: true })
    expect((await GET(new Request('http://test/api/changelog/latest'))).status).toBe(401)
    expect((await POST(new Request('http://test', { method: 'POST' }), { params: Promise.resolve({ id: new ObjectId().toHexString() }) })).status).toBe(401)
    auth.mockResolvedValue({ userId: 'user_1', readOnly: false })
    expect((await POST(new Request('http://test', { method: 'POST' }), { params: Promise.resolve({ id: 'bad-id' }) })).status).toBe(400)
    const response = await POST(new Request('http://test', { method: 'POST' }), { params: Promise.resolve({ id: new ObjectId().toHexString() }) })
    expect(await response.json()).toEqual({ release: null })
    const user = await db.collection('users').findOne({ _id: 'user_1' as never })
    expect(user?.seenWebChangelogIds).toBeUndefined()
  })
})

describe('web and mobile releases', () => {
  it('announces each app only its own newest release, tracked separately', async () => {
    const web = await published()
    const mobile = await published({ platform: 'mobile', version: 'v2.7.0' })
    expect((await latestUnseenRelease('user_1'))?.id).toBe(web)
    expect(await latestUnseenRelease('user_1', 'mobile')).toMatchObject({ id: mobile, platform: 'mobile', version: 'v2.7.0' })
    expect(await claimRelease('user_1', mobile)).not.toBeNull()
    expect(await latestUnseenRelease('user_1', 'mobile')).toBeNull()
    expect((await latestUnseenRelease('user_1'))?.id).toBe(web)
    expect((await publishedChangelog()).map((r) => String(r._id))).toEqual([web])
    const response = await GET(new Request('http://test/api/changelog/latest?platform=mobile'))
    expect(await response.json()).toEqual({ release: null })
    const user = await db.collection('users').findOne({ _id: 'user_1' as never })
    expect(user?.seenMobileChangelogIds).toEqual([mobile])
    expect(user?.seenWebChangelogIds).toBeUndefined()
  })

  it('treats releases saved before platforms existed as web', async () => {
    const id = await published()
    await db.collection(CHANGELOG_COLLECTION).updateOne({ _id: new ObjectId(id) }, { $unset: { platform: '' } })
    expect((await latestUnseenRelease('user_1'))?.platform).toBe('web')
    expect(await latestUnseenRelease('user_1', 'mobile')).toBeNull()
  })

  it('rejects an unknown platform', async () => {
    expect((await saveChangelogAction(null, form({ platform: 'desktop' })))?.ok).toBe(false)
  })

  it('never shows a release to an account created after it was published', async () => {
    const id = await published({ platform: 'mobile' })
    await db.collection('users').insertOne({ _id: 'fresh' as never, onboardedAt: '2026-10-09', createdAt: new Date(Date.now() + 60_000), deleted_at: null })
    expect(await latestUnseenRelease('fresh', 'mobile')).toBeNull()
    expect(await claimRelease('fresh', id)).toBeNull()
    await db.collection('users').updateOne({ _id: 'fresh' as never }, { $set: { createdAt: new Date(Date.now() - 60_000) } })
    expect((await latestUnseenRelease('fresh', 'mobile'))?.id).toBe(id)
    expect(await claimRelease('fresh', id)).not.toBeNull()
  })
})
