import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateOneMock = vi.fn(async () => ({ modifiedCount: 1 }))
vi.mock('./mongodb', () => ({
  getDb: vi.fn(async () => ({ collection: vi.fn(() => ({ updateOne: updateOneMock })) })),
}))
vi.mock('./workosClient', () => ({ getWorkOSClient: vi.fn() }))

const { markManualTransactionComplete } = await import('./users')

describe('markManualTransactionComplete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('idempotently stamps the milestone using the server clock', async () => {
    await markManualTransactionComplete('user_a')

    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: 'user_a', manualTransactionCompletedAt: { $in: [null, undefined] } },
      { $set: { manualTransactionCompletedAt: expect.any(String) } },
    )
  })
})
