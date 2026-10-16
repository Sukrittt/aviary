import { describe, it, expect, vi, beforeEach } from 'vitest'

const connect = vi.fn()
const close = vi.fn(async () => {})
vi.mock('mongodb', () => ({
  MongoClient: vi.fn(function (this: { connect: typeof connect; close: typeof close }) {
    this.connect = connect
    this.close = close
  }),
}))

const { getClient } = await import('./mongodb')

describe('getClient', () => {
  beforeEach(() => {
    process.env.MONGODB_URI = 'mongodb://db.test'
    delete (globalThis as { _mongoClientPromise?: unknown })._mongoClientPromise
    connect.mockReset()
  })

  it('reuses one connection across calls', async () => {
    connect.mockImplementation(async function (this: unknown) { return this })
    const [a, b] = await Promise.all([getClient(), getClient()])
    expect(a).toBe(b)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  // A blip during a cold start's connect used to stay cached for the life of
  // the instance, failing every later request it served.
  it('connects again after a failed connect instead of keeping the failure', async () => {
    connect.mockRejectedValueOnce(new Error('network blip'))
    await expect(getClient()).rejects.toThrow('network blip')
    expect(close).toHaveBeenCalledTimes(1)

    connect.mockImplementation(async function (this: unknown) { return this })
    await expect(getClient()).resolves.toBeTruthy()
    expect(connect).toHaveBeenCalledTimes(2)
  })
})
