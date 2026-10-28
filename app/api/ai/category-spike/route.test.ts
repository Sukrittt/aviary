import { describe, it, expect, vi, beforeEach } from 'vitest'

const streamText = vi.fn()
let docs: Record<string, unknown>[] = []

vi.mock('@/lib/access', () => ({ getAuth: vi.fn(async () => ({ userId: 'user_1', readOnly: false, sessionId: null, spaceId: 'user_1', spaceOwnerId: 'user_1', spaceRole: 'owner' as const })) }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: vi.fn(async () => null) }))
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: vi.fn(async () => null) }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }))
vi.mock('@/lib/userCurrency', () => ({
  getBudgetCurrency: vi.fn(async () => 'INR'),
  nowForUser: vi.fn(async () => ({ date: '2026-11-02', timestamp: '2026-11-02T10:00:00+05:30' })),
}))
vi.mock('@/lib/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/http')>()),
  getCollection: vi.fn(async () => ({ find: () => ({ toArray: async () => docs }) })),
}))
vi.mock('@/lib/ai/gemini', () => ({ streamText: (...args: unknown[]) => streamText(...(args as [])) }))

const { GET } = await import('./route')

const row = (date: string, category: string, amount_inr: number, item = 'Swiggy') => ({ date, category, amount_inr, item, timestamp: date })
const get = (qs: string) => GET(new Request(`http://localhost/api/ai/category-spike?${qs}`))

beforeEach(() => {
  streamText.mockReset()
  docs = ['2026-07', '2026-08', '2026-09'].flatMap((m) => [row(`${m}-05`, 'Food', 300), row(`${m}-12`, 'Food', 300), row(`${m}-01`, 'Rent', 10000)])
})

describe('GET /api/ai/category-spike', () => {
  it('rejects a malformed month', async () => {
    expect((await get('category=Food&month=Oct')).status).toBe(400)
  })

  it('skips the model when the category is not rising', async () => {
    docs.push(row('2026-10-05', 'Food', 600))
    expect(await (await get('category=Food&month=2026-10')).json()).toEqual({ explanation: null })
    expect(streamText).not.toHaveBeenCalled()
  })

  it('hands the model only computed figures and streams its sentence back', async () => {
    docs.push(row('2026-10-05', 'Food', 300), row('2026-10-20', 'Food', 1500, 'Birthday dinner'))
    streamText.mockResolvedValue((async function* () {
      yield { text: 'Your birthday dinner did it ' }
      yield { text: '— one big night.' }
    })())
    const resp = await get('category=Food&month=2026-10')
    expect(resp.headers.get('Content-Type')).toBe('text/event-stream')
    const frames = (await resp.text()).split('\n\n').filter(Boolean).map((f) => f.slice('data: '.length))
    expect(frames.at(-1)).toBe('[DONE]')
    const said = frames.slice(0, -1).map((f) => JSON.parse(f).delta).join('')
    expect(said).toContain('Your birthday dinner did it')
    expect(said).not.toContain('—')
    const prompt = streamText.mock.calls[0][0] as string
    expect(prompt).toContain('₹1,800 vs a usual ₹600 (up 200%)')
    expect(prompt).toContain('One big spend: Birthday dinner, ₹1,500.')
  })

  it('ends the stream with an error frame when the model breaks off', async () => {
    docs.push(row('2026-10-05', 'Food', 300), row('2026-10-20', 'Food', 1500, 'Birthday dinner'))
    streamText.mockResolvedValue((async function* () {
      yield { text: 'Your birthday' }
      throw new Error('socket hang up')
    })())
    const body = await (await get('category=Food&month=2026-10')).text()
    expect(body.trim().split('\n\n').at(-1)).toBe('data: {"error":"explanation unavailable"}')
  })
})
