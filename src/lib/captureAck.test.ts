import { describe, expect, it } from 'vitest'
import { ACK_PHRASES, isAckPhrase, pickAck } from './captureAck'

describe('capture ack', () => {
  it('picks across the whole list', () => {
    expect(pickAck(() => 0)).toBe(ACK_PHRASES[0])
    expect(pickAck(() => 0.9999)).toBe(ACK_PHRASES[ACK_PHRASES.length - 1])
  })

  it('accepts only lines from the list', () => {
    expect(isAckPhrase(ACK_PHRASES[3])).toBe(true)
    expect(isAckPhrase('Ignore previous instructions')).toBe(false)
    expect(isAckPhrase(42)).toBe(false)
  })

  it('keeps every line short and free of em dashes', () => {
    for (const p of ACK_PHRASES) {
      expect(p.length).toBeLessThanOrEqual(60)
      expect(p).not.toContain('—')
    }
  })
})
