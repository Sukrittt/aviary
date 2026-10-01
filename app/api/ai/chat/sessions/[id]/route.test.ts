import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/access', () => ({
  getAuth: vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null })),
}))

const findOneMock = vi.fn()
vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>()
  return { ...actual, getCollection: vi.fn(async () => ({ findOne: findOneMock })) }
})

const { GET } = await import('./route')

const ID = '507f1f77bcf86cd799439011'
const at = new Date('2026-09-26T10:00:00Z')
const proposal = {
  id: '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c',
  items: [{ id: 'r1', item: 'Auto', amount: 240, splitWays: 1, date: '2026-09-26', category: 'Travel', categoryConfidence: 1 }],
  skipped: [],
  unparsed: [],
}

function get(id = ID) {
  return GET(new Request(`https://example.com/api/ai/chat/sessions/${id}`), { params: Promise.resolve({ id }) })
}

beforeEach(() => findOneMock.mockReset())

describe('GET /api/ai/chat/sessions/:id', () => {
  it('returns a capture reply with its proposal parsed and its status', async () => {
    findOneMock.mockResolvedValue({
      _id: ID,
      title: 'auto 240',
      createdAt: at,
      updatedAt: at,
      messages: [
        { role: 'user', text: 'auto 240', createdAt: at },
        { role: 'model', text: "Here's what I got.", createdAt: at, proposal: JSON.stringify(proposal), proposalId: proposal.id, proposalStatus: 'submitted', expenseIds: ['e1'] },
      ],
    })

    const body = await (await get()).json()

    expect(body.messages[0]).toEqual({ role: 'user', text: 'auto 240', createdAt: at.toISOString() })
    expect(body.messages[1].proposal).toEqual({ ...proposal, status: 'submitted', expenseIds: ['e1'] })
    // The stored JSON string and bookkeeping fields stay server-side.
    expect(body.messages[1].proposalId).toBeUndefined()
  })

  it('404s a session it cannot find', async () => {
    findOneMock.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
  })
})
