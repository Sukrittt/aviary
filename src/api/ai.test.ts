import { describe, expect, it, vi } from 'vitest'
import { allowanceHit } from './ai'
import { track } from '@/src/lib/analytics'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

describe('allowanceHit', () => {
  it('reports a spent allowance and leaves the body readable for the caller', async () => {
    const resp = json({ error: 'spent', code: 'AI_ALLOWANCE_EXCEEDED' }, 429)
    expect(await allowanceHit(resp, 'chat')).toBe(true)
    expect(track).toHaveBeenCalledWith('ai_allowance_hit', { feature: 'chat' })
    expect(await resp.json()).toEqual({ error: 'spent', code: 'AI_ALLOWANCE_EXCEEDED' })
  })

  it('ignores a 429 that is plain rate limiting', async () => {
    vi.mocked(track).mockClear()
    expect(await allowanceHit(json({ error: 'slow down' }, 429), 'scan')).toBe(false)
    expect(track).not.toHaveBeenCalled()
  })
})
