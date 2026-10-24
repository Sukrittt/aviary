import { beforeEach, expect, it, vi } from 'vitest'

const auth = { value: { userId: 'bob', readOnly: false } as { userId: string; readOnly: boolean; accountDeleted?: true } }
vi.mock('@/lib/access', () => ({ getAuth: async () => auth.value }))
vi.mock('@/lib/rateLimit', () => ({ isRateLimited: vi.fn(async () => false) }))
const applyReferral = vi.fn()
const referralSummary = vi.fn(async (_u: string, origin: string) => ({ code: 'K7QM4P', link: `${origin}/r/K7QM4P` }))
vi.mock('@/lib/referrals', () => ({ applyReferral: (...a: unknown[]) => applyReferral(...a), referralSummary: (u: string, o: string) => referralSummary(u, o) }))

const { POST } = await import('./apply/route')
const { GET } = await import('./me/route')
const post = (body: object) => POST(new Request('https://x.test/api/referrals/apply', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => { vi.clearAllMocks(); auth.value = { userId: 'bob', readOnly: false } })

it('applies a typed code', async () => {
  applyReferral.mockResolvedValueOnce('applied')
  const res = await post({ code: 'k7qm4p' })
  expect(res.status).toBe(200)
  expect(applyReferral).toHaveBeenCalledWith('bob', 'k7qm4p', 'manual')
})

it.each([['not_found', 404], ['too_late', 409], ['own_code', 409], ['already_referred', 409], ['blocked', 409]])('answers %s as a code the app can word', async (outcome, status) => {
  applyReferral.mockResolvedValueOnce(outcome)
  const res = await post({ code: 'X1X1X1' })
  expect(res.status).toBe(status)
  expect(await res.json()).toEqual({ error: outcome })
})

it('refuses the signed-out demo', async () => {
  auth.value = { userId: 'demo', readOnly: true }
  expect((await post({ code: 'K7QM4P' })).status).toBe(401)
  expect((await GET(new Request('https://x.test/api/referrals/me'))).status).toBe(401)
})

it('refuses an account in its deletion grace window', async () => {
  auth.value = { userId: 'bob', readOnly: false, accountDeleted: true }
  expect((await post({ code: 'K7QM4P' })).status).toBe(401)
  expect(applyReferral).not.toHaveBeenCalled()
})

it('shares a link on the site the request came to, outside production', async () => {
  const res = await GET(new Request('https://envelope-staging.vercel.app/api/referrals/me'))
  expect((await res.json()).link).toBe('https://envelope-staging.vercel.app/r/K7QM4P')
})
