// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportError } from '@/lib/import/normalize'

const mockGetAuth = vi.fn()
const mockFindUser = vi.fn()
const previewFile = vi.fn()
const recomputePreview = vi.fn()

vi.mock('@/lib/access', () => ({ getAuth: (...a: unknown[]) => mockGetAuth(...a), readOnlyGuard: () => null }))
vi.mock('@/lib/billing/guard', () => ({ requireAccess: vi.fn(async () => null) }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => ({ findOne: (...a: unknown[]) => mockFindUser(...a) }) }) }))
vi.mock('@/lib/import/service', async (original) => ({
  ...(await original<typeof import('@/lib/import/service')>()),
  previewFile: (...a: unknown[]) => previewFile(...a),
  recomputePreview: (...a: unknown[]) => recomputePreview(...a),
}))

const { POST } = await import('./route')

function upload(bytes: number, name = 'export.csv'): Request {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(bytes)], name))
  return new Request('https://example.com/api/import/preview', { method: 'POST', body: form })
}
const json = (body: unknown) => new Request('https://example.com/api/import/preview', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuth.mockResolvedValue({ userId: 'user_a', readOnly: false, sessionId: null, spaceId: 'user_a', spaceOwnerId: 'user_a', spaceRole: 'owner' as const })
  mockFindUser.mockResolvedValue({ _id: 'user_a', onboardedAt: null })
  previewFile.mockResolvedValue({ importId: 'imp1' })
  recomputePreview.mockResolvedValue({ importId: 'imp1', direction: 'positive_spend' })
})

describe('POST /api/import/preview', () => {
  it('parses an uploaded file into the review', async () => {
    const res = await POST(upload(10, 'Money Manager.xlsx'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ importId: 'imp1' })
    expect(previewFile).toHaveBeenCalledWith(expect.anything(), expect.any(Buffer), 'Money Manager.xlsx')
  })

  it('turns away a file over 4 MB with a code the client writes copy for', async () => {
    const res = await POST(upload(4 * 1024 * 1024 + 1))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too_big' })
    expect(previewFile).not.toHaveBeenCalled()
  })

  it('reports a parse failure as its code, never its text', async () => {
    previewFile.mockRejectedValue(new ImportError('no_columns'))
    const res = await POST(upload(10))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'no_columns' })
  })

  it('recomputes from the stored rows after a flip, without a file', async () => {
    const res = await POST(json({ importId: 'imp1', direction: 'positive_spend' }))
    expect(await res.json()).toMatchObject({ direction: 'positive_spend' })
    expect(recomputePreview).toHaveBeenCalledWith(expect.anything(), 'imp1', { direction: 'positive_spend', currency: undefined })
  })

  it('is onboarding only', async () => {
    mockFindUser.mockResolvedValue({ _id: 'user_a', onboardedAt: '2026-10-01T00:00:00.000Z' })
    const res = await POST(upload(10))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'already_onboarded' })
  })

  it('wants a file or an import id', async () => {
    expect((await POST(json({}))).status).toBe(400)
  })
})
