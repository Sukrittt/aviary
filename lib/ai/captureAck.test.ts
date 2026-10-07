import { beforeEach, expect, it, vi } from 'vitest'

const generateJSON = vi.fn()
vi.mock('./gemini', () => ({ generateJSON: (...args: unknown[]) => generateJSON(...args) }))
const { captureAck, FALLBACK_ACK } = await import('./captureAck')

const caller = { userId: 'u1', feature: 'capture' as const }
const rows = [{ item: 'Football', category: 'Football' }, { item: 'Food order', category: 'Eating out' }]

beforeEach(() => generateJSON.mockReset())

it('says the model’s reply, with em dashes scrubbed', async () => {
  generateJSON.mockResolvedValue({ reply: 'Football and dinner — both logged.' })
  expect(await captureAck(rows, caller)).toBe('Football and dinner, both logged.')
})

it('falls back to a plain line when the model fails or rambles', async () => {
  generateJSON.mockRejectedValueOnce(new Error('503'))
  expect(await captureAck(rows, caller)).toBe(FALLBACK_ACK)
  generateJSON.mockResolvedValueOnce({ reply: 'x'.repeat(400) })
  expect(await captureAck(rows, caller)).toBe(FALLBACK_ACK)
})

