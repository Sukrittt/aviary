import { describe, expect, it, vi } from 'vitest'
import { allowanceHit, streamChat, streamSpikeExplanation } from './ai'
import { apiFetch } from './client'
import { track } from '@/src/lib/analytics'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('./client', async (importOriginal) => ({ ...(await importOriginal<typeof import('./client')>()), apiFetch: vi.fn() }))

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

describe('streamChat', () => {
  const sent = async (...capture: [] | [boolean]) => {
    vi.mocked(apiFetch).mockResolvedValue(new Response('data: {"delta":"ok"}\n\n'))
    await streamChat(null, [{ role: 'user', text: 'Bike to turf 42, football 150' }], () => {}, undefined, undefined, ...capture)
    return JSON.parse(vi.mocked(apiFetch).mock.lastCall?.[1]?.body as string)
  }

  it('says when the message came from the log-spends screen, so the server reads it as spends', async () => {
    expect((await sent(true)).capture).toBe(true)
  })

  it('leaves a normal chat for the server to route', async () => {
    expect(await sent()).not.toHaveProperty('capture')
  })
})

describe('streamSpikeExplanation', () => {
  // Split mid-frame on purpose: a network chunk boundary rarely lines up with "\n\n".
  const sse = (...chunks: string[]) => new Response(new ReadableStream({
    start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)); c.close() },
  }), { headers: { 'Content-Type': 'text/event-stream' } })

  it('hands over each delta as it arrives, across chunk boundaries', async () => {
    vi.mocked(apiFetch).mockResolvedValue(sse('data: {"delta":"Most of "}\n\ndata: {"del', 'ta":"it is dinner."}\n\ndata: [DONE]\n\n'))
    const deltas: string[] = []
    expect(await streamSpikeExplanation('Food', '2026-10', (d) => deltas.push(d))).toBe(true)
    expect(deltas).toEqual(['Most of ', 'it is dinner.'])
  })

  it('throws on an error frame', async () => {
    vi.mocked(apiFetch).mockResolvedValue(sse('data: {"delta":"Most"}\n\ndata: {"error":"explanation unavailable"}\n\n'))
    await expect(streamSpikeExplanation('Food', '2026-10', () => {})).rejects.toThrow('explanation unavailable')
  })

  it('says so, without streaming, when the category is not rising', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ explanation: null }), { headers: { 'Content-Type': 'application/json' } }))
    expect(await streamSpikeExplanation('Food', '2026-10', () => {})).toBe(false)
  })
})
