import { describe, it, expect, vi } from 'vitest'

const command = vi.fn()
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ command }) }))

const { GET } = await import('./route')

describe('GET /api/cron/warm', () => {
  it('pings the database and is never cached, so each ping reaches the function', async () => {
    command.mockResolvedValueOnce({ ok: 1 })
    const res = await GET()
    expect(command).toHaveBeenCalledWith({ ping: 1 })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, db: true })
  })

  it('still answers when the database ping fails', async () => {
    command.mockRejectedValueOnce(new Error('atlas blip'))
    expect(await (await GET()).json()).toEqual({ ok: true, db: false })
  })
})
