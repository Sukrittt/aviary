import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAuthMock = vi.fn(async () => ({ userId: 'user_a', readOnly: false, sessionId: null }))
const readOnlyGuardMock = vi.fn((): Response | null => null)
vi.mock('@/lib/access', () => ({
  getAuth: getAuthMock,
  readOnlyGuard: readOnlyGuardMock,
}))

const isRateLimitedMock = vi.fn(async () => false)
vi.mock('@/lib/rateLimit', () => ({
  isRateLimited: isRateLimitedMock,
}))

const triageFeedbackMock = vi.fn(async () => ({ area: 'budget' as const, severity: 2 as const }))
vi.mock('@/lib/ai/feedbackTriage', () => ({
  triageFeedback: triageFeedbackMock,
}))

const recordFeedbackMock = vi.fn(async () => undefined)
vi.mock('@/lib/feedback', () => ({
  recordFeedback: recordFeedbackMock,
}))

const { POST } = await import('./route')

function postRequest(body: unknown): Request {
  return new Request('https://example.com/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  type: 'bug',
  title: 'Envelope balance is wrong',
  description: 'Moved money and the target envelope did not update.',
  diagnostics: { appVersion: '1.4.0 (12)', device: 'iPhone 15 · iOS 17.4', screen: '/account/help' },
}

beforeEach(() => {
  getAuthMock.mockClear()
  getAuthMock.mockResolvedValue({ userId: 'user_a', readOnly: false, sessionId: null })
  readOnlyGuardMock.mockClear()
  readOnlyGuardMock.mockReturnValue(null)
  isRateLimitedMock.mockClear()
  isRateLimitedMock.mockResolvedValue(false)
  triageFeedbackMock.mockClear()
  triageFeedbackMock.mockResolvedValue({ area: 'budget', severity: 2 })
  recordFeedbackMock.mockClear()
  recordFeedbackMock.mockResolvedValue(undefined)
})

describe('POST /api/feedback', () => {
  it('records a bug report with the triaged area and severity', async () => {
    const res = await POST(postRequest(validBody))
    expect(res.status).toBe(200)
    expect(triageFeedbackMock).toHaveBeenCalledWith(
      validBody.title,
      validBody.description,
      { userId: 'user_a', feature: 'feedback' },
    )
    expect(recordFeedbackMock).toHaveBeenCalledWith({
      userId: 'user_a',
      type: 'bug',
      title: validBody.title,
      description: validBody.description,
      diagnostics: { appVersion: '1.4.0 (12)', device: 'iPhone 15 · iOS 17.4', screen: '/account/help' },
      area: 'budget',
      severity: 2,
    })
  })

  it('records an idea report with its own type', async () => {
    const res = await POST(postRequest({ ...validBody, type: 'idea', title: 'Dark mode for charts' }))
    expect(res.status).toBe(200)
    expect(recordFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'idea', title: 'Dark mode for charts' }))
  })

  it('still records feedback with a null area/severity when Jev fails', async () => {
    triageFeedbackMock.mockRejectedValue(new Error('gateway down'))

    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    expect(recordFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({ area: null, severity: null }))
  })

  it('rejects an invalid type', async () => {
    const res = await POST(postRequest({ ...validBody, type: 'nonsense' }))
    expect(res.status).toBe(400)
    expect(recordFeedbackMock).not.toHaveBeenCalled()
  })

  it('rejects an empty title', async () => {
    const res = await POST(postRequest({ ...validBody, title: '  ' }))
    expect(res.status).toBe(400)
    expect(recordFeedbackMock).not.toHaveBeenCalled()
  })

  it('rejects an empty description', async () => {
    const res = await POST(postRequest({ ...validBody, description: '' }))
    expect(res.status).toBe(400)
    expect(recordFeedbackMock).not.toHaveBeenCalled()
  })

  it('passes through the read-only guard response for the demo user', async () => {
    const guardResponse = new Response(JSON.stringify({ error: 'read-only in demo mode' }), { status: 403 })
    readOnlyGuardMock.mockReturnValue(guardResponse)
    const res = await POST(postRequest(validBody))
    expect(res.status).toBe(403)
    expect(recordFeedbackMock).not.toHaveBeenCalled()
  })

  it('returns 429 without recording once the rate limit is hit', async () => {
    isRateLimitedMock.mockResolvedValue(true)
    const res = await POST(postRequest(validBody))
    expect(res.status).toBe(429)
    expect(recordFeedbackMock).not.toHaveBeenCalled()
    expect(triageFeedbackMock).not.toHaveBeenCalled()
  })

  it('returns a generic 502 when the insert fails', async () => {
    recordFeedbackMock.mockRejectedValue(new Error('write conflict'))
    const res = await POST(postRequest(validBody))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).not.toMatch(/write conflict/)
  })
})
