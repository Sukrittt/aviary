import { beforeEach, expect, it, vi } from 'vitest'

const auth = { value: { userId: 'bob', readOnly: false } as { userId: string; readOnly: boolean } }
vi.mock('@/lib/access', () => ({ getAuth: async () => auth.value }))
const referralSummary = vi.fn(async (_u: string, origin: string) => ({ code: 'K7QM4P', link: `${origin}/r/K7QM4P` }))
vi.mock('@/lib/referrals', () => ({ referralSummary: (u: string, o: string) => referralSummary(u, o) }))

const { GET } = await import('./me/route')

beforeEach(() => { vi.clearAllMocks(); auth.value = { userId: 'bob', readOnly: false } })

it('refuses the signed-out demo', async () => {
  auth.value = { userId: 'demo', readOnly: true }
  expect((await GET(new Request('https://x.test/api/referrals/me'))).status).toBe(401)
})

it('shares a link on the site the request came to, outside production', async () => {
  const res = await GET(new Request('https://envelope-staging.vercel.app/api/referrals/me'))
  expect((await res.json()).link).toBe('https://envelope-staging.vercel.app/r/K7QM4P')
})
