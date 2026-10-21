// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAuth = vi.fn()
const mockReadOnlyGuard = vi.fn()
const mockIsRateLimited = vi.fn()
const mockBuild = vi.fn()

vi.mock('@/lib/access', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  readOnlyGuard: (...args: unknown[]) => mockReadOnlyGuard(...args),
}))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: async () => null }))
vi.mock('@/lib/systemSettings', () => ({ aiDisabledResponse: async () => null }))
vi.mock('@/lib/ai/allowance', () => ({ aiAllowanceResponse: async () => null }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args) }))
vi.mock('@/lib/statement', async (orig) => ({
  ...(await orig<typeof import('@/lib/statement')>()),
  buildStatementProposal: (...args: unknown[]) => mockBuild(...args),
}))

const { POST } = await import('./route')
const { StatementError } = await import('@/lib/statement')

const jsonReq = (body: unknown) =>
  new Request('https://example.com/api/expenses/statement', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

function fileReq(name: string, content: string, type = 'text/csv') {
  const form = new FormData()
  form.append('file', new File([content], name, { type }))
  return new Request('https://example.com/api/expenses/statement', { method: 'POST', body: form })
}

const img = { data: 'aGVsbG8=', mimeType: 'image/png' }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuth.mockResolvedValue({ userId: 'user_a', readOnly: false, sessionId: null })
  mockReadOnlyGuard.mockReturnValue(null)
  mockIsRateLimited.mockResolvedValue(false)
  mockBuild.mockResolvedValue({ id: 'p1', items: [], credits: 0, dropped: 0 })
})

describe('POST /api/expenses/statement', () => {
  it('reads up to five screenshots', async () => {
    const res = await POST(jsonReq({ images: [img, img] }))
    expect(res.status).toBe(200)
    expect(mockBuild).toHaveBeenCalledWith(expect.anything(), { kind: 'images', images: [img, img] })
  })

  it('turns away a sixth screenshot and a non-image', async () => {
    expect((await POST(jsonReq({ images: Array(6).fill(img) }))).status).toBe(400)
    expect((await POST(jsonReq({ images: [{ data: 'x', mimeType: 'application/pdf' }] }))).status).toBe(400)
    expect(mockBuild).not.toHaveBeenCalled()
  })

  it('sends a csv to the table reader and a pdf to the model', async () => {
    await POST(fileReq('hdfc.csv', 'Date,Narration,Withdrawal Amt.\n'))
    expect(mockBuild.mock.calls[0][1]).toMatchObject({ kind: 'table', filename: 'hdfc.csv' })
    await POST(fileReq('statement.pdf', '%PDF-1.7', 'application/pdf'))
    expect(mockBuild.mock.calls[1][1]).toMatchObject({ kind: 'pdf' })
  })

  it('passes a locked pdf its password, and leaves it off when blank', async () => {
    const form = new FormData()
    form.append('file', new File(['%PDF /Encrypt'], 'statement.pdf', { type: 'application/pdf' }))
    form.append('password', '01011990')
    await POST(new Request('https://example.com/api/expenses/statement', { method: 'POST', body: form }))
    expect(mockBuild.mock.calls[0][1]).toMatchObject({ kind: 'pdf', password: '01011990' })
    form.set('password', '')
    await POST(new Request('https://example.com/api/expenses/statement', { method: 'POST', body: form }))
    expect(mockBuild.mock.calls[1][1]).not.toHaveProperty('password')
  })

  it('names a wrong password, without echoing it back', async () => {
    mockBuild.mockRejectedValue(new StatementError('pdf_password_wrong'))
    const form = new FormData()
    form.append('file', new File(['%PDF /Encrypt'], 'statement.pdf', { type: 'application/pdf' }))
    form.append('password', 'secret123')
    const res = await POST(new Request('https://example.com/api/expenses/statement', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(JSON.stringify({ error: 'pdf_password_wrong' }))
  })

  it('names a locked pdf so the app can ask for its password', async () => {
    mockBuild.mockRejectedValue(new StatementError('pdf_locked'))
    const res = await POST(fileReq('statement.pdf', '%PDF /Encrypt', 'application/pdf'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'pdf_locked' })
  })

  it('names a statement in another currency the same way', async () => {
    mockBuild.mockRejectedValue(new StatementError('other_currency'))
    const res = await POST(fileReq('card.csv', 'Date,Description,Amount (USD)\n'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'other_currency' })
  })

  it('returns 502 when the model fails, and 429 when rate limited', async () => {
    mockBuild.mockRejectedValue(new Error('gemini down'))
    expect((await POST(jsonReq({ images: [img] }))).status).toBe(502)
    mockIsRateLimited.mockResolvedValue(true)
    expect((await POST(jsonReq({ images: [img] }))).status).toBe(429)
  })

  it('returns 403 for the read-only demo user', async () => {
    mockReadOnlyGuard.mockReturnValue(new Response('{}', { status: 403 }))
    expect((await POST(jsonReq({ images: [img] }))).status).toBe(403)
    expect(mockBuild).not.toHaveBeenCalled()
  })
})
