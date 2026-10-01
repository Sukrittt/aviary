import { it, expect, vi } from 'vitest'
const put = vi.fn(async () => ({ url: 'https://example.test/bill.png' }))
const updateOne = vi.fn(async () => ({ matchedCount: 1 }))
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => put(...args as []), issueSignedToken: vi.fn(), presignUrl: vi.fn() }))
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: vi.fn() }) }))
vi.mock('@/lib/scoped', () => ({ scoped: () => ({ updateOne }) }))
import { storeBillScanImage } from './billScan'
it('uploads to the stable pathname used by signed downloads, including retries', async () => {
  await storeBillScanImage('user_a', '507f1f77bcf86cd799439011', 'aGk=', 'image/png')
  expect(put).toHaveBeenCalledWith('bills/user_a/507f1f77bcf86cd799439011.png', expect.any(Buffer), expect.objectContaining({ addRandomSuffix: false, allowOverwrite: true }))
})
