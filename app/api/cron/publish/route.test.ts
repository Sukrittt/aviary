import { describe, it, expect, vi, beforeEach } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath }))
const allPosts = vi.fn()
vi.mock('@/lib/blog', () => ({ allPosts, todayInIndia: () => '2026-10-26' }))
const fetchMock = vi.fn(async () => new Response('ok'))
vi.stubGlobal('fetch', fetchMock)

const { GET } = await import('./route')

const req = (bearer?: string) => new Request('https://example.com/api/cron/publish', { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  vi.clearAllMocks()
})

describe('GET /api/cron/publish', () => {
  it('rejects a call without the cron secret', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('wrong'))).status).toBe(401)
  })

  it("revalidates and loads only today's posts, plus the blog index, RSS and sitemap", async () => {
    allPosts.mockResolvedValue([
      { path: '/blog/sinking-funds-india', published: '2026-10-26' },
      { path: '/blog/first-salary-budget', published: '2026-10-15' },
    ])
    const res = await GET(req('test-secret'))
    expect(await res.json()).toEqual({ ok: true, published: ['/blog/sinking-funds-india'] })
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/blog', '/blog/rss.xml', '/sitemap.xml', '/blog/sinking-funds-india'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://www.useaviary.com/blog/sinking-funds-india')
  })

  it('does nothing on a day with no new post', async () => {
    allPosts.mockResolvedValue([{ path: '/blog/first-salary-budget', published: '2026-10-15' }])
    expect(await (await GET(req('test-secret'))).json()).toEqual({ ok: true, published: [] })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
