import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const issueSignedToken = vi.fn(async ({ validUntil }: { validUntil: number }) => ({ validUntil }))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  del: vi.fn(),
  issueSignedToken: (o: { pathname: string; validUntil: number }) => issueSignedToken(o),
  presignUrl: async (t: { validUntil: number }, { pathname }: { pathname: string }) => ({ presignedUrl: `https://blob.test/${pathname}?until=${t.validUntil}` }),
}))

const { signPhotoUrl } = await import('./expensePhoto')

const MIN = 60_000

describe('signPhotoUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-16T10:00:00Z') })
    issueSignedToken.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('hands back the same URL while at least half its lifetime is left', async () => {
    const first = await signPhotoUrl('expense-photos/u/a.jpg', 60 * MIN)
    vi.advanceTimersByTime(29 * MIN)
    expect(await signPhotoUrl('expense-photos/u/a.jpg', 60 * MIN)).toBe(first)
    expect(issueSignedToken).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2 * MIN)
    const renewed = await signPhotoUrl('expense-photos/u/a.jpg', 60 * MIN)
    expect(renewed).not.toBe(first)
    expect(issueSignedToken).toHaveBeenCalledTimes(2)
  })

  it('signs each photo and each lifetime separately', async () => {
    await signPhotoUrl('expense-photos/u/b.jpg', 5 * MIN)
    await signPhotoUrl('expense-photos/u/c.jpg', 5 * MIN)
    await signPhotoUrl('expense-photos/u/b.jpg', 60 * MIN)
    expect(issueSignedToken.mock.calls.map(([o]) => o)).toEqual([
      expect.objectContaining({ pathname: 'expense-photos/u/b.jpg', validUntil: Date.now() + 5 * MIN }),
      expect.objectContaining({ pathname: 'expense-photos/u/c.jpg', validUntil: Date.now() + 5 * MIN }),
      expect.objectContaining({ pathname: 'expense-photos/u/b.jpg', validUntil: Date.now() + 60 * MIN }),
    ])
  })

  it('does not keep a failed signing', async () => {
    issueSignedToken.mockRejectedValueOnce(new Error('blob down'))
    await expect(signPhotoUrl('expense-photos/u/d.jpg')).rejects.toThrow('blob down')
    await expect(signPhotoUrl('expense-photos/u/d.jpg')).resolves.toContain('expense-photos/u/d.jpg')
    expect(issueSignedToken).toHaveBeenCalledTimes(2)
  })
})
