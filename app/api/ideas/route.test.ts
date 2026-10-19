import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const getAuthMock = vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const }))
vi.mock('@/lib/access', () => ({ getAuth: getAuthMock }))

const isRateLimitedMock = vi.fn(async () => false)
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: isRateLimitedMock }))

const listIdeasMock = vi.fn(async () => [])
const createIdeaMock = vi.fn(async () => ({ id: 'idea_1' }))
const castVoteMock = vi.fn(async (): Promise<unknown> => ({ up: 1, down: 0, score: 1, myVote: 1 }))
vi.mock('@/lib/ideas', async (original) => ({
  ...(await original<typeof import('@/lib/ideas')>()),
  listIdeas: listIdeasMock,
  createIdea: createIdeaMock,
  castVote: castVoteMock,
}))

const { GET, POST } = await import('./route')
const { POST: VOTE } = await import('./[id]/vote/route')

const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const voteParams = { params: Promise.resolve({ id: 'idea_1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  getAuthMock.mockResolvedValue({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })
  isRateLimitedMock.mockResolvedValue(false)
})

describe('GET /api/ideas', () => {
  it('lists with the requested sort and a valid status filter', async () => {
    const res = await GET(new Request('https://x.test/api/ideas?sort=new&status=planned'))
    expect(res.status).toBe(200)
    expect(listIdeasMock).toHaveBeenCalledWith('user_a', { sort: 'new', status: 'planned' })
  })

  it('defaults to top and ignores an unknown status', async () => {
    await GET(new Request('https://x.test/api/ideas?status=bogus'))
    expect(listIdeasMock).toHaveBeenCalledWith('user_a', { sort: 'top', status: undefined })
  })

  it('keeps the board from the signed-out demo user', async () => {
    getAuthMock.mockResolvedValue({ userId: 'demo', readOnly: true, sessionId: null, spaceId: 'demo', spaceOwnerId: 'demo', spaceRole: 'owner' as const })
    expect((await GET(new Request('https://x.test/api/ideas'))).status).toBe(401)
    expect(listIdeasMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/ideas', () => {
  it('creates an idea with a trimmed title and optional details', async () => {
    const res = await POST(post('https://x.test/api/ideas', { title: '  Split bills  ' }))
    expect(res.status).toBe(201)
    expect(createIdeaMock).toHaveBeenCalledWith('user_a', 'Split bills', '')
  })

  it('needs a title', async () => {
    expect((await POST(post('https://x.test/api/ideas', { title: '   ', description: 'x' }))).status).toBe(400)
    expect(createIdeaMock).not.toHaveBeenCalled()
  })

  it('is rate limited like bug reports', async () => {
    isRateLimitedMock.mockResolvedValue(true)
    expect((await POST(post('https://x.test/api/ideas', { title: 'Split bills' }))).status).toBe(429)
    expect(createIdeaMock).not.toHaveBeenCalled()
  })

  it('rejects the demo user', async () => {
    getAuthMock.mockResolvedValue({ userId: 'demo', readOnly: true, sessionId: null, spaceId: 'demo', spaceOwnerId: 'demo', spaceRole: 'owner' as const })
    expect((await POST(post('https://x.test/api/ideas', { title: 'Split bills' }))).status).toBe(401)
  })
})

describe('POST /api/ideas/[id]/vote', () => {
  it.each([1, -1, 0])('passes value %s through', async (value) => {
    const res = await VOTE(post('https://x.test/api/ideas/idea_1/vote', { value }), voteParams)
    expect(res.status).toBe(200)
    expect(castVoteMock).toHaveBeenCalledWith('idea_1', 'user_a', value)
  })

  it.each([2, '1', null, true])('rejects %s', async (value) => {
    expect((await VOTE(post('https://x.test/api/ideas/idea_1/vote', { value }), voteParams)).status).toBe(400)
    expect(castVoteMock).not.toHaveBeenCalled()
  })

  it('404s a missing or hidden idea', async () => {
    castVoteMock.mockResolvedValueOnce(null)
    expect((await VOTE(post('https://x.test/api/ideas/idea_1/vote', { value: 1 }), voteParams)).status).toBe(404)
  })
})
