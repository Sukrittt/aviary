import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { signLink, verifyLink } from './links'

beforeEach(() => vi.stubEnv('CRON_SECRET', 'test-secret'))
afterEach(() => vi.unstubAllEnvs())

it('round-trips a signed subject and rejects tampering or another key', () => {
  const token = signLink('u:user_01ABC')
  expect(verifyLink(token)).toBe('u:user_01ABC')
  expect(verifyLink(token.replace('u:user_01ABC', 'u:user_01ABD'))).toBeNull()
  expect(verifyLink(`${token}x`)).toBeNull()
  expect(verifyLink('u:user_01ABC')).toBeNull()
  expect(verifyLink(null)).toBeNull()
  vi.stubEnv('CRON_SECRET', 'rotated')
  expect(verifyLink(token)).toBeNull()
})
